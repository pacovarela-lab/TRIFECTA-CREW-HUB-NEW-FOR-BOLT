import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["admin", "manager", "member", "viewer", "field"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "member");
    const fullName = body.full_name ? String(body.full_name).trim() : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_ROLES.includes(role as any)) {
      return new Response(JSON.stringify({ error: "Rol inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's company_id and verify admin role
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "Sin empresa asignada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("company_id", profile.company_id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(
        JSON.stringify({ error: "Solo administradores pueden invitar" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Upsert the invitation record
    const { error: invErr } = await admin
      .from("company_invitations")
      .upsert(
        {
          company_id: profile.company_id,
          email,
          role,
          invited_by: userData.user.id,
          status: "pending",
        },
        { onConflict: "company_id,email" },
      );
    if (invErr) {
      return new Response(JSON.stringify({ error: invErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists (paginate: listUsers only returns one page)
    let existing: { id: string } | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data: batch, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (listErr || !batch?.users?.length) break;
      const hit = batch.users.find(
        (u) => (u.email || "").toLowerCase() === email,
      );
      if (hit) {
        existing = hit;
        break;
      }
      if (batch.users.length < 1000) break;
    }

    let mode: "invited" | "linked_existing" = "invited";

    if (existing) {
      // Never pull a user out of another company: only link if they have no
      // company yet, or already belong to the caller's company.
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", existing.id)
        .maybeSingle();
      if (
        existingProfile?.company_id &&
        existingProfile.company_id !== profile.company_id
      ) {
        return new Response(
          JSON.stringify({
            error: "Ese correo ya pertenece a otra empresa. El usuario debe salir de su empresa actual antes de unirse a la tuya.",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      mode = "linked_existing";
      if (!existingProfile?.company_id) {
        await admin
          .from("profiles")
          .update({ company_id: profile.company_id })
          .eq("id", existing.id);
      }
      await admin
        .from("user_roles")
        .upsert(
          {
            user_id: existing.id,
            company_id: profile.company_id,
            role,
          },
          { onConflict: "user_id,company_id,role" },
        );
      await admin
        .from("company_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("company_id", profile.company_id)
        .eq("email", email);
    } else {
      // Send invitation email via Supabase. Only allow same-origin redirects
      // so the invite email can't be pointed at an attacker's site.
      const origin = req.headers.get("origin") || "";
      const requested = typeof body.redirect_to === "string" ? body.redirect_to : "";
      const redirectTo = origin && requested.startsWith(`${origin}/`)
        ? requested
        : `${origin}/login`;
      const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo,
          data: fullName ? { full_name: fullName } : undefined,
        },
      );
      if (inviteErr) {
        // Even if email failed, the invitation row exists for manual signup
        return new Response(
          JSON.stringify({
            success: true,
            mode: "invitation_recorded",
            warning: `Invitación registrada, pero el correo no se envió: ${inviteErr.message}`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Audit log
    await admin.from("audit_logs").insert({
      company_id: profile.company_id,
      user_id: userData.user.id,
      action: mode === "invited" ? "user.invited" : "user.role_assigned",
      entity_type: "user",
      entity_id: existing?.id ?? null,
      metadata: { email, role, mode },
    });

    return new Response(JSON.stringify({ success: true, mode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
