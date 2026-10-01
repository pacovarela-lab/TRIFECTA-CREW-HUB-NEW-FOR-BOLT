// Imports parsed Trifecta OS sheet data (JSON rows from the client) into the app's tables.
// Body: { sheets: { PROJECTS_AUTO: Row[], HANDOFF_RAW: Row[], EXPENSES_MANUAL: Row[],
//                   GENERAL_EXPENSES: Row[], LABOR_TRACKING: Row[], PAYMENTS_RECEIVED: Row[],
//                   TASKS: Row[], LOOKUPS: Row[] }, source?: string, dry_run?: boolean }
// All Excel parsing is performed client-side to keep this function within edge memory limits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HOME_IMPROVEMENT_DIVISION_SLUG = "home-improvement";

type Row = Record<string, any>;

const norm = (s: any) => String(s ?? "").trim();
const lower = (s: any) => norm(s).toLowerCase();
const numOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};
type DateFormat = "dmy" | "mdy" | "auto";
let DATE_FORMAT: DateFormat = "dmy";
const dateOrNull = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    let day: number, month: number;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { month = a; day = b; }
    else if (DATE_FORMAT === "mdy") { month = a; day = b; }
    else if (DATE_FORMAT === "dmy") { day = a; month = b; }
    else { day = a; month = b; } // auto fallback: DMY (Trifecta source)
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};


const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const titleCase = (s: string) => s.split(/\s+/).filter(Boolean).map(cap).join(" ");

// Map free-form payment strings to the public.payment_method enum values:
// "cash" | "check" | "card" | "ach" | "zelle" | "venmo" | "other"
const PAYMENT_MAP: Record<string, string> = {
  zelle: "zelle", check: "check", cheque: "check", cash: "cash", efectivo: "cash",
  card: "card", "credit card": "card", credit: "card", "tarjeta": "card",
  "debit card": "card", debit: "card", "debito": "card", "débito": "card",
  ach: "ach", transfer: "ach", "bank transfer": "ach", transferencia: "ach", wire: "ach",
  venmo: "venmo",
  paypal: "other", "cash app": "other", cashapp: "other", other: "other", otro: "other",
};
const mapPayment = (raw: any): string => PAYMENT_MAP[lower(raw)] || "other";

const sha = async (s: string): Promise<string> => {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- 1. Auth: validate JWT with anon-scoped client (RLS applies) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- 2. Resolve caller's company from THEIR profile (never trust the client) ---
    const { data: profile } = await authClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    const companyId = profile?.company_id as string | undefined;
    if (!companyId) {
      return new Response(JSON.stringify({ error: "FORBIDDEN_NO_COMPANY" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- 3. Verify caller has an authorized role (admin or manager) ---
    const { data: roleRows } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.some((r) => r === "admin" || r === "manager")) {
      return new Response(JSON.stringify({ error: "FORBIDDEN_ROLE" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- 4. Only NOW instantiate service-role client for the actual writes ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const body = await req.json();
    const sheets: Record<string, Row[]> = body.sheets ?? {};
    const sourceLabel: string = body.source ?? "client_upload";
    const dryRun: boolean = body.dry_run === true;
    const df = String(body.date_format ?? "dmy").toLowerCase();
    DATE_FORMAT = (df === "mdy" || df === "auto") ? (df as DateFormat) : "dmy";

    if (!sheets || typeof sheets !== "object") {
      return new Response(JSON.stringify({ error: "sheets payload required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // NOTE: companyId comes from the authenticated caller's profile — never from
    // body/client input, and never resolved by hardcoded company name.
    const { data: hiDiv } = await supabase.from("divisions").select("id").eq("company_id", companyId).eq("slug", HOME_IMPROVEMENT_DIVISION_SLUG).single();
    const defaultDivisionId = hiDiv?.id;
    if (!defaultDivisionId) throw new Error("Default division (home-improvement) not found for caller's company");


    const projectsAuto = sheets["PROJECTS_AUTO"] ?? [];
    const handoffRaw = sheets["HANDOFF_RAW"] ?? [];
    const expensesManual = sheets["EXPENSES_MANUAL"] ?? [];
    const generalExpenses = sheets["GENERAL_EXPENSES"] ?? [];
    const laborTracking = sheets["LABOR_TRACKING"] ?? [];
    const paymentsReceived = sheets["PAYMENTS_RECEIVED"] ?? [];
    const tasksSheet = sheets["TASKS"] ?? [];
    const lookups = sheets["LOOKUPS"] ?? [];

    const summary: Record<string, any> = {
      counts: {
        projectsAuto: projectsAuto.length, handoffRaw: handoffRaw.length,
        expensesManual: expensesManual.length, generalExpenses: generalExpenses.length,
        laborTracking: laborTracking.length, paymentsReceived: paymentsReceived.length,
        tasks: tasksSheet.length,
      },
      created: { clients: 0, projects: 0, workers: 0, vendors: 0, categories: 0, expenses: 0, payments: 0, tasks: 0, estimates: 0, estimate_items: 0 },
      skipped: { expenses: 0, payments: 0, tasks: 0 },
      pending_tasks: [] as any[],
      errors: [] as string[],
    };

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dry_run: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build project_code → {client_name, address} map from PROJECTS_AUTO and HANDOFF_RAW
    const projectMap = new Map<string, { client_name: string; address: string; contract: number | null }>();
    for (const r of projectsAuto) {
      const code = norm(r["Project Code"] ?? r[Object.keys(r)[0]]);
      if (!code) continue;
      projectMap.set(code, {
        client_name: norm(r["Client Name"]),
        address: norm(r["Address"]),
        contract: numOrNull(r["Contract Amount (Estimated)"]),
      });
    }
    for (const r of handoffRaw) {
      const code = norm(r["Project Code"]);
      if (!code) continue;
      if (!projectMap.has(code)) {
        projectMap.set(code, {
          client_name: norm(r["Client Name"]),
          address: norm(r["Address"]),
          contract: null,
        });
      }
    }

    // ---------- 1. Clients ----------
    const clientByName = new Map<string, string>();
    {
      const { data: existing } = await supabase.from("clients").select("id, name").eq("company_id", companyId);
      existing?.forEach((c) => clientByName.set(lower(c.name), c.id));
      const namesToCreate = new Set<string>();
      projectMap.forEach((v) => { if (v.client_name && !clientByName.has(lower(v.client_name))) namesToCreate.add(v.client_name); });
      if (namesToCreate.size > 0) {
        const rows = Array.from(namesToCreate).map((name) => ({ company_id: companyId, name }));
        const { data: inserted, error } = await supabase.from("clients").insert(rows).select("id, name");
        if (error) summary.errors.push(`clients: ${error.message}`);
        inserted?.forEach((c) => clientByName.set(lower(c.name), c.id));
        summary.created.clients = inserted?.length ?? 0;
      }
    }

    // ---------- 2. Projects (create missing + update changed master fields) ----------
    const projectByCode = new Map<string, string>();
    summary.created.projects_updated = 0;
    {
      const { data: existing } = await supabase
        .from("projects")
        .select("id, project_code, address, estimated_total, client_id, name")
        .eq("company_id", companyId)
        .not("project_code", "is", null);
      const existingByCode = new Map<string, any>();
      existing?.forEach((p) => { projectByCode.set(p.project_code, p.id); existingByCode.set(p.project_code, p); });

      const toInsert: any[] = [];
      const updates: { id: string; patch: any }[] = [];
      projectMap.forEach((v, code) => {
        const client_id = v.client_name ? clientByName.get(lower(v.client_name)) ?? null : null;
        const ex = existingByCode.get(code);
        if (ex) {
          const patch: any = {};
          if (v.address && v.address !== ex.address) patch.address = v.address;
          if (v.contract != null && Number(v.contract) !== Number(ex.estimated_total ?? 0)) patch.estimated_total = v.contract;
          if (client_id && client_id !== ex.client_id) patch.client_id = client_id;
          if (Object.keys(patch).length) updates.push({ id: ex.id, patch });
          return;
        }
        toInsert.push({
          company_id: companyId,
          division_id: defaultDivisionId,
          client_id,
          name: v.client_name || code,
          address: v.address || null,
          project_code: code,
          estimated_total: v.contract ?? 0,
          status: "active",
          project_type: "other",
        });
      });
      if (toInsert.length > 0) {
        const { data: inserted, error } = await supabase
          .from("projects")
          .insert(toInsert)
          .select("id, project_code");
        if (error) summary.errors.push(`projects: ${error.message}`);
        inserted?.forEach((p) => projectByCode.set(p.project_code, p.id));
        summary.created.projects = inserted?.length ?? 0;
      }
      for (const u of updates) {
        const { error } = await supabase.from("projects").update(u.patch).eq("id", u.id);
        if (error) summary.errors.push(`project update ${u.id}: ${error.message}`);
        else summary.created.projects_updated++;
      }
    }

    // ---------- 3. Workers from LABOR_TRACKING ----------
    const workerByName = new Map<string, string>();
    {
      const { data: existing } = await supabase.from("workers").select("id, name").eq("company_id", companyId);
      existing?.forEach((w) => workerByName.set(lower(w.name), w.id));
      const names = new Set<string>();
      laborTracking.forEach((r) => {
        const n = titleCase(norm(r["WORKER"]));
        if (n && !workerByName.has(lower(n))) names.add(n);
      });
      if (names.size > 0) {
        const rows = Array.from(names).map((name) => ({ company_id: companyId, name, default_division_id: defaultDivisionId, worker_type: "worker" }));
        const { data: inserted, error } = await supabase.from("workers").insert(rows).select("id, name");
        if (error) summary.errors.push(`workers: ${error.message}`);
        inserted?.forEach((w) => workerByName.set(lower(w.name), w.id));
        summary.created.workers = inserted?.length ?? 0;
      }
    }

    // ---------- 4. Vendors ----------
    const vendorByName = new Map<string, string>();
    {
      const { data: existing } = await supabase.from("vendors").select("id, name").eq("company_id", companyId);
      existing?.forEach((v) => vendorByName.set(lower(v.name), v.id));
      const names = new Set<string>();
      [...expensesManual, ...generalExpenses].forEach((r) => {
        const n = titleCase(norm(r["Vendor"] ?? r["VENDOR "] ?? r["VENDOR"]));
        if (n && !vendorByName.has(lower(n))) names.add(n);
      });
      if (names.size > 0) {
        const rows = Array.from(names).map((name) => ({ company_id: companyId, name }));
        const { data: inserted, error } = await supabase.from("vendors").insert(rows).select("id, name");
        if (error) summary.errors.push(`vendors: ${error.message}`);
        inserted?.forEach((v) => vendorByName.set(lower(v.name), v.id));
        summary.created.vendors = inserted?.length ?? 0;
      }
    }

    // ---------- 5. Categories ----------
    const catByName = new Map<string, string>();
    {
      const { data: existing } = await supabase.from("categories").select("id, name").eq("company_id", companyId).eq("kind", "expense");
      existing?.forEach((c) => catByName.set(lower(c.name), c.id));
      const names = new Set<string>();
      lookups.forEach((r) => { if (lower(r["List Name"]) === "expense category" && norm(r["Value"])) names.add(norm(r["Value"])); });
      [...expensesManual, ...generalExpenses].forEach((r) => {
        const c = norm(r["Expense Category"] ?? r["CATEGORY"] ?? r["CATEGORY "]);
        if (c) names.add(c);
      });
      const toCreate = Array.from(names).filter((n) => !catByName.has(lower(n)));
      if (toCreate.length > 0) {
        const rows = toCreate.map((name) => ({ company_id: companyId, name, kind: "expense" }));
        const { data: inserted, error } = await supabase.from("categories").insert(rows).select("id, name");
        if (error) summary.errors.push(`categories: ${error.message}`);
        inserted?.forEach((c) => catByName.set(lower(c.name), c.id));
        summary.created.categories = inserted?.length ?? 0;
      }
      if (!catByName.has("labor")) {
        const { data: lbl } = await supabase.from("categories").insert({ company_id: companyId, name: "Labor", kind: "expense" }).select("id, name").single();
        if (lbl) catByName.set("labor", lbl.id);
      }
    }
    const laborCategoryId = catByName.get("labor") ?? null;

    // ---------- 6. Expenses ----------
    {
      const expenseRows: any[] = [];
      for (const r of expensesManual) {
        const amount = numOrNull(r["Amount"]);
        if (!amount) continue;
        const date = dateOrNull(r["Date"]) ?? new Date().toISOString().slice(0, 10);
        const code = norm(r["Project Code"]);
        const project_id = code ? projectByCode.get(code) ?? null : null;
        const vendor = titleCase(norm(r["Vendor"]));
        const cat = norm(r["Expense Category"]);
        const hashKey = `man|${date}|${amount}|${lower(vendor)}|${lower(code)}|${lower(cat)}`;
        expenseRows.push({
          company_id: companyId,
          division_id: defaultDivisionId,
          project_id,
          vendor_id: vendor ? vendorByName.get(lower(vendor)) ?? null : null,
          category_id: cat ? catByName.get(lower(cat)) ?? null : null,
          amount,
          spent_on: date,
          description: norm(r["Notes"]) || null,
          import_hash: await sha(hashKey),
        });
      }
      for (const r of generalExpenses) {
        const amount = numOrNull(r["AMOUNT "] ?? r["AMOUNT"]);
        if (!amount) continue;
        const date = dateOrNull(r["DATE"]) ?? new Date().toISOString().slice(0, 10);
        const vendor = titleCase(norm(r["VENDOR "] ?? r["VENDOR"]));
        const cat = norm(r["CATEGORY"] ?? r["CATEGORY "]);
        const notes = norm(r["NOTES"]);
        const hashKey = `gen|${date}|${amount}|${lower(vendor)}|${lower(cat)}|${lower(notes)}`;
        expenseRows.push({
          company_id: companyId,
          division_id: defaultDivisionId,
          project_id: null,
          vendor_id: vendor ? vendorByName.get(lower(vendor)) ?? null : null,
          category_id: cat ? catByName.get(lower(cat)) ?? null : null,
          amount,
          spent_on: date,
          description: notes || null,
          import_hash: await sha(hashKey),
        });
      }
      for (const r of laborTracking) {
        const amount = numOrNull(r["AMOUNT (USD)"]);
        if (!amount) continue;
        const date = dateOrNull(r["DATE"]) ?? new Date().toISOString().slice(0, 10);
        const worker = titleCase(norm(r["WORKER"]));
        const code = norm(r["PROJECT CODE"]);
        const project_id = code ? projectByCode.get(code) ?? null : null;
        const laborType = norm(r["LABOR TYPE"]);
        const notes = `Labor: ${worker}${laborType ? ` (${laborType})` : ""}${r["NOTES"] ? ` — ${norm(r["NOTES"])}` : ""}`;
        const hashKey = `lab|${date}|${amount}|${lower(worker)}|${lower(code)}|${lower(laborType)}`;
        expenseRows.push({
          company_id: companyId,
          division_id: defaultDivisionId,
          project_id,
          vendor_id: null,
          category_id: laborCategoryId,
          amount,
          spent_on: date,
          description: notes,
          import_hash: await sha(hashKey),
        });
      }
      const chunkSize = 400;
      let created = 0;
      // De-duplicate within this batch first (same hash appearing twice in the upload).
      const seenInBatch = new Set<string>();
      const uniqueExpenseRows = expenseRows.filter((row) => {
        if (!row.import_hash) return true;
        if (seenInBatch.has(row.import_hash)) return false;
        seenInBatch.add(row.import_hash);
        return true;
      });
      for (let i = 0; i < uniqueExpenseRows.length; i += chunkSize) {
        const chunk = uniqueExpenseRows.slice(i, i + chunkSize);
        const hashes = chunk.map((row) => row.import_hash).filter(Boolean);
        const { data: existingHashes } = await supabase
          .from("expenses")
          .select("import_hash")
          .eq("company_id", companyId)
          .in("import_hash", hashes);
        const existing = new Set((existingHashes ?? []).map((row) => row.import_hash));
        const missing = chunk.filter((row) => !existing.has(row.import_hash));
        if (!missing.length) continue;
        const { data, error } = await supabase
          .from("expenses")
          .insert(missing)
          .select("id");
        if (error) {
          // Unique-violation on import_hash = harmless race; treat as skipped.
          if ((error as any).code === "23505") continue;
          summary.errors.push(`expenses chunk ${i}: ${error.message}`);
        } else created += data?.length ?? 0;
      }
      summary.created.expenses = created;
      summary.skipped.expenses = uniqueExpenseRows.length - created;
    }

    // ---------- 7. Payments ----------
    {
      const rows: any[] = [];
      for (const r of paymentsReceived) {
        const amount = numOrNull(r["Amount"]);
        if (!amount) continue;
        const date = dateOrNull(r["Date"]) ?? new Date().toISOString().slice(0, 10);
        const code = norm(r["Project Code"]);
        const project_id = code ? projectByCode.get(code) ?? null : null;
        const clientName = norm(r["Client Name (auto)"]);
        const client_id = clientName ? clientByName.get(lower(clientName)) ?? null : null;
        const method = mapPayment(r["Payment Method"]);
        const hashKey = `pay|${date}|${amount}|${lower(code)}|${method}`;
        rows.push({
          company_id: companyId,
          division_id: defaultDivisionId,
          project_id,
          client_id,
          amount,
          received_on: date,
          method,
          notes: norm(r["Notes"]) || null,
          import_hash: await sha(hashKey),
        });
      }
      const chunkSize = 400;
      let created = 0;
      const seenPay = new Set<string>();
      const uniqueRows = rows.filter((row) => {
        if (!row.import_hash) return true;
        if (seenPay.has(row.import_hash)) return false;
        seenPay.add(row.import_hash);
        return true;
      });
      for (let i = 0; i < uniqueRows.length; i += chunkSize) {
        const chunk = uniqueRows.slice(i, i + chunkSize);
        const hashes = chunk.map((row) => row.import_hash).filter(Boolean);
        const { data: existingHashes } = await supabase
          .from("payments")
          .select("import_hash")
          .eq("company_id", companyId)
          .in("import_hash", hashes);
        const existing = new Set((existingHashes ?? []).map((row) => row.import_hash));
        const missing = chunk.filter((row) => !existing.has(row.import_hash));
        if (!missing.length) continue;
        const { data, error } = await supabase
          .from("payments")
          .insert(missing)
          .select("id");
        if (error) {
          if ((error as any).code === "23505") continue;
          summary.errors.push(`payments chunk ${i}: ${error.message}`);
        } else created += data?.length ?? 0;
      }
      summary.created.payments = created;
      summary.skipped.payments = uniqueRows.length - created;
    }

    // ---------- 8. Estimates from HANDOFF_RAW (replace on re-import so Excel is source of truth) ----------
    {
      const byCode = new Map<string, Row[]>();
      handoffRaw.forEach((r) => {
        const code = norm(r["Project Code"]);
        if (!code) return;
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code)!.push(r);
      });
      let estCount = 0;
      let estReplaced = 0;
      let itemCount = 0;
      for (const [code, items] of byCode) {
        const projectId = projectByCode.get(code);
        if (!projectId) continue;
        const total = items.reduce((s, r) => s + (numOrNull(r["Total"]) ?? 0), 0);

        // Hash items to detect changes; only replace if content differs
        const fingerprint = await sha(items.map((r) =>
          `${norm(r["Group"])}|${norm(r["Item Title"])}|${numOrNull(r["Quantity"]) ?? ""}|${numOrNull(r["Rate"]) ?? ""}|${numOrNull(r["Total"]) ?? ""}`
        ).join("§"));

        const { data: existing } = await supabase
          .from("estimates")
          .select("id, raw_filename")
          .eq("project_id", projectId)
          .eq("source", "trifecta_os")
          .maybeSingle();

        if (existing) {
          if (existing.raw_filename === `Trifecta OS#${fingerprint}`) continue; // unchanged
          await supabase.from("estimate_items").delete().eq("estimate_id", existing.id);
          await supabase.from("estimates").delete().eq("id", existing.id);
          estReplaced++;
        }

        const { data: est, error: estErr } = await supabase.from("estimates").insert({
          company_id: companyId,
          division_id: defaultDivisionId,
          project_id: projectId,
          source: "trifecta_os",
          source_format: "xlsx",
          raw_filename: `Trifecta OS#${fingerprint}`,
          total,
          imported_by: user.id,
        }).select("id").single();
        if (estErr || !est) { summary.errors.push(`estimate ${code}: ${estErr?.message}`); continue; }
        estCount++;
        const itemRows = items.map((r, idx) => ({
          estimate_id: est.id,
          company_id: companyId,
          position: idx,
          description: norm(r["Item Title"]) || norm(r["description"]) || "Item",
          category: norm(r["Group"]) || norm(r["Category"]) || null,
          quantity: numOrNull(r["Quantity"]) ?? 1,
          unit: norm(r["UoM"]) || null,
          unit_price: numOrNull(r["Rate"]) ?? 0,
          total: numOrNull(r["Total"]) ?? 0,
        }));
        const { data: ins, error: itErr } = await supabase.from("estimate_items").insert(itemRows).select("id");
        if (itErr) summary.errors.push(`estimate_items ${code}: ${itErr.message}`);
        else itemCount += ins?.length ?? 0;
      }
      summary.created.estimates = estCount;
      summary.created.estimates_replaced = estReplaced;
      summary.created.estimate_items = itemCount;
    }

    // ---------- 9. Tasks ----------
    {
      let created = 0;
      const rows: any[] = [];
      const STATUS_MAP: Record<string, string> = { done: "completed", completed: "completed", pending: "pending", "in progress": "in_progress", "in_progress": "in_progress", blocked: "blocked" };
      let skippedTasks = 0;
      for (const r of tasksSheet) {
        const title = norm(r["Title"]);
        if (!title) continue;
        const code = norm(r["Project Code"]);
        const project_id = code ? projectByCode.get(code) ?? null : null;
        if (!project_id) {
          skippedTasks++;
          summary.pending_tasks.push({
            title,
            project_code: code || null,
            status: norm(r["Status"]) || null,
            phase: norm(r["Phase"]) || null,
            assignee: norm(r["Assignee"]) || null,
            start_date: dateOrNull(r["Start Date"]),
            end_date: dateOrNull(r["End Date"]),
            notes: norm(r["Notes"]) || null,
            raw: r,
          });
          continue;
        }
        const statusRaw = lower(r["Status"]);
        const status = STATUS_MAP[statusRaw] || "pending";
        const assignee = titleCase(norm(r["Assignee"]));
        const worker_id = assignee ? workerByName.get(lower(assignee)) ?? null : null;
        rows.push({
          company_id: companyId,
          division_id: defaultDivisionId,
          project_id,
          title,
          task_type: norm(r["Phase"]) || null,
          status,
          planned_start_date: dateOrNull(r["Start Date"]),
          planned_end_date: dateOrNull(r["End Date"]),
          assigned_worker_id: worker_id,
          notes: norm(r["Notes"]) || null,
        });
      }
      summary.skipped.tasks = skippedTasks;
      if (rows.length > 0) {
        const { data, error } = await supabase.from("tasks").insert(rows).select("id");
        if (error) summary.errors.push(`tasks: ${error.message}`);
        else created = data?.length ?? 0;
      }
      summary.created.tasks = created;
    }

    await supabase.from("import_runs").insert({
      company_id: companyId,
      user_id: user.id,
      source: sourceLabel,
      summary,
    });

    return new Response(JSON.stringify({ ok: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("import-trifecta-os error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
