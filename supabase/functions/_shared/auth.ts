// Shared auth helpers for edge functions. Validates JWT and (optionally) checks
// company membership and role via the anon-key client so RLS is respected.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AppRole = "admin" | "manager" | "member" | "viewer" | "field";

export interface AuthedCaller {
  user: { id: string; email?: string | null };
  companyId: string | null;
  roles: AppRole[];
  authClient: SupabaseClient;
}

export const corsAuthHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsAuthHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * Validates the incoming JWT and (if requested) resolves the caller's company
 * membership and roles. Returns null + a Response when the caller is not
 * authorized so handlers can early-return.
 */
export async function requireAuth(req: Request, opts: { requireMembership?: boolean } = {}): Promise<
  { ok: true; caller: AuthedCaller } | { ok: false; response: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: jsonResponse({ error: "UNAUTHORIZED" }, 401) };
  }
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return { ok: false, response: jsonResponse({ error: "UNAUTHORIZED" }, 401) };
  }
  const user = { id: data.user.id, email: data.user.email };

  // Resolve profile + roles using the caller's own credentials (RLS applies).
  const { data: profile } = await authClient
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  const companyId = profile?.company_id ?? null;

  let roles: AppRole[] = [];
  if (companyId) {
    const { data: roleRows } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId);
    roles = (roleRows ?? []).map((r: any) => r.role as AppRole);
  }

  if (opts.requireMembership && !companyId) {
    return { ok: false, response: jsonResponse({ error: "FORBIDDEN_NO_COMPANY" }, 403) };
  }

  return { ok: true, caller: { user, companyId, roles, authClient } };
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}
