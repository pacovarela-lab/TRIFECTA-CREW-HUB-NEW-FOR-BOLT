// Commits confirmed import_rows into expenses/payments/projects/tasks/bank_transactions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { v10LedgerKey } from "../_shared/v10-aliases.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYMENT_MAP: Record<string, string> = {
  zelle: "zelle", check: "check", cheque: "check", cash: "cash", efectivo: "cash",
  card: "card", "credit card": "card", credit: "card", debit: "card",
  ach: "ach", transfer: "ach", "bank transfer": "ach", wire: "ach", venmo: "venmo",
};
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type DbClient = ReturnType<typeof createClient>;
type ImportRow = {
  id: string;
  company_id: string;
  import_file_id: string;
  imported_record_id: string | null;
  import_hash: string | null;
  stable_key: string | null;
  ledger_transaction_id: string | null;
  bank_row: string | null;
  detected_type: string;
  parsed_amount: number | null;
  parsed_date: string | null;
  parsed_description: string | null;
  raw_json: Record<string, unknown> | null;
  suggested_project_id: string | null;
  suggested_category_id: string | null;
  suggested_vendor_id: string | null;
  suggested_worker_id: string | null;
  suggested_client_id: string | null;
  suggested_division_id: string | null;
  traceability_status: string | null;
  duplicate_classification: string | null;
  split_validation: string | null;
  split_group_id: string | null;
  component_sum: number | null;
  original_bank_amount: number | null;
  affects_project_profitability: boolean;
};

const mapPayment = (raw: unknown): string => PAYMENT_MAP[String(raw ?? "").toLowerCase().trim()] || "other";

async function findExistingRecord(supabase: DbClient, r: ImportRow, table: "expenses" | "payments") {
  if (r.imported_record_id) return r.imported_record_id;
  if (r.import_hash) {
    const { data } = await supabase
      .from(table)
      .select("id")
      .eq("company_id", r.company_id)
      .eq("import_hash", r.import_hash)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  const dateColumn = table === "payments" ? "received_on" : "spent_on";
  let q = supabase
    .from(table)
    .select("id")
    .eq("company_id", r.company_id)
    .eq(dateColumn, r.parsed_date)
    .gte("amount", Number(r.parsed_amount) - 0.01)
    .lte("amount", Number(r.parsed_amount) + 0.01)
    .limit(1);
  if (r.suggested_project_id) q = q.eq("project_id", r.suggested_project_id);
  const { data } = await q;
  return data?.[0]?.id ?? null;
}

const ledgerKey = (r: ImportRow): string | null =>
  v10LedgerKey(r.split_group_id, r.bank_row, r.stable_key ?? r.import_hash);

// Magnitude of the whole bank movement, never of a single component/leg.
const ledgerMagnitude = (r: ImportRow, groupMagnitude: number) => {
  const groupAmount = Number(r.original_bank_amount ?? r.component_sum ?? 0);
  if (r.split_group_id && groupAmount) return Math.abs(groupAmount);
  return Math.max(Math.abs(Number(r.parsed_amount ?? 0)), groupMagnitude);
};

// Idempotent bank ledger: keyed lookup first, insert second, and a unique-violation
// replay resolves to the existing row so a retry never double counts.
async function ensureBankTransaction(
  supabase: DbClient,
  r: ImportRow,
  groupMagnitude: number,
  isCredit: boolean,
  cache: Map<string, string>,
): Promise<string | null> {
  const externalRef = ledgerKey(r);
  if (!externalRef || !r.parsed_date) return null;
  const cached = cache.get(externalRef);
  if (cached) return cached;
  const magnitude = ledgerMagnitude(r, groupMagnitude);
  // A zero/zero movement (cash withdrawal shell) carries no bank effect on its own.
  if (!magnitude) return null;
  const lookup = async () => {
    const { data } = await supabase.from("bank_transactions")
      .select("id").eq("company_id", r.company_id).eq("external_ref", externalRef).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const existing = await lookup();
  if (existing) {
    cache.set(externalRef, existing);
    return existing;
  }
  const { data, error } = await supabase.from("bank_transactions").insert({
    company_id: r.company_id,
    posted_on: r.parsed_date,
    description: r.parsed_description ?? "",
    amount: isCredit ? magnitude : -magnitude,
    direction: isCredit ? "credit" : "debit",
    status: "unmatched",
    source: "v10_import",
    external_ref: externalRef,
    raw: { import_row_id: r.id, bank_row: r.bank_row, split_group_id: r.split_group_id },
  }).select("id").single();
  if (error) {
    // Either a concurrent insert of the same movement (same external_ref) or a
    // natural-key collision with an already published identical movement.
    const replay = await lookup() ?? await (async () => {
      const { data: natural } = await supabase.from("bank_transactions")
        .select("id")
        .eq("company_id", r.company_id)
        .eq("source", "v10_import")
        .eq("posted_on", r.parsed_date)
        .eq("amount", isCredit ? magnitude : -magnitude)
        .eq("description", r.parsed_description ?? "")
        .eq("external_ref", externalRef)
        .maybeSingle();
      return (natural?.id as string | undefined) ?? null;
    })();
    if (!replay) throw error;
    cache.set(externalRef, replay);
    return replay;
  }
  cache.set(externalRef, data.id as string);
  return data.id as string;
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "unsupported_media_type" }, 415);
  }
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(auth)) return jsonResponse({ error: "unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError) return jsonResponse({ error: "unauthorized" }, 401);
    const user = userData?.user;
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("company_id").eq("id", user.id).maybeSingle();
    if (profileError) throw new Error("profile_lookup_failed");
    if (!profile?.company_id) {
      return jsonResponse({ error: "no_company" }, 403);
    }
    const { data: roles, error: rolesError } = await supabase.from("user_roles")
      .select("role").eq("user_id", user.id).eq("company_id", profile.company_id);
    if (rolesError) throw new Error("role_lookup_failed");
    if (!(roles ?? []).some((item) => item.role === "admin" || item.role === "manager")) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }
    const rowIds = body.row_ids;
    const mode = body.mode === "ledger_only" ? "ledger_only" : "full";
    if (!Array.isArray(rowIds) || rowIds.length === 0 || rowIds.length > 1000 ||
      rowIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)) ||
      new Set(rowIds).size !== rowIds.length) {
      return jsonResponse({ error: "invalid_row_ids" }, 400);
    }

    // ledger_only claims review-tray rows without touching their status: they are
    // confirmed bank movements, but never become expenses/payments/profitability.
    const { data: rows, error: claimError } = await supabase
      .rpc(mode === "ledger_only" ? "claim_financial_ledger_rows" : "claim_financial_import_rows", { _row_ids: rowIds });
    if (claimError) {
      const message = claimError.message ?? "";
      if (/unauthorized/i.test(message)) return jsonResponse({ error: "unauthorized" }, 401);
      if (/forbidden/i.test(message)) return jsonResponse({ error: "forbidden" }, 403);
      if (/rows_unavailable|import_unavailable|invalid_rows|duplicate_row_ids/i.test(message)) {
        return jsonResponse({ error: "rows_unavailable" }, 409);
      }
      throw new Error("claim_failed");
    }
    if (!rows || rows.length !== rowIds.length ||
      rows.some((row: ImportRow) => row.company_id !== profile.company_id)) {
      return jsonResponse({ error: "rows_unavailable" }, 409);
    }

    const claimed = (rows ?? []) as ImportRow[];
    // Batch-level view of each bank movement so a shared Bank Row publishes the
    // real magnitude and direction, not the first leg processed.
    const groupMagnitude = new Map<string, number>();
    const groupCredit = new Map<string, boolean>();
    for (const r of claimed) {
      const key = ledgerKey(r);
      if (!key) continue;
      const amount = Math.abs(Number(r.parsed_amount ?? 0));
      groupMagnitude.set(key, Math.max(groupMagnitude.get(key) ?? 0, amount));
      const credit = Number(r.raw_json?.["Income"] ?? 0) > 0;
      groupCredit.set(key, (groupCredit.get(key) ?? false) || credit);
    }
    const ledgerCache = new Map<string, string>();

    let created = 0, skipped = 0, zeroEffect = 0;
    const errors: Array<{ row_id: string; error: string }> = [];
    for (const r of claimed) {
      try {
        // Pending bank rows, handoff analytics and real duplicates never publish.
        // Rows without a safe project still belong in the bank ledger.
        if (r.traceability_status === "PENDING_BANK_CONFIRMATION" ||
            r.traceability_status === "HANDOFF_ADJUSTMENT" ||
            (r.duplicate_classification === "possible_duplicate" ||
              r.duplicate_classification === "identical_duplicate") ||
            (r.duplicate_classification === "legitimate_split" && r.split_validation !== "valid")) {
          await supabase.from("import_rows").update({
            status: "pending",
            error_message: "blocked_by_policy",
          }).eq("id", r.id).eq("company_id", r.company_id).eq("status", "suggested");
          skipped++;
          continue;
        }
        // One bank transaction per bank movement (split group or shared Bank Row).
        const key = ledgerKey(r);
        const bankTransactionId = await ensureBankTransaction(
          supabase,
          r,
          key ? groupMagnitude.get(key) ?? 0 : 0,
          key ? groupCredit.get(key) ?? false : false,
          ledgerCache,
        );
        if (mode === "ledger_only") {
          // Ledger only: the movement is published, the row stays auditable in the
          // review tray (status untouched) and never creates expense/payment.
          await supabase.from("import_rows").update({
            ledger_transaction_id: bankTransactionId,
          }).eq("id", r.id).eq("company_id", r.company_id);
          if (bankTransactionId) {
            created++;
            await supabase.from("audit_logs").insert({
              company_id: r.company_id,
              user_id: user.id,
              action: "financial_import.ledger_only_published",
              entity_type: "bank_transaction",
              entity_id: bankTransactionId,
              metadata: {
                import_row_id: r.id,
                import_file_id: r.import_file_id,
                bank_row: r.bank_row ?? null,
                traceability_status: r.traceability_status ?? null,
              },
            });
          } else {
            zeroEffect++;
          }
          continue;
        }
        // Overhead has no project by design but must still reach expenses so the

        // monthly proration can distribute it; payments always need a safe project.
        const overheadExpense = r.traceability_status === "GENERAL_OVERHEAD_ALLOCATED" &&
          r.detected_type === "expense";
        const publishable = r.affects_project_profitability === true &&
          (r.suggested_project_id != null || overheadExpense);
        if (!publishable) {
          await supabase.from("import_rows").update({
            status: "imported",
            imported_record_id: bankTransactionId,
            imported_at: new Date().toISOString(),
            reviewed_by: user.id,
            error_message: null,
          }).eq("id", r.id);
          if (bankTransactionId) created++; else zeroEffect++;
          continue;
        }

        let recordId: string | null = null;
        if (r.detected_type === "expense") {

          if (!r.parsed_amount || !r.parsed_date) { skipped++; continue; }
          const existing = await findExistingRecord(supabase, r, "expenses");
          if (existing) {
            await supabase.from("import_rows").update({
              status: "imported",
              imported_record_id: existing,
              imported_at: new Date().toISOString(),
              reviewed_by: user.id,
              error_message: null,
            }).eq("id", r.id);
            skipped++;
            continue;
          }
          const { data, error: e } = await supabase.from("expenses").insert({
            company_id: r.company_id,
            project_id: r.suggested_project_id,
            division_id: r.suggested_division_id,
            category_id: r.suggested_category_id,
            vendor_id: r.suggested_vendor_id,
            worker_id: r.suggested_worker_id,
            amount: r.parsed_amount,
            spent_on: r.parsed_date,
            description: r.parsed_description,
            import_hash: r.import_hash,
            is_overhead: r.traceability_status === "GENERAL_OVERHEAD_ALLOCATED",
            bank_transaction_id: bankTransactionId,
            created_by: user.id,
          }).select("id").single();
          if (e) throw e;
          recordId = data.id;
        } else if (r.detected_type === "payment") {
          if (!r.parsed_amount || !r.parsed_date) { skipped++; continue; }
          const existing = await findExistingRecord(supabase, r, "payments");
          if (existing) {
            await supabase.from("import_rows").update({
              status: "imported",
              imported_record_id: existing,
              imported_at: new Date().toISOString(),
              reviewed_by: user.id,
              error_message: null,
            }).eq("id", r.id);
            skipped++;
            continue;
          }
          const method = mapPayment(r.raw_json?.payment_method ?? r.raw_json?.metodopago ?? r.raw_json?.paymentmethod);
          const { data, error: e } = await supabase.from("payments").insert({
            company_id: r.company_id,
            project_id: r.suggested_project_id,
            division_id: r.suggested_division_id,
            client_id: r.suggested_client_id,
            amount: r.parsed_amount,
            received_on: r.parsed_date,
            method,
            notes: r.parsed_description,
            import_hash: r.import_hash,
            bank_transaction_id: bankTransactionId,
            created_by: user.id,
          }).select("id").single();
          if (e) throw e;
          recordId = data.id;
        } else if (r.detected_type === "task") {
          const title = String(r.raw_json?.title ?? r.raw_json?.titulo ?? r.parsed_description ?? "Tarea importada").slice(0, 200);
          const { data, error: e } = await supabase.from("tasks").insert({
            company_id: r.company_id,
            project_id: r.suggested_project_id,
            title,
            status: "todo",
          }).select("id").single();
          if (e) throw e;
          recordId = data.id;
        } else if (r.detected_type === "bank_tx") {
          recordId = bankTransactionId;
        } else {
          skipped++; continue;
        }
        await supabase.from("import_rows").update({
          status: "imported",
          imported_record_id: recordId,
          imported_at: new Date().toISOString(),
          reviewed_by: user.id,
        }).eq("id", r.id);
        await supabase.from("audit_logs").insert({
          company_id: r.company_id,
          user_id: user.id,
          action: "financial_import.row_imported",
          entity_type: r.detected_type,
          entity_id: recordId,
          metadata: {
            import_row_id: r.id,
            import_file_id: r.import_file_id,
            bank_row: r.bank_row ?? null,
            traceability_status: r.traceability_status ?? null,
            stable_key: r.stable_key ?? r.import_hash ?? null,
          },
        });
        created++;
      } catch (error) {
        console.error("import_commit_row_failed", r.id, error instanceof Error ? error.message : "unexpected");
        errors.push({ row_id: r.id, error: "row_failed" });
        // Failures stay retriable. In full mode the row returns to 'confirmed';
        // in ledger_only mode the review row keeps its status so the tray stays
        // intact and the retry simply finds ledger_transaction_id still null.
        await supabase.from("import_rows").update(
          mode === "ledger_only"
            ? { error_message: "row_failed" }
            : { status: "confirmed", error_message: "row_failed" },
        ).eq("id", r.id);
      }
    }

    return jsonResponse({ created, skipped, zero_effect: zeroEffect, errors });
  } catch (error) {
    console.error("import_commit_failed", error instanceof Error ? error.message : "unexpected");
    return jsonResponse({ error: "commit_failed" }, 500);
  }
});
