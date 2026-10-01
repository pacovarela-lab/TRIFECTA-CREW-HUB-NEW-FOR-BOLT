import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isAllowedZeroCashWithdrawal } from "../_shared/v10-zero-value.ts";
import {
  distributeSplitComponents,
  isV10IncomeRow,
  isV10NonProjectCenter,
  isV10OwnerMovement,
  isV10ReviewFlagged,
  resolveV10ProjectKey,
  roundV10,
} from "../_shared/v10-aliases.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CsvRow = Record<string, string>;
type ParsedCsv = { headers: string[]; rows: CsvRow[] };
const requiredFiles = [
  "LOVABLE_TRANSACTIONS_V10.csv",
  "PROJECT_SUMMARY_V10.csv",
  "PENDING_REVIEW_V10.csv",
  "CORRECTIONS_APPLIED_V10.csv",
  "HANDOFF_ADJUSTMENTS_V10.csv",
  "BANK_RECON_CONTROL_V10.csv",
];
const allowedStatuses = new Set([
  "CONFIRMED_BANK_MATCH", "CONFIRMED_BY_USER_NOTE", "GENERAL_OVERHEAD_ALLOCATED",
  "HANDOFF_ADJUSTMENT", "PENDING_BANK_CONFIRMATION", "NEEDS_PROJECT_REVIEW",
]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS_PER_FILE = 5_000;
const MAX_TOTAL_ROWS = 15_000;
const MAX_FIELD_LENGTH = 2_000;
const MAX_ABSOLUTE_AMOUNT = 999_999_999_999.99;
const MAX_PROCESSING_MS = 25_000;
const transactionHeaders = [
  "Date", "Bank Row", "Project / Client", "Category", "Type", "Income", "Cost",
  "Source", "Description", "Traceability Status",
];
const requiredHeaders: Record<string, string[]> = {
  "LOVABLE_TRANSACTIONS_V10.csv": transactionHeaders,
  "PROJECT_SUMMARY_V10.csv": ["Project / Client", "Income", "Total Cost"],
  "PENDING_REVIEW_V10.csv": transactionHeaders,
  "CORRECTIONS_APPLIED_V10.csv": ["Reporting Row", "Bank Row", "Date", "Reason"],
  "HANDOFF_ADJUSTMENTS_V10.csv": ["Project / Client", "Labor Adjustment", "Materials Adjustment", "Rule"],
  "BANK_RECON_CONTROL_V10.csv": ["Control", "Value"],
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const norm = (value: unknown) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\uFFFD/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const damagedEncoding = (value: unknown) => /\uFFFD|ï¿½/.test(String(value ?? ""));
const splitSource = (value: unknown) => norm(value).includes("split");
const money = (value: unknown) => {
  const clean = String(value ?? "").replace(/[$,\s]/g, "");
  if (clean === "") return 0;
  if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && Math.abs(parsed) <= MAX_ABSOLUTE_AMOUNT ? parsed : null;
};
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const parseCsv = (text: string): ParsedCsv => {
  const matrix: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); matrix.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); matrix.push(row); }
  const headers = matrix.shift()?.map((header) => header.trim()) ?? [];
  const rows = matrix.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
  return { headers, rows };
};
const hasHeaders = (file: ParsedCsv, headers: string[]) =>
  headers.every((header) => file.headers.includes(header));
const unsafeFormula = (value: string) => /^[=+@]/.test(value.trim()) ||
  /^-(?!\d+(?:\.\d+)?$)/.test(value.trim());
const hasUnsafeText = (row: CsvRow) => [
  row["Project / Client"], row["Vendor / Worker"], row.Category, row.Type,
  row.Source, row.Description, row["User Notes / Preserved Notes"],
  row["Correction Reason"],
].some((value) => unsafeFormula(value ?? ""));
const rowsAreBounded = (rows: CsvRow[]) => rows.length <= MAX_ROWS_PER_FILE &&
  rows.every((row) => Object.values(row).every((value) => value.length <= MAX_FIELD_LENGTH));
const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const keyFor = (companyId: string, row: CsvRow) => [
  companyId, row["Bank Row"], row.Date, money(row.Income)?.toFixed(2) ?? "",
  money(row.Cost)?.toFixed(2) ?? "", norm(row.Description), norm(row.Type),
  norm(row.Source), norm(row["Project / Client"]), norm(row.Category),
].join("|");
const duplicateCandidateKey = (row: CsvRow) => [
  row["Bank Row"], row.Date, money(row.Income)?.toFixed(2) ?? "",
  money(row.Cost)?.toFixed(2) ?? "", norm(row.Description),
].join("|");
const splitCandidateKey = (row: CsvRow) => [
  row["Bank Row"], row.Date, norm(row.Description),
].join("|");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return response({ error: "unsupported_media_type" }, 415);
  }
  try {
    const auth = request.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(auth)) return response({ error: "unauthorized" }, 401);
    const startedAt = Date.now();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) return response({ error: "unauthorized" }, 401);
    if (!authData.user) return response({ error: "unauthorized" }, 401);
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return response({ error: "invalid_json" }, 400);
    }
    const files = body.files as Record<string, string> | undefined;
    if (!files || requiredFiles.some((name) => typeof files[name] !== "string")) {
      return response({ error: "incomplete_package" }, 400);
    }
    if (Object.keys(files).some((name) => !requiredFiles.includes(name))) {
      return response({ error: "unexpected_file" }, 400);
    }
    const fileSizes = requiredFiles.map((name) => new TextEncoder().encode(files[name]).byteLength);
    if (fileSizes.some((size) => size > MAX_FILE_BYTES) ||
      fileSizes.reduce((total, size) => total + size, 0) > MAX_PACKAGE_BYTES) {
      return response({ error: "package_too_large" }, 413);
    }
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("company_id").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw new Error("profile_lookup_failed");
    const companyId = profile?.company_id;
    if (!companyId || body.expected_company_id !== companyId) return response({ error: "company_mismatch" }, 403);
    const { data: roles, error: rolesError } = await supabase.from("user_roles")
      .select("role").eq("user_id", authData.user.id).eq("company_id", companyId);
    if (rolesError) throw new Error("role_lookup_failed");
    if (!(roles ?? []).some((item) => item.role === "admin" || item.role === "manager")) {
      return response({ error: "forbidden" }, 403);
    }

    const parsedByFile = Object.fromEntries(requiredFiles.map((name) => [name, parseCsv(files[name])])) as
      Record<string, ParsedCsv>;
    const transactions = parsedByFile["LOVABLE_TRANSACTIONS_V10.csv"].rows;
    const summary = parsedByFile["PROJECT_SUMMARY_V10.csv"].rows;
    const pending = parsedByFile["PENDING_REVIEW_V10.csv"].rows;
    const controls = parsedByFile["BANK_RECON_CONTROL_V10.csv"].rows;
    const handoff = parsedByFile["HANDOFF_ADJUSTMENTS_V10.csv"].rows;
    if (!transactions.length) return response({ error: "empty_transactions" }, 400);
    const corrections = parsedByFile["CORRECTIONS_APPLIED_V10.csv"].rows;
    const rowsByFile: Record<string, CsvRow[]> = {
      "LOVABLE_TRANSACTIONS_V10.csv": transactions,
      "PROJECT_SUMMARY_V10.csv": summary,
      "PENDING_REVIEW_V10.csv": pending,
      "CORRECTIONS_APPLIED_V10.csv": corrections,
      "HANDOFF_ADJUSTMENTS_V10.csv": handoff,
      "BANK_RECON_CONTROL_V10.csv": controls,
    };
    const allRows = Object.values(rowsByFile);
    if (Object.entries(parsedByFile).some(([name, file]) => !hasHeaders(file, requiredHeaders[name]))) {
      return response({ error: "invalid_headers" }, 422);
    }
    if (!summary.length || !controls.length) {
      return response({ error: "invalid_headers" }, 422);
    }
    if (allRows.some((rows) => !rowsAreBounded(rows)) ||
      allRows.reduce((total, rows) => total + rows.length, 0) > MAX_TOTAL_ROWS) {
      return response({ error: "row_limits_exceeded" }, 413);
    }
    if (transactions.some(hasUnsafeText) || handoff.some(hasUnsafeText)) {
      return response({ error: "unsafe_csv_formula" }, 422);
    }

    const totalIncome = transactions.reduce((sum, row) => sum + (money(row.Income) ?? 0), 0);
    const totalCost = transactions.reduce((sum, row) => sum + (money(row.Cost) ?? 0), 0);
    const summaryIncome = summary.reduce((sum, row) => sum + (money(row.Income) ?? 0), 0);
    const summaryCost = summary.reduce((sum, row) => sum + (money(row["Total Cost"]) ?? 0), 0);
    const control = (name: string) => money(controls.find((row) => norm(row.Control) === norm(name))?.Value);
    const invalid = transactions.filter((row) =>
      !validDate(row.Date) || money(row.Income) == null || money(row.Cost) == null ||
      ((money(row.Income) ?? 0) === 0 && (money(row.Cost) ?? 0) === 0 &&
        !isAllowedZeroCashWithdrawal(row, norm, allowedStatuses)) ||
      !row["Bank Row"] || !allowedStatuses.has(row["Traceability Status"]));
    const pendingCount = transactions.filter((row) =>
      row["Traceability Status"] === "PENDING_BANK_CONFIRMATION" ||
      row["Traceability Status"] === "NEEDS_PROJECT_REVIEW").length;
    if (invalid.length || Math.abs(totalIncome - summaryIncome) > 0.005 ||
      Math.abs(totalCost - summaryCost) > 0.005 || control("Credits Difference") !== 0 ||
      control("Debits Difference") !== 0 || pendingCount !== pending.length) {
      return response({ error: "dry_run_failed", invalid_rows: invalid.length }, 422);
    }
    const packageHash = await digest(requiredFiles.map((name) => `${name}\n${files[name]}`).join("\n--FILE--\n"));
    const { data: previousImport } = await supabase.from("import_files")
      .select("id").eq("company_id", companyId).eq("package_hash", packageHash).maybeSingle();
    // Same package already staged: replay by default, or re-classify in place
    // (never delete/duplicate the staging) when the caller asks for it.
    const reclassify = body.reclassify === true;
    if (previousImport && !reclassify) {
      return response({
        import_file_id: previousImport.id,
        inserted: 0,
        updated: 0,
        ignored: transactions.length,
        duplicates: transactions.length,
        review: 0,
        handoff_adjustments: 0,
        idempotent_replay: true,
      });
    }


    const [projectsResult, categoriesResult, divisionsResult] = await Promise.all([
      supabase.from("projects").select("id, name, project_code, division_id").eq("company_id", companyId),
      supabase.from("categories").select("id, name").eq("company_id", companyId).eq("kind", "expense"),
      supabase.from("divisions").select("id").eq("company_id", companyId).limit(1),
    ]);
    if (projectsResult.error || categoriesResult.error || divisionsResult.error) {
      throw new Error("catalog_lookup_failed");
    }
    const projects = projectsResult.data;
    const categories = categoriesResult.data;
    const divisions = divisionsResult.data;
    const projectIndex = new Map<string, { id: string; division_id: string }>();
    (projects ?? []).forEach((project) => {
      projectIndex.set(norm(project.name), project);
      if (project.project_code) projectIndex.set(norm(project.project_code), project);
    });
    const categoryIndex = new Map((categories ?? []).map((category) => [norm(category.name), category.id]));
    const fallbackDivision = divisions?.[0]?.id ?? null;
    if (!fallbackDivision) return response({ error: "no_division" }, 422);

    const duplicateGroups = new Map<string, CsvRow[]>();
    transactions.forEach((row) => {
      const key = splitSource(row.Source)
        ? `split|${splitCandidateKey(row)}`
        : `duplicate|${duplicateCandidateKey(row)}`;
      duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), row]);
    });
    const prepared = await Promise.all(transactions.map(async (row, index) => {
      const traceability = row["Traceability Status"];
      const nonProjectCenter = isV10NonProjectCenter(row["Project / Client"]);
      const project = traceability === "NEEDS_PROJECT_REVIEW" || nonProjectCenter
        ? null : projectIndex.get(norm(row["Project / Client"])) ??
          projectIndex.get(resolveV10ProjectKey(row["Project / Client"])) ?? null;
      const categoryId = damagedEncoding(row.Category) ? null : categoryIndex.get(norm(row.Category)) ?? null;
      const cost = money(row.Cost) ?? 0;
      const income = money(row.Income) ?? 0;
      const candidateKey = splitSource(row.Source)
        ? `split|${splitCandidateKey(row)}`
        : `duplicate|${duplicateCandidateKey(row)}`;
      const candidateGroup = duplicateGroups.get(candidateKey) ?? [row];
      const componentIndex = candidateGroup.indexOf(row) + 1;
      const split = candidateGroup.length > 1 && candidateGroup.every((candidate) => splitSource(candidate.Source));
      const exactDuplicate = candidateGroup.every((candidate) =>
        keyFor(companyId, candidate) === keyFor(companyId, row));
      const originalBankAmount = row["Original Bank Amount"]?.trim()
        ? money(row["Original Bank Amount"])
        : null;
      // Deterministic split: components rounded to 2 decimals, last one absorbs
      // the rounding difference so the group always sums to the bank movement.
      const componentAmounts = split
        ? distributeSplitComponents(
          candidateGroup.map((candidate) =>
            (money(candidate.Income) ?? 0) > 0 ? money(candidate.Income)! : money(candidate.Cost) ?? 0),
          originalBankAmount,
        )
        : [];
      const componentSum = split
        ? roundV10(componentAmounts.reduce((total, value) => total + value, 0))
        : null;
      const splitValidation = split
        ? originalBankAmount == null || Math.abs(componentSum! - originalBankAmount) <= 0.005
          ? "valid" : "mismatch"
        : null;
      const stableKey = `${keyFor(companyId, row)}${split ? `|component:${componentIndex}` : ""}`;
      const owner = isV10OwnerMovement(row.Type, row["Project / Client"]);
      const incomeRow = isV10IncomeRow(income, cost);
      // The doubt tray comes from the original reconciliation flags only.
      const reviewFlagged = isV10ReviewFlagged(row["Review Flag"]);
      const holdBack = traceability === "PENDING_BANK_CONFIRMATION" ||
        traceability === "HANDOFF_ADJUSTMENT" || reviewFlagged;
      const safeProject = project != null || nonProjectCenter;
      return {
        company_id: companyId,
        row_number: index + 1,
        source_sheet: "LOVABLE_TRANSACTIONS_V10",
        raw_json: row,
        detected_type: owner ? "bank_tx"
          : incomeRow ? (project ? "payment" : "bank_tx")
          : cost > 0 ? "expense" : "bank_tx",
        parsed_amount: split
          ? componentAmounts[componentIndex - 1]
          : income > 0 ? income : cost,
        parsed_date: row.Date,
        parsed_description: row.Description || null,
        suggested_project_id: project?.id ?? null,
        suggested_category_id: categoryId,
        suggested_division_id: project?.division_id ?? fallbackDivision,
        confidence_score: holdBack ? 0 : 1,
        status: holdBack || (split && splitValidation !== "valid") ||
          (candidateGroup.length > 1 && !split)
          ? "pending" : "confirmed",
        import_hash: stableKey,
        traceability_status: traceability,
        bank_row: row["Bank Row"],
        source: row.Source,
        movement_type: row.Type,
        stable_key: stableKey,
        original_project: row["Original Project / Client"] || null,
        original_category: row["Original Category"] || null,
        corrected_project: row["Project / Client"] || null,
        corrected_category: row.Category || null,
        user_note: row["User Notes / Preserved Notes"] || null,
        correction_reason: row["Correction Reason"] || null,
        bank_confirmed: traceability === "CONFIRMED_BANK_MATCH",
        // Profitability requires a safe assignment; owner/partner never counts.
        affects_project_profitability: !owner && !reviewFlagged && safeProject &&
          traceability !== "NEEDS_PROJECT_REVIEW" &&
          traceability !== "PENDING_BANK_CONFIRMATION" &&
          traceability !== "HANDOFF_ADJUSTMENT" &&
          (incomeRow ? project != null : true),
        duplicate_classification: split ? "legitimate_split"
          : candidateGroup.length > 1
            ? row["Correction Reason"] ? "correction_or_reclassification"
              : exactDuplicate ? "identical_duplicate" : "possible_duplicate"
            : "unique",
        split_group_id: split ? await digest(`${companyId}|split|${candidateKey}`) : null,
        component_index: split ? componentIndex : null,
        component_count: split ? candidateGroup.length : null,
        component_sum: componentSum,
        original_bank_amount: split ? originalBankAmount ?? componentSum : originalBankAmount,
        split_validation: splitValidation,
      };

    }));

    if (previousImport && reclassify) {
      // Auditable in-place re-classification of an existing staging: same rows,
      // same stable keys, only the derived classification is refreshed. Rows
      // already published (status 'imported') are never touched.
      const existingRows: { id: string; stable_key: string; status: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("import_rows")
          .select("id, stable_key, status, detected_type, parsed_amount, suggested_project_id, suggested_category_id, suggested_division_id, affects_project_profitability, duplicate_classification, split_group_id, component_index, component_count, component_sum, original_bank_amount, split_validation, bank_confirmed, confidence_score")
          .eq("company_id", companyId).eq("import_file_id", previousImport.id)
          .order("row_number").range(from, from + 999);
        if (error) throw error;
        existingRows.push(...(data ?? []) as typeof existingRows);
        if (!data || data.length < 1000) break;
      }
      const byKey = new Map(existingRows.map((row) => [row.stable_key, row]));
      const updates: Record<string, unknown>[] = [];
      let unchanged = 0, locked = 0, missing = 0;
      for (const row of prepared) {
        const current = byKey.get(row.stable_key) as (Record<string, unknown> & { id: string; status: string }) | undefined;
        if (!current) { missing++; continue; }
        if (current.status === "imported") { locked++; continue; }
        const next = { ...row, id: current.id, import_file_id: previousImport.id };
        const differs = Object.keys(row).some((field) =>
          field !== "company_id" && field !== "raw_json" && field !== "row_number" &&
          field in current &&
          JSON.stringify((current as Record<string, unknown>)[field] ?? null) !==
            JSON.stringify((next as Record<string, unknown>)[field] ?? null));
        if (differs) updates.push(next); else unchanged++;
      }
      for (let offset = 0; offset < updates.length; offset += 100) {
        const { error } = await supabase.from("import_rows")
          .upsert(updates.slice(offset, offset + 100), { onConflict: "id" });
        if (error) throw error;
      }
      const { error: auditError } = await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: authData.user.id,
        action: "financial_import.v10_reclassified",
        entity_type: "import_file",
        entity_id: previousImport.id,
        metadata: {
          rows: transactions.length, changed: updates.length, unchanged, locked, missing,
        },
      });
      if (auditError) throw auditError;
      return response({
        import_file_id: previousImport.id,
        reclassified: true,
        rows: transactions.length,
        changed: updates.length,
        unchanged,
        locked,
        missing,
      });
    }

    const stableKeys = prepared.map((row) => row.stable_key);

    const existingKeys = new Set<string>();
    const stableKeyBatchSize = 50;
    for (let offset = 0; offset < stableKeys.length; offset += stableKeyBatchSize) {
      const { data: existing, error: existingError } = await supabase.from("import_rows")
        .select("stable_key").eq("company_id", companyId)
        .in("stable_key", stableKeys.slice(offset, offset + stableKeyBatchSize));
      if (existingError) throw existingError;
      (existing ?? []).forEach((row) => existingKeys.add(row.stable_key));
    }
    const unique = prepared.filter((row, index, all) =>
      !existingKeys.has(row.stable_key) && all.findIndex((other) => other.stable_key === row.stable_key) === index);
    if (Date.now() - startedAt > MAX_PROCESSING_MS) {
      return response({ error: "processing_timeout" }, 408);
    }

    const { data: importFile, error: fileError } = await supabase.from("import_files").insert({
      company_id: companyId,
      uploaded_by: authData.user.id,
      file_name: "THI_V10_LOVABLE_REVIEW_PACKAGE.zip",
      source: "thi_v10",
      package_hash: packageHash,
      status: "staged",
      total_rows: transactions.length,
      needs_review_count: unique.filter((row) => row.status === "pending").length,
      duplicate_count: transactions.length - unique.length,
      metadata: { period: "V10", dry_run: { totalIncome, totalCost } },
    }).select("id").single();
    if (fileError) throw fileError;
    const rows = unique.map((row) => ({ ...row, import_file_id: importFile.id }));
    const { data: insertedRows, error: rowsError } = await supabase.from("import_rows")
      .insert(rows).select("id, stable_key, traceability_status, status");
    if (rowsError) throw rowsError;

    const adjustmentRows = await Promise.all(handoff.map(async (row) => ({
      company_id: companyId,
      import_file_id: importFile.id,
      project_id: projectIndex.get(norm(row["Project / Client"]))?.id ?? null,
      project_label: row["Project / Client"],
      handoff_labor_budget: money(row["Handoff Labor Budget"]),
      actual_labor_before_adjustment: money(row["Actual Labor Before Handoff Adj"]),
      labor_adjustment: money(row["Labor Adjustment"]),
      handoff_materials_budget: money(row["Handoff Materials Budget"]),
      actual_materials_before_adjustment: money(row["Actual Materials Before Handoff Adj"]),
      materials_adjustment: money(row["Materials Adjustment"]),
      rule: row.Rule || null,
      stable_key: await digest(`${companyId}|handoff|${norm(row["Project / Client"])}|${row.Rule}`),
      raw_json: row,
      created_by: authData.user.id,
    })));
    if (adjustmentRows.length) {
      const { error: handoffError } = await supabase.from("handoff_adjustments")
        .upsert(adjustmentRows, { onConflict: "company_id,stable_key", ignoreDuplicates: true });
      if (handoffError) throw handoffError;
    }
    const { error: importAuditError } = await supabase.from("audit_logs").insert({
      company_id: companyId,
      user_id: authData.user.id,
      action: "financial_import.v10_staged",
      entity_type: "import_file",
      entity_id: importFile.id,
      metadata: {
        rows: transactions.length, inserted: unique.length,
        duplicates: transactions.length - unique.length,
        review: unique.filter((row) => row.status === "pending").length,
        handoff_adjustments: adjustmentRows.length,
      },
    });
    if (importAuditError) throw importAuditError;
    if (insertedRows?.length) {
      const { error: rowAuditError } = await supabase.from("audit_logs").insert(insertedRows.map((row) => ({
        company_id: companyId,
        user_id: authData.user.id,
        action: "financial_import.row_staged",
        entity_type: "import_row",
        entity_id: row.id,
        metadata: {
          import_file_id: importFile.id,
          stable_key: row.stable_key,
          traceability_status: row.traceability_status,
          status: row.status,
        },
      })));
      if (rowAuditError) throw rowAuditError;
    }
    return response({
      import_file_id: importFile.id,
      inserted: unique.length,
      updated: 0,
      ignored: transactions.length - unique.length,
      duplicates: transactions.length - unique.length,
      review: unique.filter((row) => row.status === "pending").length,
      handoff_adjustments: adjustmentRows.length,
    });
  } catch (error) {
    console.error("import_v10_stage", error instanceof Error ? error.message : "unexpected");
    return response({ error: "stage_failed" }, 500);
  }
});
