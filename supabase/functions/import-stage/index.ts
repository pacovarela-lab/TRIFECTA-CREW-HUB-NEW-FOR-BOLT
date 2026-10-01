// Stages parsed rows into import_rows with detection + suggestions, then applies user rules.
// Body:
//   { file_name, source?, sheets: { [sheetName]: Row[] } }   // multi-sheet generic
//   { file_name, source: "bank", rows: BankRow[] }            // bank statement variant
// Returns: { import_file_id, totals }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = Record<string, any>;
const norm = (s: any) => String(s ?? "").trim();
const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const key = (s: any) => stripAccents(norm(s)).toLowerCase().replace(/[^a-z0-9]/g, "");
const numOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};
const dateOrNull = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const a = +m[1], b = +m[2];
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    let day: number, month: number;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { month = a; day = b; }
    else { day = a; month = b; }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const sha = async (s: string): Promise<string> => {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
};

const FIELD_SYNS: Record<string, string[]> = {
  amount: ["amount", "monto", "importe", "valor", "total", "amountusd"],
  date: ["date", "fecha", "postedon", "postingdate"],
  description: ["description", "descripcion", "detalle", "concepto", "notes", "notas", "memo"],
  vendor: ["vendor", "proveedor", "supplier", "comercio", "payee"],
  client: ["client", "cliente", "customer", "clientname"],
  project: ["project", "proyecto", "projectcode", "projectid"],
  category: ["category", "categoria", "expensecategory", "tipo"],
  worker: ["worker", "trabajador", "empleado"],
  paymentmethod: ["paymentmethod", "metodopago", "metododepago", "formapago"],
  status: ["status", "estado", "estatus"],
  title: ["title", "titulo", "nombre"],
};
function findField(row: Row, group: string): any {
  const syns = FIELD_SYNS[group] || [group];
  for (const k of Object.keys(row)) {
    const nk = key(k);
    if (syns.some((s) => nk === s || nk.includes(s))) {
      const v = row[k];
      if (v !== null && v !== undefined && v !== "") return v;
    }
  }
  return null;
}

const SHEET_TYPE_HINTS: Record<string, string> = {
  expenses: "expense", gastos: "expense", expense: "expense",
  general: "expense", overhead: "expense",
  payments: "payment", pagos: "payment", payment: "payment", received: "payment",
  labor: "labor", trabajo: "labor", manoobra: "labor",
  projects: "project", proyectos: "project",
  tasks: "task", tareas: "task",
  estimate: "estimate", presupuesto: "estimate", handoff: "estimate",
  bank: "bank_tx", banco: "bank_tx", conciliacion: "bank_tx", statement: "bank_tx",
};
function detectTypeFromSheet(sheet: string): string {
  const k = key(sheet);
  for (const [needle, t] of Object.entries(SHEET_TYPE_HINTS)) {
    if (k.includes(needle)) return t;
  }
  return "unknown";
}
function detectTypeFromColumns(row: Row): string {
  const hasAmount = findField(row, "amount") !== null;
  const hasVendor = findField(row, "vendor") !== null;
  const hasClient = findField(row, "client") !== null;
  const hasWorker = findField(row, "worker") !== null;
  const hasTitle = findField(row, "title") !== null;
  const hasStatus = findField(row, "status") !== null;
  if (hasAmount && hasWorker) return "labor";
  if (hasAmount && hasClient && !hasVendor) return "payment";
  if (hasAmount && hasVendor) return "expense";
  if (hasTitle && hasStatus && !hasAmount) return "task";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const fileName = body.file_name || "import.xlsx";
    const source = body.source || "manual";

    // Bank variant: wrap rows into a single synthetic sheet so the staging path is unified.
    let sheets: Record<string, Row[]>;
    if (source === "bank" && Array.isArray(body.rows)) {
      sheets = { bank: body.rows };
    } else {
      sheets = body.sheets || {};
    }

    const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    const companyId = prof?.company_id;
    if (!companyId) return new Response(JSON.stringify({ error: "no_company" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: projects }, { data: vendors }, { data: clients }, { data: categories }, { data: workers }] = await Promise.all([
      supabase.from("projects").select("id, project_code, name, client_id, division_id").eq("company_id", companyId),
      supabase.from("vendors").select("id, name").eq("company_id", companyId),
      supabase.from("clients").select("id, name").eq("company_id", companyId),
      supabase.from("categories").select("id, name").eq("company_id", companyId),
      supabase.from("workers").select("id, name").eq("company_id", companyId),
    ]);

    const pIdx = (projects ?? []).map((p) => ({ ...p, _kCode: key((p as { project_code?: string }).project_code ?? ""), _kName: key(p.name) }));
    const vIdx = (vendors ?? []).map((v) => ({ ...v, _k: key(v.name) }));
    const cIdx = (clients ?? []).map((c) => ({ ...c, _k: key(c.name) }));
    const catIdx = (categories ?? []).map((c) => ({ ...c, _k: key(c.name) }));
    const wIdx = (workers ?? []).map((w) => ({ ...w, _k: key(w.name) }));

    const fuzzyMatch = <T extends { _k?: string; _kCode?: string; _kName?: string }>(idx: T[], needle: string, fields: (keyof T)[] = ["_k"]): { item: T; score: number } | null => {
      const nk = key(needle);
      if (!nk) return null;
      let best: { item: T; score: number } | null = null;
      for (const item of idx) {
        for (const f of fields) {
          const v = item[f] as unknown as string;
          if (!v) continue;
          let score = 0;
          if (v === nk) score = 1;
          else if (v.length > 2 && nk.length > 2 && (v.includes(nk) || nk.includes(v))) score = 0.85;
          else {
            const toks1 = new Set(v.match(/.{3,}/g) || []);
            const toks2 = new Set(nk.match(/.{3,}/g) || []);
            let overlap = 0;
            toks2.forEach((t) => { if (toks1.has(t)) overlap++; });
            if (overlap > 0) score = Math.min(0.75, 0.3 + overlap * 0.15);
          }
          if (score > 0 && (!best || score > best.score)) best = { item, score };
        }
      }
      return best;
    };

    const { data: file, error: fileErr } = await supabase.from("import_files").insert({
      company_id: companyId,
      uploaded_by: user.id,
      file_name: fileName,
      source,
      status: "parsing",
      metadata: { sheets: Object.keys(sheets) },
    }).select("id").single();
    if (fileErr) throw fileErr;
    const fileId = file.id;

    const rowsToInsert: any[] = [];
    let totalRows = 0;
    let autoApproved = 0, needsReview = 0, noMatch = 0, dupes = 0;

    for (const [sheetName, rows] of Object.entries(sheets)) {
      if (!Array.isArray(rows)) continue;
      const sheetTypeHint = detectTypeFromSheet(sheetName);
      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i] || {};
        if (Object.values(raw).every((v) => v === null || v === undefined || v === "")) continue;
        totalRows++;

        const amount = numOrNull(findField(raw, "amount"));
        const date = dateOrNull(findField(raw, "date"));
        const desc = norm(findField(raw, "description")) || null;

        let detected = sheetTypeHint;
        if (detected === "unknown") detected = detectTypeFromColumns(raw);

        let projectMatch = null, vendorMatch = null, clientMatch = null, catMatch = null, workerMatch = null;
        const pRaw = findField(raw, "project");
        const vRaw = findField(raw, "vendor");
        const cRaw = findField(raw, "client");
        const catRaw = findField(raw, "category");
        const wRaw = findField(raw, "worker");
        if (pRaw) projectMatch = fuzzyMatch(pIdx, String(pRaw), ["_kCode", "_kName"]);
        if (vRaw) vendorMatch = fuzzyMatch(vIdx, String(vRaw));
        if (cRaw) clientMatch = fuzzyMatch(cIdx, String(cRaw));
        if (catRaw) catMatch = fuzzyMatch(catIdx, String(catRaw));
        if (wRaw) workerMatch = fuzzyMatch(wIdx, String(wRaw));

        if (!projectMatch && clientMatch) {
          const pByC = pIdx.find((p) => p.client_id === clientMatch!.item.id);
          if (pByC) projectMatch = { item: pByC, score: 0.7 };
        }

        let scores: number[] = [];
        if (detected === "expense" || detected === "labor") {
          if (amount) scores.push(0.5);
          if (date) scores.push(0.3);
          if (projectMatch) scores.push(projectMatch.score);
          if (vendorMatch || workerMatch) scores.push((vendorMatch?.score ?? workerMatch?.score)!);
        } else if (detected === "payment") {
          if (amount) scores.push(0.5);
          if (date) scores.push(0.3);
          if (clientMatch) scores.push(clientMatch.score);
          if (projectMatch) scores.push(projectMatch.score);
        } else if (detected === "bank_tx") {
          if (amount) scores.push(0.4);
          if (date) scores.push(0.3);
          if (desc) scores.push(0.2);
          // Bank rows always need human review unless an explicit rule confirms them later.
        } else if (detected === "project") {
          if (pRaw) scores.push(0.6);
          if (clientMatch) scores.push(clientMatch.score);
        } else if (detected === "task") {
          if (findField(raw, "title")) scores.push(0.6);
          if (projectMatch) scores.push(projectMatch.score);
        }
        const confidence = scores.length ? Math.min(0.99, scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 2)) : 0.2;

        const hashSrc = `${detected}|${date ?? ""}|${amount ?? ""}|${key(desc ?? "")}|${vendorMatch?.item.id ?? ""}|${clientMatch?.item.id ?? ""}|${projectMatch?.item.id ?? ""}`;
        const importHash = await sha(hashSrc);

        let status: string = "pending";
        let dup = false;
        if (detected === "expense" && amount && date) {
          const { data: existing } = await supabase.from("expenses")
            .select("id").eq("company_id", companyId).eq("amount", amount).eq("spent_on", date).limit(1);
          if (existing && existing.length) dup = true;
        } else if (detected === "payment" && amount && date) {
          const { data: existing } = await supabase.from("payments")
            .select("id").eq("company_id", companyId).eq("amount", amount).eq("received_on", date).limit(1);
          if (existing && existing.length) dup = true;
        } else if (detected === "bank_tx" && amount && date) {
          const { data: existing } = await supabase.from("bank_transactions")
            .select("id").eq("company_id", companyId).eq("amount", amount).eq("posted_on", date).eq("description", desc ?? "").limit(1);
          if (existing && existing.length) dup = true;
        }

        if (dup) { status = "duplicate"; dupes++; }
        else if (detected === "unknown") { status = "pending"; noMatch++; }
        else if (detected === "bank_tx") { status = "pending"; needsReview++; }
        else if (confidence >= 0.85) { status = "suggested"; autoApproved++; }
        else { status = "pending"; needsReview++; }

        rowsToInsert.push({
          company_id: companyId,
          import_file_id: fileId,
          source_sheet: sheetName,
          row_number: i + 1,
          raw_json: raw,
          detected_type: detected,
          // The staging table only accepts non-negative amounts; the original
          // sign (refunds/credits) stays available in raw_json.
          parsed_amount: amount === null || amount === undefined ? amount : Math.abs(Number(amount)),
          parsed_date: date,
          parsed_description: desc,
          suggested_project_id: projectMatch?.item.id ?? null,
          suggested_category_id: catMatch?.item.id ?? null,
          suggested_vendor_id: vendorMatch?.item.id ?? null,
          suggested_client_id: clientMatch?.item.id ?? null,
          suggested_worker_id: workerMatch?.item.id ?? null,
          suggested_division_id: projectMatch?.item.division_id ?? null,
          confidence_score: Number(confidence.toFixed(3)),
          status,
          import_hash: importHash,
        });
      }
    }

    const batch = 200;
    let insertedRows = 0;
    const failedRows: { row_number: number; sheet: string; error: string }[] = [];
    for (let i = 0; i < rowsToInsert.length; i += batch) {
      const slice = rowsToInsert.slice(i, i + batch);
      const { error: insErr } = await supabase.from("import_rows").insert(slice);
      if (!insErr) { insertedRows += slice.length; continue; }
      console.error("insert error (retrying row by row)", insErr);
      // A single bad row must not drop the whole batch.
      for (const row of slice) {
        const { error: rowErr } = await supabase.from("import_rows").insert(row);
        if (rowErr) {
          failedRows.push({ row_number: row.row_number, sheet: row.source_sheet, error: rowErr.message });
        } else {
          insertedRows++;
        }
      }
    }
    if (failedRows.length) console.error("import rows failed", failedRows.slice(0, 20));

    // Apply enabled rules in one DB call
    let rulesApplied = 0, rulesConfirmed = 0;
    try {
      const { data: ruleRes } = await supabase.rpc("apply_import_rules", { _file_id: fileId });
      if (Array.isArray(ruleRes) && ruleRes[0]) {
        rulesApplied = ruleRes[0].applied ?? 0;
        rulesConfirmed = ruleRes[0].confirmed ?? 0;
      }
    } catch (e) { console.error("apply_import_rules failed", e); }

    await supabase.from("import_files").update({
      status: "staged",
      total_rows: insertedRows,
      auto_approved_count: autoApproved + rulesConfirmed,
      needs_review_count: Math.max(0, needsReview - rulesApplied),
      no_match_count: noMatch,
      duplicate_count: dupes,
    }).eq("id", fileId);

    return new Response(JSON.stringify({
      import_file_id: fileId,
      totals: { totalRows, insertedRows, failedRows: failedRows.length, autoApproved, needsReview, noMatch, dupes, rulesApplied, rulesConfirmed },
      failed_rows: failedRows.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("import-stage error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
