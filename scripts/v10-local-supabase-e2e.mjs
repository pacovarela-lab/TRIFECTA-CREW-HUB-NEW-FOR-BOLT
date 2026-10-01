import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const supabaseCommand = process.platform === "win32" ? "npx.cmd" : "supabase";
const supabaseArgs = process.platform === "win32"
  ? ["supabase", "status", "-o", "env"]
  : ["status", "-o", "env"];
const rawStatus = execFileSync(supabaseCommand, supabaseArgs, {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const local = Object.fromEntries(rawStatus.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z_]+)=(?:"(.*)"|(.*))$/);
  return match ? [[match[1], match[2] ?? match[3]]] : [];
}));
const supabaseUrl = local.API_URL;
const anonKey = local.ANON_KEY ?? local.PUBLISHABLE_KEY;
const serviceKey = local.SERVICE_ROLE_KEY ?? local.SECRET_KEY;
assert.ok(supabaseUrl, "No se encontró la URL de Supabase local");
const url = new URL(supabaseUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  throw new Error("V10 E2E solo puede ejecutarse contra Supabase local");
}
assert.equal(url.protocol, "http:", "V10 E2E requiere el endpoint HTTP local");
assert.ok(anonKey && serviceKey, "No se encontraron las claves efímeras de Supabase local");

const request = async (path, { token = serviceKey, method = "GET", body } = {}) => {
  const response = await fetch(`${url.origin}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
};
const expectStatus = (result, status, label) => {
  assert.equal(result.status, status, `${label}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
};
const projectId = readFileSync("supabase/config.toml", "utf8").match(/project_id\s*=\s*"([^"]+)"/)?.[1];
assert.ok(projectId, "No se encontró project_id para el contenedor local");
const docker = process.platform === "win32"
  ? `${process.env.LOCALAPPDATA}\\Programs\\DockerDesktop\\resources\\bin\\docker.exe`
  : "docker";
const sql = (statement) => execFileSync(docker, [
  "exec", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres",
  "-v", "ON_ERROR_STOP=1", "-c", statement,
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const suffix = randomUUID().slice(0, 8);
const companyA = randomUUID();
const companyB = randomUUID();
const divisionA = randomUUID();
const divisionB = randomUUID();
const projectA = randomUUID();
const categoryA = randomUUID();
const createdUserIds = [];
let report;

const createUser = async (label, companyId, role) => {
  const email = `v10-${label}-${suffix}@local.invalid`;
  const password = `Local-V10-${randomUUID()}!`;
  const created = expectStatus(await request("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true },
  }), 200, `crear ${label}`);
  createdUserIds.push(created.id);
  sql(`
    DELETE FROM public.profiles WHERE id = '${created.id}';
    INSERT INTO public.profiles (id, company_id, email, full_name)
      VALUES ('${created.id}', '${companyId}', '${email}', 'V10 ${label}');
    INSERT INTO public.user_roles (user_id, company_id, role)
      VALUES ('${created.id}', '${companyId}', '${role}');
  `);
  const login = expectStatus(await request("/auth/v1/token?grant_type=password", {
    token: anonKey,
    method: "POST",
    body: { email, password },
  }), 200, `login ${label}`);
  return { token: login.access_token };
};

const transactionHeader = [
  "Date", "Bank Row", "Project / Client", "Vendor / Worker", "Category", "Type",
  "Income", "Cost", "Source", "Review Flag", "Description",
  "User Notes / Preserved Notes", "Original Project / Client", "Original Category",
  "Traceability Status", "Correction Reason",
].join(",");
const packageFor = (bankRow, description) => ({
  "LOVABLE_TRANSACTIONS_V10.csv":
    `${transactionHeader}\n2026-07-01,${bankRow},PV-LOCAL-001,Local Vendor,Materials,GASTO,0,100,BANK_TAGGED,OK,${description},,,,CONFIRMED_BANK_MATCH,`,
  "PROJECT_SUMMARY_V10.csv":
    "Project / Client,Income,Labor,Materials,Other Direct,Overhead,Total Cost,Gross Profit,Margin %\nPV-LOCAL-001,0,0,100,0,0,100,-100,0",
  "PENDING_REVIEW_V10.csv": transactionHeader,
  "CORRECTIONS_APPLIED_V10.csv":
    "Reporting Row,Bank Row,Date,Old Project,New Project,Old Category,New Category,User Note,Reason",
  "HANDOFF_ADJUSTMENTS_V10.csv":
    "Project / Client,Handoff Labor Budget,Actual Labor Before Handoff Adj,Labor Adjustment,Handoff Materials Budget,Actual Materials Before Handoff Adj,Materials Adjustment,Rule",
  "BANK_RECON_CONTROL_V10.csv":
    "Control,Value,Expected/Notes\nCredits Difference,0,Synthetic control\nDebits Difference,0,Synthetic control",
});
const invoke = (token, expectedCompanyId, files) => request("/functions/v1/import-v10-stage", {
  token,
  method: "POST",
  body: { files, expected_company_id: expectedCompanyId },
});

try {
  sql(`
    DELETE FROM public.profiles
      WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'v10-%@local.invalid');
    DELETE FROM public.companies WHERE name LIKE 'V10 Local %';
    DELETE FROM auth.users WHERE email LIKE 'v10-%@local.invalid';
    INSERT INTO public.companies (id, name) VALUES
      ('${companyA}', 'V10 Local A ${suffix}'),
      ('${companyB}', 'V10 Local B ${suffix}');
    INSERT INTO public.divisions (id, company_id, name, slug) VALUES
      ('${divisionA}', '${companyA}', 'General', 'general-a-${suffix}'),
      ('${divisionB}', '${companyB}', 'General', 'general-b-${suffix}');
    INSERT INTO public.projects (id, company_id, division_id, name, project_code)
      VALUES ('${projectA}', '${companyA}', '${divisionA}', 'PV-LOCAL-001', 'PV-LOCAL-001');
    INSERT INTO public.categories (id, company_id, name, kind)
      VALUES ('${categoryA}', '${companyA}', 'Materials', 'expense');
  `);

  const adminA = await createUser("admin-a", companyA, "admin");
  const managerA = await createUser("manager-a", companyA, "manager");
  const memberA = await createUser("member-a", companyA, "member");
  const adminB = await createUser("admin-b", companyB, "admin");
  const adminFiles = packageFor("SYNTH-001", "Synthetic admin expense");
  const managerFiles = packageFor("SYNTH-002", "Synthetic manager expense");

  expectStatus(await invoke(memberA.token, companyA, adminFiles), 403, "miembro bloqueado");
  expectStatus(await invoke(adminA.token, companyB, adminFiles), 403, "compañía cruzada bloqueada");
  expectStatus(await invoke(adminA.token, companyA, {
    ...adminFiles,
    "PENDING_REVIEW_V10.csv": "",
  }), 422, "auxiliar sin encabezados bloqueado");
  expectStatus(await invoke(adminA.token, companyA, {
    ...adminFiles,
    "CORRECTIONS_APPLIED_V10.csv": "",
  }), 422, "correcciones sin encabezados bloqueadas");
  expectStatus(await invoke(adminA.token, companyA, {
    ...adminFiles,
    "HANDOFF_ADJUSTMENTS_V10.csv": "",
  }), 422, "handoff sin encabezados bloqueado");
  expectStatus(await invoke(adminA.token, companyA, {
    ...adminFiles,
    "LOVABLE_TRANSACTIONS_V10.csv": transactionHeader,
  }), 400, "transacciones vacías bloqueadas");
  expectStatus(await invoke(adminA.token, companyA, {
    ...adminFiles,
    "PROJECT_SUMMARY_V10.csv":
      "Project / Client,Income,Labor,Materials,Other Direct,Overhead,Total Cost,Gross Profit,Margin %",
  }), 422, "resumen vacío bloqueado");
  expectStatus(await invoke(adminA.token, companyA, {
    ...adminFiles,
    "BANK_RECON_CONTROL_V10.csv": "Control,Value,Expected/Notes",
  }), 422, "control bancario vacío bloqueado");

  const staged = expectStatus(await invoke(adminA.token, companyA, adminFiles), 200, "stage admin");
  assert.equal(staged.inserted, 1);
  assert.equal(staged.review, 0);
  const managerStaged = expectStatus(
    await invoke(managerA.token, companyA, managerFiles),
    200,
    "stage manager",
  );
  assert.equal(managerStaged.inserted, 1);
  const replay = expectStatus(await invoke(adminA.token, companyA, adminFiles), 200, "replay idempotente");
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.inserted, 0);

  const ownRows = expectStatus(await request(
    `/rest/v1/import_rows?company_id=eq.${companyA}&select=id,company_id,status,stable_key`,
    { token: adminA.token },
  ), 200, "filas tenant A");
  assert.equal(ownRows.length, 2);
  const foreignRows = expectStatus(await request(
    `/rest/v1/import_rows?company_id=eq.${companyA}&select=id`,
    { token: adminB.token },
  ), 200, "aislamiento tenant B");
  assert.equal(foreignRows.length, 0);

  report = {
    localOnly: true,
    cases: 13,
    adminAllowed: true,
    managerAllowed: true,
    memberForbidden: true,
    companyMismatchBlocked: true,
    headerlessAuxiliaryBlocked: true,
    inserted: staged.inserted + managerStaged.inserted,
    idempotentReplay: replay.idempotent_replay,
    tenantBVisibleRowsFromA: foreignRows.length,
    fixturesCleaned: true,
  };
} finally {
  const userIds = createdUserIds.length
    ? createdUserIds.map((id) => `'${id}'`).join(", ")
    : "NULL";
  sql(`
    DELETE FROM public.profiles WHERE id IN (${userIds});
    DELETE FROM public.companies WHERE id IN ('${companyA}', '${companyB}');
    DELETE FROM auth.users WHERE id IN (${userIds});
  `);
}
console.log(JSON.stringify(report, null, 2));
