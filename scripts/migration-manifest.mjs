// Read-only repository audit. No network, database connections, env reads or deploys.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const unique = (values) => [...new Set(values)].sort();
const walk = (directory) => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((item) => {
  const path = `${directory}/${item.name}`;
  return item.isDirectory() ? walk(path) : [path];
}).sort();
const sqlPaths = walk("supabase/migrations").filter((path) => path.endsWith(".sql"));
const edgePaths = walk("supabase/functions");
const codePaths = edgePaths.filter((path) => /\.(ts|tsx)$/.test(path));
const sources = new Map([...sqlPaths, ...edgePaths, "supabase/config.toml", "src/integrations/supabase/types.ts"].map((path) => [path, read(path)]));
const evidence = (paths, pattern) => paths.flatMap((path) => [...sources.get(path).matchAll(pattern)].map((match) => ({
  file: path, line: sources.get(path).slice(0, match.index).split("\n").length,
  value: (match[1] ?? match[0]).replace(/\s+/g, " ").trim(),
})));
const declarations = (kind) => evidence(sqlPaths, new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?${kind}\\s+(?:if\\s+not\\s+exists\\s+)?([\\w".]+)`, "gi"));
const tableDeclarations = declarations("table");
const qualified = (value) => value.includes(".") ? value.replaceAll('"', "") : `public.${value.replaceAll('"', "")}`;
const tableNames = unique(tableDeclarations.map(({ value }) => qualified(value)));
const functionDeclarations = declarations("function");
const viewDeclarations = declarations("(?:materialized\\s+)?view");
const typeSource = sources.get("src/integrations/supabase/types.ts");
const tableTypeSource = typeSource.split("    Tables: {")[1].split("    Views: {")[0];
const typedTables = [...tableTypeSource.matchAll(/^      (\w+): \{\n([\s\S]*?)^      \}/gm)].map((match) => ({
  name: `public.${match[1]}`,
  columns: [...(match[2].match(/Row: \{\n([\s\S]*?)        \}/)?.[1] ?? "").matchAll(/^          (\w+): (.+)$/gm)].map((column) => ({ name: column[1], type: column[2] })),
  dependencies: unique([...match[2].matchAll(/referencedRelation: "([^"]+)"/g)].map((ref) => qualified(ref[1]))),
}));
const sqlForeignKeys = sqlPaths.flatMap((path) => [...sources.get(path).matchAll(/(?:create\s+table\s+(?:if\s+not\s+exists\s+)?|alter\s+table\s+(?:if\s+exists\s+)?)([\w".]+)([\s\S]*?);/gi)].flatMap((table) =>
  [...table[2].matchAll(/\breferences\s+([\w".]+)/gi)].map((ref) => ({ table: qualified(table[1]), references: qualified(ref[1]), file: path, line: sources.get(path).slice(0, table.index).split("\n").length }))),
);
const dataTables = tableNames.map((name) => {
  const typed = typedTables.find((table) => table.name === name);
  return {
    name, columnsFromGeneratedTypes: typed?.columns ?? null,
    dependencies: unique([...(typed?.dependencies ?? []), ...sqlForeignKeys.filter((fk) => fk.table === name).map((fk) => fk.references)]),
    tenantKey: typed?.columns.some((column) => column.name === "company_id") ? "company_id" : name === "public.companies" ? "id" : "catalog verification required",
    copy: name === "private.google_oauth_states" ? "do not replay transient OAuth state; invalidate pending authorizations" : "candidate: preserve primary keys and original timestamps; verify live catalog before copy",
    sourceRowCount: null, targetRowCount: null,
  };
});
const pending = new Set(tableNames);
const copyLayers = [];
while (pending.size) {
  const ready = dataTables.filter((table) => pending.has(table.name) && !table.dependencies.some((name) => pending.has(name))).map((table) => table.name);
  if (!ready.length) break;
  copyLayers.push(ready);
  ready.forEach((name) => pending.delete(name));
}

const config = sources.get("supabase/config.toml");
const jwtOverrides = new Map([...config.matchAll(/\[functions\.([^\]]+)\]\s*verify_jwt\s*=\s*(true|false)/g)].map((match) => [match[1], match[2] === "true"]));
const localImports = (path) => [...sources.get(path).matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)].map((match) => relative(root, resolve(root, dirname(path), match[1])).replaceAll("\\", "/"));
const closure = (path, visited = new Set()) => {
  if (visited.has(path) || !sources.has(path)) return visited;
  visited.add(path);
  localImports(path).forEach((imported) => closure(imported, visited));
  return visited;
};
const edgeFunctions = codePaths.filter((path) => /^supabase\/functions\/[^_/][^/]*\/index\.ts$/.test(path)).map((path) => {
  const name = path.split("/")[2];
  const files = [...closure(path)].sort();
  const requiredEnvironment = unique(evidence(files, /Deno\.env\.get\(["']([^"']+)["']\)/g).map(({ value }) => value));
  return {
    name, entrypoint: path, sourceSha256: hash(sources.get(path)), sourceFiles: files,
    verifyJwtInGit: jwtOverrides.get(name) ?? "CLI default (true); deployed setting unverified",
    requiredEnvironment, serviceRoleUsage: requiredEnvironment.includes("SUPABASE_SERVICE_ROLE_KEY"),
    directTableReferences: unique(evidence(files, /(?<!storage)\.from\(["']([^"']+)["']\)/g).map(({ value }) => value)),
    storageBucketReferences: unique(evidence(files, /storage\.from\(["']([^"']+)["']\)/g).map(({ value }) => value)),
    directRpcReferences: unique(evidence(files, /\.rpc\(["']([^"']+)["']/g).map(({ value }) => value)),
    deployed: null, deployedVersion: null, productionSecretsPresent: null,
  };
});
const classification = (file) => {
  if (/\/(ai-query|estimate-photo-analyze|process-receipt|voice-to-expense)\//.test(file)) return { category: "A", meaning: "Lovable AI Gateway credential; preserve extraction contract while replacing transport" };
  if (/auth-email-hook/.test(file)) return { category: "B", meaning: "Lovable email webhook signature and preview authorization; queues auth email for an untracked dispatcher" };
  if (/preview-transactional-email/.test(file)) return { category: "B", meaning: "Lovable email preview authorization; does not itself send email" };
  if (/feedback-alert-send|transactional-email-templates\/send-email/.test(file)) return { category: "B", meaning: "Lovable transactional email transport or its configuration guard" };
  return { category: "D", meaning: "unclassified: investigate before cutover" };
};
const lovableUses = evidence(codePaths, /\b(LOVABLE_API_KEY|LOVABLE_SEND_URL)\b/g).map((item) => ({ ...item, ...classification(item.file), kind: sources.get(item.file).split("\n")[item.line - 1].trim().startsWith("//") ? "comment" : "runtime" }));
const rpcNames = unique(functionDeclarations.map(({ value }) => value.split(".").at(-1).replaceAll('"', "")));
const runtimeRpcNames = unique(edgeFunctions.flatMap((fn) => fn.directRpcReferences));
const knownRelations = new Set([...tableNames, ...viewDeclarations.map(({ value }) => qualified(value))]);
const manifest = {
  schemaVersion: 1,
  scope: "Static repository evidence only. Declarations can be superseded, dropped or dynamic. This is not a production catalog or a runnable migration.",
  repository: "pacovarela-lab/trifecta-flow-pro",
  baseCommit: execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: root, encoding: "utf8" }).trim(),
  auditedCodeCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  source: { projectRef: "jejuyjesfhwkzfgfuozb", role: "source only; no writes performed", liveCatalogInspected: false },
  target: { projectRef: null, ownerApproved: false, status: "BLOCKED: owner-controlled target ref required" },
  prohibitedTargets: ["ufzqonxjgmwyutljhbfw", "0ec90b57d6e95fcbda19832f"],
  cutoverAllowed: false,
  database: {
    migrationCount: sqlPaths.length,
    migrations: sqlPaths.map((path, index) => ({ order: index + 1, path, sha256Lf: hash(sources.get(path)) })),
    replayVerified: false, productionDrift: "unknown until live catalog comparison",
    extensions: declarations("extension"), schemas: declarations("schema"), tables: tableDeclarations, views: viewDeclarations,
    indexes: declarations("(?:unique\\s+)?index"), types: declarations("type"), sequences: declarations("sequence"),
    functionsAndRpcCandidates: functionDeclarations,
    triggers: evidence(sqlPaths, /\bcreate\s+(?:constraint\s+)?trigger\s+([\w"]+[\s\S]*?\bexecute\s+(?:function|procedure)\s+[\w.]+)/gi),
    grantsAndRevokes: evidence(sqlPaths, /\b((?:grant|revoke)\s+[^;]+);/gi),
    defaultPrivileges: evidence(sqlPaths, /\b(alter\s+default\s+privileges[^;]+);/gi),
    rls: evidence(sqlPaths, /\b(alter\s+table\s+[\w".]+\s+(?:(?:enable|disable|force|no\s+force)\s+row\s+level\s+security))/gi),
    policies: evidence(sqlPaths, /\b(create\s+policy\s+(?:"[^"]+"|[\w]+)\s+on\s+[\w".]+)/gi),
    dynamicSql: evidence(sqlPaths, /\b(EXECUTE\s+format\([^\n]+)/gi),
    dataMutationEvidence: evidence(sqlPaths, /^\s*((?:insert\s+into|update|delete\s+from|truncate)\s+[\w".]+)/gim),
    requiredLiveChecks: ["migration history and schema diff", "pg_extension", "pg_proc definitions and owners", "pg_trigger including enabled state", "pg_policies expressions and roles", "RLS enabled and forced", "grants/default ACLs", "enum/index/view definitions", "function search_path and SECURITY DEFINER", "sequence/identity current values"],
  },
  auth: {
    frontend: "native Supabase password and Google OAuth; SDK implicit callback detection and persistent browser storage",
    providers: { google: "required; live enabled/client ID/secret unverified", emailPassword: "required; live settings unverified", others: "unknown" },
    targetConfiguration: { siteUrl: "approved frontend origin (unknown)", additionalRedirectUrls: ["<approved-frontend-origin>/login", "<approved-frontend-origin>/"], googleAuthorizedRedirectUri: "https://<approved-target-ref>.supabase.co/auth/v1/callback" },
    settings: { signup: null, emailConfirmation: null, mfa: null, captcha: null, rateLimits: null, jwtLifetime: null, smtp: null },
    templatesAndHooks: edgePaths.filter((path) => /email-templates|auth-email-hook/.test(path)),
    users: { sourceCount: null, migrated: false, constraints: ["Preserve auth.users IDs and identity/provider links before public profiles/roles", "Use an approved Supabase Auth migration method; do not invent password hashes or copy session/JWT signing secrets", "Existing sessions must reauthenticate on the target", "Prevent signup triggers from generating duplicate profiles/companies during import", "Preserve email confirmation state and audit MFA/identities using restricted exports"] },
  },
  storage: {
    bucketsFromGit: [
      { id: "receipts", public: false, sizeLimit: "not specified in Git", allowedMimeTypes: "not specified in Git", paths: "company_id/...; inspect effective policies" },
      { id: "estimate-images", public: false, sizeLimit: 10485760, allowedMimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"], paths: "company_id/estimate_id/image_id.ext", note: "later migration additionally enforces MIME through object RLS; production bucket settings unverified" },
    ],
    configurationEvidence: evidence(sqlPaths, /\b((?:insert\s+into|update)\s+storage\.buckets[\s\S]*?);/gi),
    policyEvidence: evidence(sqlPaths, /\b(create\s+policy\s+(?:"[^"]+"|[\w]+)\s+on\s+storage\.objects)/gi),
    existingObjects: { enumerated: false, count: null, bytes: null, hashes: null },
    copyRequirements: ["inventory all buckets including production-only buckets", "copy object bytes through supported storage API; do not copy storage.objects metadata alone", "preserve path, content-type and company ownership", "compare count, byte length and SHA-256 per object", "regenerate signed URLs and audit persisted source-host URLs"],
  },
  edge: { count: edgeFunctions.length, functions: edgeFunctions, sourceFiles: edgePaths.map((path) => ({ path, sha256Lf: hash(sources.get(path)) })), deployedInventoryVerified: false },
  runtime: {
    lovableUses,
    historicalFrontendNames: { category: "C", files: ["src/pages/ImportV10.tsx", "src/lib/v10Import.ts"], reason: "Legacy ZIP/CSV filenames are part of the V10 import contract; they do not call a Lovable service and must not be renamed as cosmetic cleanup" },
    externalSocialImage: { file: "index.html", status: "external R2-hosted social preview image with historical Lovable filename; ownership not audited, replace with owner-controlled asset before declaring all assets independent" },
    lovablePackages: evidence(codePaths, /["'](npm:@lovable\.dev\/[^"']+)["']/g),
    ai: { endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions", modelsFromCode: ["google/gemini-2.5-flash", "google/gemini-2.5-pro (receipt retry)"], replacement: "not selected or authorized; preserve prompts, parsing, retries, null money and human confirmation; independent credential required", realProviderSmoke: false },
    email: { replacement: "not selected or authorized", missingRepositoryComponents: ["public.email_send_log", "public.enqueue_email", "process-email-queue dispatcher"], senderDomain: "notify.trifectaportal.app", fromDomain: "trifectaportal.app", dnsOwnershipAndTransportVerified: false },
    cronEvidence: evidence(sqlPaths, /\b(cron\.(?:schedule|unschedule)\([\s\S]*?);/gi),
    vaultNames: unique(evidence(sqlPaths, /\bname\s*=\s*'([^']+)'/g).filter(({ file }) => /vault\.decrypted_secrets/.test(sources.get(file))).map(({ value }) => value)),
    hardcodedSourceEndpoints: evidence(sqlPaths, /(https:\/\/jejuyjesfhwkzfgfuozb\.supabase\.co[^'"\s]*)/g),
    schedulesDeployed: null, productionOnlySettings: "unknown", environmentValues: "not read or stored; secret names only",
    unresolvedRpcReferences: runtimeRpcNames.filter((name) => !rpcNames.includes(name)),
    unresolvedTableReferences: unique(edgeFunctions.flatMap((fn) => fn.directTableReferences)).filter((name) => !knownRelations.has(qualified(name))),
  },
  data: {
    status: "design only; no source export or target import executed",
    tables: dataTables, foreignKeyEvidence: sqlForeignKeys,
    copyOrder: { status: "candidate only; generated types and textual SQL evidence, must replace with verified pg_constraint graph", externalPrerequisites: unique(dataTables.flatMap((table) => table.dependencies).filter((name) => !tableNames.includes(name))), layers: copyLayers, cyclicOrBlockedTables: [...pending].sort() },
    sequencesAndIdentity: { verified: false, evidence: evidence(sqlPaths, /\b([\w]+\s+(?:bigserial|serial|smallserial|[\w]+\s+generated\s+(?:always|by\s+default)\s+as\s+identity))/gi), rule: "capture all catalog sequence states and restore target-only after import; verify next values exceed copied maxima" },
    invariants: ["consistent source snapshot plus final write freeze or verified incremental catch-up", "tenant allowlist and company_id assertions on every chunk", "preserve UUIDs, FKs, created_at and updated_at", "encrypted exports outside Git; per-table/chunk hashes and resumable checkpoint", "primary-key idempotency with exact existing-row comparison; stop on conflicting data", "no replay of sent email/SMS/outbox side effects", "no source writes, schema changes or trigger disabling", "target trigger suppression must be explicit and target-only; do not disable security globally", "compare exact per-tenant row counts, canonical row hashes and decimal financial totals", "recreate project_financial_ledger as a VIEW; never import it as a table"],
    financialValidation: { sourceVsTarget: null, requiredDelta: "0.00", currency: "USD default; compare each recorded currency separately", tablesAndViews: ["expenses", "payments", "worker_checkins", "project_financial_ledger"], estimateAiUnintendedWritesAllowed: false },
  },
  blockers: [
    "No approved owner-controlled target project ref",
    "Live source catalog/Auth/Storage/deployed-functions/config inventory not captured",
    "Historical feedback trigger dispatches to source production; do not replay into a writable target without a target-only correction and egress controls",
    "Auth email queue/table/dispatcher dependencies are absent from Git",
    "Independent AI and email credentials/providers not configured",
    "Native Google OAuth requires target provider configuration and real-account smoke",
    "No production data reconciliation or cross-tenant target tests yet",
    "Final owner cutover approval absent",
  ],
};
const output = `${JSON.stringify(manifest, null, 2)}\n`;
const destination = resolve(root, "docs/migration/lovable-exit-manifest.json");
if (process.argv.includes("--check")) {
  // Commit metadata is informational and may advance after the audit commit itself.
  const stored = JSON.parse(readFileSync(destination, "utf8"));
  stored.auditedCodeCommit = manifest.auditedCodeCommit;
  if (JSON.stringify(stored, null, 2) + "\n" !== output) throw new Error("Migration manifest is stale; regenerate it from the audited repository.");
} else {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, output);
}
console.log(JSON.stringify({ migrations: sqlPaths.length, edgeFunctions: edgeFunctions.length, candidateTables: dataTables.length, classifiedLovableUses: lovableUses.length, targetApproved: false, cutoverAllowed: false }));
