import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

export const statePath = new URL("./.state.json", import.meta.url);
export type Tenant = { companyId: string; divisionId: string; projectId: string; workerId: string; userId: string; email: string; password: string; name: string };
export type E2eState = { tenants: Tenant[] };

const env = () => {
  const unquote = (value: string | undefined) => value?.replace(/^"(.*)"$/, "$1");
  const url = unquote(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL);
  const key = unquote(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url?.startsWith("http://127.0.0.1:") || !key) throw new Error("E2E requires local Supabase only");
  return { url, key };
};

export async function admin(path: string, init: RequestInit = {}) {
  const { url, key } = env();
  const response = await fetch(`${url}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const docker = process.platform === "win32"
  ? `${process.env.LOCALAPPDATA}\\Programs\\DockerDesktop\\resources\\bin\\docker.exe`
  : "docker";
const container = "supabase_db_jejuyjesfhwkzfgfuozb";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const sql = (statement: string) => execFileSync(docker, ["exec", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At", "-c", statement], { encoding: "utf8" }).trim();
export const queryJson = (query: string) => JSON.parse(sql(`select coalesce(json_agg(row_to_json(q)),'[]'::json) from (${query}) q;`) || "[]");
export async function userRows(tenant: Tenant, table: string, query = "select=*") {
  const { url } = env();
  const anon = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.replace(/^"(.*)"$/, "$1");
  if (!anon) throw new Error("Missing local anon key");
  const signedIn = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: tenant.email, password: tenant.password }) });
  const session = await signedIn.json();
  if (!signedIn.ok) throw new Error(`E2E sign-in failed: ${signedIn.status}`);
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`E2E user query failed: ${response.status} ${text}`);
  return JSON.parse(text);
}

export async function seedTenant(label: string): Promise<Tenant> {
  const suffix = randomUUID().slice(0, 8);
  const companyId = randomUUID(), divisionId = randomUUID(), projectId = randomUUID(), workerId = randomUUID();
  const email = `e2e-${label}-${suffix}@local.invalid`, password = `Local-E2E-${randomUUID()}!`, name = `E2E ${label} ${suffix}`;
  sql(`
    insert into public.companies(id,name,slug,timezone,sms_enabled,google_calendar_enabled,mobile_offline_expenses_enabled,product_feedback_enabled,trial_mode_enabled)
      values (${literal(companyId)},${literal(name)},${literal(`e2e-${label}-${suffix}`)},'America/New_York',false,false,true,true,true);
    insert into public.company_invitations(company_id,email,role) values (${literal(companyId)},${literal(email)},'admin');
  `);
  const user = await admin("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) });
  sql(`
    insert into public.divisions(id,company_id,name,slug) values (${literal(divisionId)},${literal(companyId)},'General',${literal(`general-${suffix}`)});
    insert into public.projects(id,company_id,division_id,name,project_type,status) values (${literal(projectId)},${literal(companyId)},${literal(divisionId)},${literal(`${name} Project`)},'other','active');
    insert into public.categories(company_id,name,kind) values (${literal(companyId)},'E2E Materials','expense');
    insert into public.workers(id,company_id,user_id,name,active) values (${literal(workerId)},${literal(companyId)},${literal(user.id)},${literal(`${name} Worker`)},true);
  `);
  return { companyId, divisionId, projectId, workerId, userId: user.id, email, password, name };
}

export const saveState = (state: E2eState) => writeFile(statePath, JSON.stringify(state), "utf8");
export const loadState = async (): Promise<E2eState> => JSON.parse(await readFile(statePath, "utf8"));
