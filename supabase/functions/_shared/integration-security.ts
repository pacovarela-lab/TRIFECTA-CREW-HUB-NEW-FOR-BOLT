import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCompanyContext } from "./integration-http.ts";
export { CORS_METHODS, corsHeaders, corsPreflight, json, resolveCompanyContext } from "./integration-http.ts";

export function redactPhone(value: string) {
  return value.length < 7 ? "***" : `${value.slice(0, 3)}******${value.slice(-4)}`;
}
export async function authenticated(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("unauthorized");
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("unauthorized");
  const requestedCompany = req.headers.get("x-company-id");
  const { data: memberships, error: membershipError } = await client.from("user_roles")
    .select("company_id,role").eq("user_id", user.id);
  if (membershipError) throw new Error("company_membership_required");
  const companyId = resolveCompanyContext(memberships ?? [], requestedCompany);
  const role = memberships?.find((membership) => membership.company_id === companyId)?.role;
  return { client, user, companyId, role: role as string };
}

export function administrativeClient() {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) throw new Error("server_configuration_pending");
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } });
}

export async function featureEnabled(client: ReturnType<typeof createClient>, companyId: string, flag: string) {
  const { data, error } = await client.from("companies").select(flag).eq("id", companyId).single();
  if (error) throw error;
  return data?.[flag] === true;
}

export function integrationMode(_name: "sms" | "google") {
  return "disabled" as const;
}
