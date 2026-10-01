import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const supabaseCommand = process.platform === "win32" ? process.env.ComSpec : "supabase";
const supabaseArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", "npx.cmd supabase status -o env"]
  : ["status", "-o", "env"];
const hasSuppliedLocalEnvironment = process.env.API_URL &&
  (process.env.ANON_KEY || process.env.PUBLISHABLE_KEY) &&
  (process.env.SERVICE_ROLE_KEY || process.env.JWT_SECRET);
const rawStatus = hasSuppliedLocalEnvironment
  ? Object.entries(process.env).filter(([name]) => [
    "API_URL", "ANON_KEY", "PUBLISHABLE_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET",
  ].includes(name)).map(([name, value]) => `${name}="${value}"`).join("\n")
  : execFileSync(supabaseCommand, supabaseArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const local = Object.fromEntries(rawStatus.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z_]+)=(?:"(.*)"|(.*))$/);
  return match ? [[match[1], match[2] ?? match[3]]] : [];
}));
const supabaseUrl = local.API_URL;
const apiKey = local.ANON_KEY ?? local.PUBLISHABLE_KEY;
const jwtSecret = local.JWT_SECRET;
const jwtFor = (role, sub) => {
  assert.ok(jwtSecret, `JWT_SECRET is required to create the local ${role} test token`);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ role, sub, iss: "supabase-demo", exp: Math.floor(Date.now() / 1000) + 3600 });
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
};
const anonToken = local.ANON_KEY ?? jwtFor("anon");
const serviceKey = local.SERVICE_ROLE_KEY ?? jwtFor("service_role");
assert.ok(supabaseUrl && apiKey && serviceKey, "Local Supabase credentials are unavailable");
const url = new URL(supabaseUrl);
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "OAuth RPC tests require local Supabase");

const projectId = readFileSync("supabase/config.toml", "utf8").match(/project_id\s*=\s*"([^"]+)"/)?.[1];
assert.ok(projectId, "Local Supabase project_id is unavailable");
const docker = process.platform === "win32"
  ? `${process.env.LOCALAPPDATA}\\Programs\\DockerDesktop\\resources\\bin\\docker.exe`
  : "docker";
const psqlArgs = ["exec", `supabase_db_${projectId}`, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
const sql = (statement) => execFileSync(docker, [...psqlArgs, "-c", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const sqlTests = readFileSync("scripts/google-oauth-state-rpc-local.sql", "utf8");
execFileSync(docker, psqlArgs, { input: sqlTests, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] });

const request = async (path, { token = serviceKey, method = "POST", body, headers = {} } = {}) => {
  const response = await fetch(`${url.origin}${path}`, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
};
const expectStatus = (result, expected, label) => {
  assert.ok([expected].flat().includes(result.status), `${label}: HTTP ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
};
const stateHash = () => randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "").slice(0, 11);
const userId = randomUUID();
const companyId = randomUUID();
const email = `oauth-rpc-${randomUUID().slice(0, 8)}@local.invalid`;
const authenticatedToken = jwtFor("authenticated", userId);

try {
  sql(`INSERT INTO auth.users(id,email) VALUES ('${userId}','${email}');
       INSERT INTO public.companies(id,name) VALUES ('${companyId}','OAuth RPC Local');`);

  const rpcPath = "/rest/v1/rpc/create_google_oauth_state";
  const createBody = (hash) => ({
    p_state_hash: hash,
    p_user_id: userId,
    p_company_id: companyId,
    p_encrypted_code_verifier: "encrypted-local-verifier",
    p_redirect_uri: "https://example.invalid/callback",
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });

  expectStatus(await request(rpcPath, { token: anonToken, body: createBody(stateHash()) }), [401, 403], "anon RPC denied");
  expectStatus(await request(rpcPath, { token: authenticatedToken, body: createBody(stateHash()) }), 403, "authenticated RPC denied");

  const directPrivate = await request("/rest/v1/google_oauth_states?select=state_hash&limit=0", {
    method: "GET",
    headers: { "Accept-Profile": "private" },
  });
  expectStatus(directPrivate, 406, "private remains outside Data API");
  assert.equal(directPrivate.data?.code, "PGRST106");

  const singleUseHash = stateHash();
  expectStatus(await request(rpcPath, { body: createBody(singleUseHash) }), [200, 204], "service_role creates state");
  expectStatus(await request("/rest/v1/rpc/consume_google_oauth_state", {
    body: { p_state_hash: singleUseHash },
  }), 200, "service_role consumes state");
  const replay = await request("/rest/v1/rpc/consume_google_oauth_state", { body: { p_state_hash: singleUseHash } });
  expectStatus(replay, 400, "replay rejected");
  assert.equal(replay.data?.message, "oauth_state_already_used");

  const expiredHash = stateHash();
  sql(`INSERT INTO private.google_oauth_states(state_hash,user_id,company_id,encrypted_code_verifier,redirect_uri,expires_at)
       VALUES ('${expiredHash}','${userId}','${companyId}','encrypted','https://example.invalid/callback',clock_timestamp()-interval '1 minute');`);
  const expired = await request("/rest/v1/rpc/consume_google_oauth_state", { body: { p_state_hash: expiredHash } });
  expectStatus(expired, 400, "expired state rejected");
  assert.equal(expired.data?.message, "oauth_state_expired");

  const missing = await request("/rest/v1/rpc/consume_google_oauth_state", { body: { p_state_hash: stateHash() } });
  expectStatus(missing, 400, "missing state rejected");
  assert.equal(missing.data?.message, "oauth_state_not_found");

  const concurrentHash = stateHash();
  expectStatus(await request(rpcPath, { body: createBody(concurrentHash) }), [200, 204], "create concurrent state");
  const concurrent = await Promise.all([
    request("/rest/v1/rpc/consume_google_oauth_state", { body: { p_state_hash: concurrentHash } }),
    request("/rest/v1/rpc/consume_google_oauth_state", { body: { p_state_hash: concurrentHash } }),
  ]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 400], "exactly one concurrent consumer wins");
  assert.equal(concurrent.find(({ status }) => status === 400)?.data?.message, "oauth_state_already_used");

  console.log(JSON.stringify({
    ok: true,
    sql_permissions: "passed",
    private_exposed: false,
    single_use: "passed",
    expired: "passed",
    missing: "passed",
    concurrent_consumers: "one_of_two",
  }, null, 2));
} finally {
  sql(`DELETE FROM private.google_oauth_states WHERE user_id='${userId}';
       DELETE FROM auth.users WHERE id='${userId}';
       DELETE FROM public.companies WHERE id='${companyId}';`);
}
