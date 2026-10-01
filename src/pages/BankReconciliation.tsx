import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Upload, CheckCircle2, AlertTriangle, Unlink, Wand2, Receipt, DollarSign,
  Sparkles, User, Building2, Briefcase, Tag, HelpCircle, Download, FileSpreadsheet, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usd } from "@/lib/format";
import { ExpenseSheet } from "@/components/finance/ExpenseSheet";
import { PaymentSheet } from "@/components/finance/PaymentSheet";
import { BankTxEditSheet } from "@/components/finance/BankTxEditSheet";
import { Pencil } from "lucide-react";
import {
  parseBofaCsv,
  parseAmount,
  parseDate,
  detectFromDescription,
  pickBestMatch,
  STRICT_TOLERANCES,
  type Detection,
  type DetectionContext,
  type MatchCandidate,
} from "@/lib/bankDetect";

type BankTx = any;

const parseReconciliationXlsx = async (file: File) => {
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((name) => name.toLowerCase().includes("concili")) ?? wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  const jsonRows = ws ? XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: true }) : [];
  const rows = jsonRows.map((r, index) => {
    const dateRaw = r["Fecha"] ?? r["DATE"] ?? r["Date"];
    const amountRaw = r["Monto ($)"] ?? r["AMOUNT"] ?? r["Amount"];
    const description = String(r["Descripción banco"] ?? r["DESCRIPTION"] ?? r["Description"] ?? "").trim();
    const posted = dateRaw instanceof Date ? dateRaw.toISOString().slice(0, 10) : parseDate(dateRaw);
    const amount = typeof amountRaw === "number" ? amountRaw : parseAmount(amountRaw);
    if (!posted || !description || amount === null || amount === 0) return null;
    return {
      posted_on: posted,
      description,
      amount,
      running_balance: null,
          raw_row: Object.fromEntries(Object.entries({ ...r, source_sheet: sheetName, source_row: index + 2 }).map(([k, v]) => [k, String(v ?? "")])),
      warnings: String(r["Cliente / Proyecto"] ?? "").toLowerCase().includes("revisar") ? ["Marcado como REVISAR en el Excel"] : [],
    };
  }).filter(Boolean) as ReturnType<typeof parseBofaCsv>["rows"];
  return { rows, skipped: jsonRows.length - rows.length, warnings: [], header_found: rows.length > 0 };
};

const monthLabel = (posted: string | null | undefined) => {
  const key = String(posted ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return "Sin fecha";
  const [year, month] = key.split("-");
  const name = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("es-MX", { month: "long" });
  return `${name} ${year}`;
};

const BankReconciliation = () => {
  const qc = useQueryClient();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const reviewFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState<{ kind: "expense" | "payment"; tx: BankTx } | null>(null);
  const [tab, setTab] = useState("unmatched");
  const [search, setSearch] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [editTx, setEditTx] = useState<BankTx | null>(null);
  const [editLinked, setEditLinked] = useState<{ kind: "expense" | "payment"; record: any } | null>(null);

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["bank_transactions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bank_transactions")
        .select("*")
        .order("posted_on", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const summary = useMemo(() => {
    const total = txs.length;
    const unmatched = txs.filter((t: BankTx) => t.status === "unmatched");
    const matched = txs.filter((t: BankTx) => t.status === "matched");
    const suggested = txs.filter((t: BankTx) => t.status === "review");
    const ignored = txs.filter((t: BankTx) => t.status === "ignored");
    const sum = (arr: BankTx[]) => arr.reduce((s: number, t: BankTx) => s + Number(t.amount), 0);
    return {
      total,
      matchedCount: matched.length,
      ignoredCount: ignored.length,
      unmatchedCount: unmatched.length,
      suggestedCount: suggested.length,
      pendingDebits: sum(unmatched.filter((t: BankTx) => Number(t.amount) < 0)),
      pendingCredits: sum(unmatched.filter((t: BankTx) => Number(t.amount) > 0)),
      matchedDebits: sum(matched.filter((t: BankTx) => Number(t.amount) < 0)),
      matchedCredits: sum(matched.filter((t: BankTx) => Number(t.amount) > 0)),
      allDebits: sum(txs.filter((t: BankTx) => Number(t.amount) < 0)),
      allCredits: sum(txs.filter((t: BankTx) => Number(t.amount) > 0)),
    };
  }, [txs]);

  const normalize = (value: unknown) =>
    String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const visible = useMemo(() => {
    const byTab =
      tab === "all" ? txs
      : tab === "matched" ? txs.filter((t: BankTx) => t.status === "matched")
      : tab === "ignored" ? txs.filter((t: BankTx) => t.status === "ignored")
      : tab === "review" ? txs.filter((t: BankTx) => t.status === "review")
      : txs.filter((t: BankTx) => t.status === "unmatched");
    const q = normalize(search).trim();
    if (!q) return byTab;
    return byTab.filter((t: BankTx) =>
      normalize(`${t.description} ${t.posted_on} ${t.amount} ${monthLabel(t.posted_on)}`).includes(q),
    );
  }, [txs, tab, search]);

  const months = useMemo(() => {
    const map = new Map<string, {
      key: string; label: string; imported: number; duplicates: number; pending: number;
      matched: number; ignored: number; debits: number; credits: number; keys: Set<string>;
    }>();
    for (const t of txs as BankTx[]) {
      const key = String(t.posted_on ?? "").slice(0, 7);
      if (!key) continue;
      let row = map.get(key);
      if (!row) {
        row = {
          key, label: monthLabel(t.posted_on), imported: 0, duplicates: 0, pending: 0,
          matched: 0, ignored: 0, debits: 0, credits: 0, keys: new Set<string>(),
        };
        map.set(key, row);
      }
      row.imported += 1;
      const natural = `${t.posted_on}|${Number(t.amount).toFixed(2)}|${String(t.description ?? "").trim()}`;
      if (row.keys.has(natural)) row.duplicates += 1;
      else row.keys.add(natural);
      if (t.status === "unmatched" || t.status === "review") row.pending += 1;
      if (t.status === "matched") row.matched += 1;
      if (t.status === "ignored") row.ignored += 1;
      const amount = Number(t.amount) || 0;
      if (amount < 0) row.debits += amount; else row.credits += amount;
    }
    const q = normalize(search).trim();
    return [...map.values()]
      .sort((a, b) => (a.key < b.key ? 1 : -1))
      .filter((m) => !q || normalize(`${m.key} ${m.label}`).includes(q));
  }, [txs, search]);


  // Load detection context once
  const loadDetectionContext = async (companyId: string): Promise<DetectionContext> => {
    const [w, c, p] = await Promise.all([
      (supabase as any).from("workers").select("id, name").eq("company_id", companyId),
      (supabase as any).from("clients").select("id, name").eq("company_id", companyId),
      (supabase as any).from("projects").select("id, name, project_code").eq("company_id", companyId),
    ]);
    return {
      workers: (w.data ?? []).filter((x: any) => x?.name),
      clients: (c.data ?? []).filter((x: any) => x?.name),
      projects: (p.data ?? []).filter((x: any) => x?.name),
    };
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const isExcel = /\.xlsx?$|spreadsheet|excel/i.test(file.name) || /spreadsheet|excel/i.test(file.type);
      const parsed = isExcel ? await parseReconciliationXlsx(file) : parseBofaCsv(await file.text());
      if (!parsed.rows.length) {
        toast.error("No se encontraron movimientos válidos en el archivo");
        return;
      }
      if (parsed.warnings.length) {
        console.warn("CSV warnings", parsed.warnings);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      if (!profile?.company_id) throw new Error("No company");

      const ctx = await loadDetectionContext(profile.company_id);

      const inserts = parsed.rows.map((r) => {
        const detection = detectFromDescription(r.description, r.amount, ctx);
        return {
          company_id: profile.company_id,
          posted_on: r.posted_on,
          description: r.description,
          amount: r.amount,
          running_balance: r.running_balance,
          source: isExcel ? "reconciliation_xlsx" : "bofa",
          direction: r.amount < 0 ? "debit" : "credit",
          status: "unmatched",
          raw: {
            row: r.raw_row,
            parse_warnings: r.warnings,
            detection,
          },
        };
      });

      // Deduplicación explícita: leemos lo que ya existe en el rango de fechas del archivo
      // y sólo insertamos lo nuevo (el upsert por onConflict no aplica al índice real).
      const dates = inserts.map((r) => r.posted_on).sort();
      const naturalKey = (r: { posted_on: string; amount: number | string; description: string }) =>
        `${r.posted_on}|${Number(r.amount).toFixed(2)}|${String(r.description).trim()}`;

      const { data: existingRows, error: existingError } = await (supabase as any)
        .from("bank_transactions")
        .select("posted_on, amount, description")
        .eq("company_id", profile.company_id)
        .gte("posted_on", dates[0])
        .lte("posted_on", dates[dates.length - 1]);
      if (existingError) throw existingError;
      const existingKeys = new Set((existingRows ?? []).map((r: any) => naturalKey(r)));

      const seen = new Set<string>();
      const fresh = inserts.filter((r) => {
        const key = naturalKey(r);
        if (existingKeys.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const dup = inserts.length - fresh.length;

      let ok = 0;
      const newlyInserted: any[] = [];
      for (let i = 0; i < fresh.length; i += 200) {
        const chunk = fresh.slice(i, i + 200);
        const { data, error } = await (supabase as any)
          .from("bank_transactions")
          .insert(chunk)
          .select("id, raw, amount, description, posted_on");
        if (error) throw error;
        ok += data?.length ?? 0;
        newlyInserted.push(...(data ?? []));
      }

      // Build dudosas list: rows with any flag or warnings
      const dudosas = newlyInserted.filter((row: any) => {
        const det = row?.raw?.detection as Detection | undefined;
        const warns = (row?.raw?.parse_warnings ?? []) as string[];
        return (det?.flags?.length ?? 0) > 0 || warns.length > 0;
      });

      if (!ok && dup) {
        toast.info(`Encontré ${dup} duplicados y no se subió el archivo`);
      } else {
        toast.success(`${ok} importados · ${dup} duplicados · ${dudosas.length} a revisar`);
      }

      qc.invalidateQueries({ queryKey: ["bank_transactions"] });

      if (dudosas.length) {
        setReviewIds(dudosas.map((r) => r.id));
        setReviewOpen(true);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Error importando CSV");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleUploadToReview = async (file: File) => {
    setBusy(true);
    try {
      const isExcel = /\.xlsx?$|spreadsheet|excel/i.test(file.name) || /spreadsheet|excel/i.test(file.type);
      const parsed = isExcel ? await parseReconciliationXlsx(file) : parseBofaCsv(await file.text());
      if (!parsed.rows.length) { toast.error("No se encontraron movimientos válidos"); return; }
      const rows = parsed.rows.map((r) => ({
        date: r.posted_on, amount: r.amount, description: r.description,
        running_balance: r.running_balance,
      }));
      const { data, error } = await supabase.functions.invoke("import-stage", {
        body: { file_name: file.name, source: "bank", rows },
      });
      if (error) throw error;
      toast.success(`${data.totals?.totalRows ?? 0} filas en revisión`);
      nav(`/import-review/${data.import_file_id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Error subiendo a revisión");
    } finally {
      setBusy(false);
      if (reviewFileRef.current) reviewFileRef.current.value = "";
    }
  };

  const autoMatch = async () => {
    setBusy(true);
    try {
      const pending = txs.filter((t: BankTx) => t.status === "unmatched" || t.status === "review");
      if (!pending.length) { toast.info("Nada que conciliar"); return; }
      const companyId = pending.find((t: BankTx) => t.company_id)?.company_id;
      const ctx = companyId ? await loadDetectionContext(companyId) : { workers: [], clients: [], projects: [] };
      const minDate = pending.reduce((m: string, t: BankTx) => t.posted_on < m ? t.posted_on : m, pending[0].posted_on);
      const maxDate = pending.reduce((m: string, t: BankTx) => t.posted_on > m ? t.posted_on : m, pending[0].posted_on);
      // Expand window by tolerance days
      const expand = (d: string, days: number) => {
        const dt = new Date(d);
        dt.setDate(dt.getDate() + days);
        return dt.toISOString().slice(0, 10);
      };
      const lo = expand(minDate, -STRICT_TOLERANCES.daysWindow);
      const hi = expand(maxDate, STRICT_TOLERANCES.daysWindow);

      const [expRes, payRes] = await Promise.all([
        (supabase as any).from("expenses")
          .select("id, amount, spent_on, project_id, description, vendors(name)")
          .gte("spent_on", lo).lte("spent_on", hi).is("bank_transaction_id", null),
        (supabase as any).from("payments")
          .select("id, amount, received_on, project_id, notes, clients(name)")
          .gte("received_on", lo).lte("received_on", hi).is("bank_transaction_id", null),
      ]);

      const expCands: MatchCandidate[] = (expRes.data ?? []).map((e: any) => ({
        id: e.id, amount: Number(e.amount), date: e.spent_on, vendor_name: e.vendors?.name ?? null,
        description: e.description, project_id: e.project_id,
      }));
      const payCands: MatchCandidate[] = (payRes.data ?? []).map((p: any) => ({
        id: p.id, amount: Number(p.amount), date: p.received_on, client_name: p.clients?.name ?? null,
        description: p.notes, project_id: p.project_id,
      }));

      let matched = 0, suggested = 0;
      for (const t of pending) {
        const detection: Detection = detectFromDescription(t.description, Number(t.amount), ctx);
        const isDebit = Number(t.amount) < 0;
        const result = pickBestMatch(
          { amount: Number(t.amount), posted_on: t.posted_on },
          detection,
          isDebit ? expCands : payCands,
        );
        if (result.status === "none") {
          await (supabase as any).from("bank_transactions").update({ raw: { ...(t.raw ?? {}), detection } }).eq("id", t.id);
          continue;
        }

        const update: any = {
          match_confidence: Number(result.confidence.toFixed(3)),
          raw: { ...(t.raw ?? {}), detection, last_match: { breakdown: result.breakdown, alternatives: result.alternatives, status: result.status } },
        };

        if (result.status === "matched") {
          update.status = "matched";
          update.reconciled_at = new Date().toISOString();
          if (isDebit) {
            update.matched_expense_id = result.candidate!.id;
            update.matched_payment_id = null;
            await (supabase as any).from("expenses").update({ bank_transaction_id: t.id, reconciled_at: new Date().toISOString() }).eq("id", result.candidate!.id);
          } else {
            update.matched_payment_id = result.candidate!.id;
            update.matched_expense_id = null;
            await (supabase as any).from("payments").update({ bank_transaction_id: t.id, reconciled_at: new Date().toISOString() }).eq("id", result.candidate!.id);
          }
          matched++;
        } else {
          // suggested — do not link yet; save suggestion in raw and flip status to review
          update.status = "review";
          update.raw.suggestion = {
            kind: isDebit ? "expense" : "payment",
            id: result.candidate!.id,
            confidence: result.confidence,
          };
          suggested++;
        }

        const { error } = await (supabase as any).from("bank_transactions").update(update).eq("id", t.id);
        if (error) console.error("update tx failed", error);
      }
      toast.success(`${matched} conciliados · ${suggested} sugeridos para revisar`);
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error en auto-match");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (tx: BankTx, status: "unmatched" | "ignored") => {
    const patch: any = { status, reconciled_at: status === "ignored" ? new Date().toISOString() : null };
    if (status === "unmatched") {
      patch.matched_expense_id = null;
      patch.matched_payment_id = null;
      patch.match_confidence = null;
    }
    if (tx.matched_expense_id) await (supabase as any).from("expenses").update({ bank_transaction_id: null, reconciled_at: null }).eq("id", tx.matched_expense_id);
    if (tx.matched_payment_id) await (supabase as any).from("payments").update({ bank_transaction_id: null, reconciled_at: null }).eq("id", tx.matched_payment_id);
    const { error } = await (supabase as any).from("bank_transactions").update(patch).eq("id", tx.id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["bank_transactions"] });
  };

  const acceptSuggestion = async (tx: BankTx) => {
    const sug = tx.raw?.suggestion;
    if (!sug?.id) { toast.error("Sin sugerencia para esta transacción"); return; }
    const isDebit = Number(tx.amount) < 0;
    const update: any = {
      status: "matched",
      reconciled_at: new Date().toISOString(),
      match_confidence: sug.confidence,
      matched_expense_id: isDebit ? sug.id : null,
      matched_payment_id: isDebit ? null : sug.id,
    };
    if (isDebit) {
      await (supabase as any).from("expenses").update({ bank_transaction_id: tx.id, reconciled_at: new Date().toISOString() }).eq("id", sug.id);
    } else {
      await (supabase as any).from("payments").update({ bank_transaction_id: tx.id, reconciled_at: new Date().toISOString() }).eq("id", sug.id);
    }
    const { error } = await (supabase as any).from("bank_transactions").update(update).eq("id", tx.id);
    if (error) toast.error(error.message);
    else { toast.success("Conciliado"); qc.invalidateQueries({ queryKey: ["bank_transactions"] }); }
  };

  const rejectSuggestion = async (tx: BankTx) => {
    const newRaw = { ...(tx.raw ?? {}) };
    delete newRaw.suggestion;
    const { error } = await (supabase as any).from("bank_transactions").update({ status: "unmatched", raw: newRaw }).eq("id", tx.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bank_transactions"] });
  };

  const openLinkedEditor = async (tx: BankTx) => {
    const sug = tx.raw?.suggestion;
    const isExpense = sug?.kind === "expense" || !!tx.matched_expense_id;
    const id = sug?.id ?? tx.matched_expense_id ?? tx.matched_payment_id;
    if (!id) { toast.error("No hay gasto/pago vinculado para editar"); return; }
    const table = isExpense ? "expenses" : "payments";
    const { data, error } = await (supabase as any).from(table).select("*").eq("id", id).single();
    if (error) { toast.error(error.message); return; }
    setEditLinked({ kind: isExpense ? "expense" : "payment", record: data });
  };

  const reviewTxs = useMemo(() => txs.filter((t: BankTx) => reviewIds.includes(t.id)), [txs, reviewIds]);

  const exportReviewWorkbook = async () => {
    try {
      setBusy(true);
      toast.loading("Generando Excel de revisión…", { id: "review-xlsx" });
      const [expRes, payRes, projRes, catRes] = await Promise.all([
        (supabase as any).from("expenses").select("id, spent_on, amount, description, project_id, category_id, vendor_id, projects(name), categories(name), vendors(name)"),
        (supabase as any).from("payments").select("id, received_on, amount, method, project_id, client_id, projects(name), clients(name)"),
        (supabase as any).from("projects").select("id, name, is_sandbox"),
        (supabase as any).from("categories").select("id, name"),
      ]);
      const expenses = (expRes.data ?? []) as any[];
      const payments = (payRes.data ?? []) as any[];

      const matchedExpIds = new Set(txs.filter((t: any) => t.matched_expense_id).map((t: any) => t.matched_expense_id));
      const matchedPayIds = new Set(txs.filter((t: any) => t.matched_payment_id).map((t: any) => t.matched_payment_id));

      // Sheet 1 — Banco sin match
      const bankUnmatched = txs.filter((t: any) => t.status === "unmatched").map((t: any) => ({
        Fecha: t.posted_on, Monto: Number(t.amount),
        Descripción: t.description, Dirección: t.direction ?? "",
        Estado: t.status, Notas: t.notes ?? "",
      }));

      // Sheet 2 — OS sin match (registros sin link a un movimiento bancario)
      const osUnmatched: any[] = [
        ...expenses.filter((e) => !matchedExpIds.has(e.id)).map((e) => ({
          Tipo: "Gasto", Fecha: e.spent_on, Monto: -Math.abs(Number(e.amount)),
          Proyecto: e.projects?.name ?? "", Categoría: e.categories?.name ?? "",
          Vendor: e.vendors?.name ?? "", Descripción: e.description ?? "",
        })),
        ...payments.filter((p) => !matchedPayIds.has(p.id)).map((p) => ({
          Tipo: "Pago", Fecha: p.received_on, Monto: Math.abs(Number(p.amount)),
          Proyecto: p.projects?.name ?? "", Categoría: "", Vendor: p.clients?.name ?? "",
          Descripción: p.method ?? "",
        })),
      ].sort((a, b) => String(a.Fecha).localeCompare(String(b.Fecha)));

      // Sheet 3 — Diferencias parciales (sugeridos: match con confianza media)
      const partials = txs.filter((t: any) => t.status === "review").map((t: any) => {
        const sugg = t.raw?.suggestion ?? {};
        return {
          Fecha_Banco: t.posted_on, Monto_Banco: Number(t.amount), Descripción_Banco: t.description,
          Confianza: t.match_confidence ?? sugg.confidence ?? "",
          Sugerencia_Tipo: sugg.kind ?? "", Sugerencia_ID: sugg.target_id ?? "",
          Sugerencia_Detalle: sugg.summary ?? "",
        };
      });

      // Sheet 4 — Resumen por proyecto y categoría
      // Uses the unified ledger so totals match Dashboard / Reports / ProjectDetail.
      const { fetchLedger, aggregateCompany } = await import("@/lib/financialLedger");
      const { computeOverheadByProject } = await import("@/lib/overhead");
      const [ledger, ohExpRes] = await Promise.all([
        fetchLedger(),
        (supabase as any).from("expenses").select("project_id, amount, spent_on, is_overhead"),
      ]);
      const sandboxIds = new Set<string>((projRes.data ?? []).filter((p: any) => p.is_sandbox).map((p: any) => p.id as string));
      const overheadMap = computeOverheadByProject(
        (ohExpRes.data ?? []) as any[],
        (projRes.data ?? []) as any[],
      );
      const company = aggregateCompany(ledger, overheadMap, { excludeProjectIds: sandboxIds });
      const projectNameById = new Map((projRes.data ?? []).map((p: any) => [p.id, p.name]));
      const projSummary = Array.from(company.byProject.entries())
        .map(([pid, f]) => ({
          Proyecto: projectNameById.get(pid) ?? "—",
          Cobrado: f.confirmedRevenue,
          Gastado: f.confirmedExpenses,
          Utilidad: f.confirmedProfit,
          "Revisar (gasto)": f.needsReviewExpenses,
          "Revisar (ingreso)": f.needsReviewRevenue,
        }))
        .sort((a, b) => b.Utilidad - a.Utilidad);

      // Category breakdown (confirmed expenses only, sandbox excluded).
      const catTotals = new Map<string, number>();
      for (const e of ledger) {
        if (e.direction !== "expense") continue;
        if (!(e.status === "confirmed" || e.status === "reconciled")) continue;
        if (e.project_id && sandboxIds.has(e.project_id)) continue;
        const name = e.category ?? "Sin categoría";
        catTotals.set(name, (catTotals.get(name) ?? 0) + Number(e.amount));
      }
      const catSummary = Array.from(catTotals.entries())
        .map(([Categoría, Total]) => ({ Categoría, Total }))
        .sort((a, b) => b.Total - a.Total);


      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bankUnmatched.length ? bankUnmatched : [{ Aviso: "Sin movimientos pendientes" }]), "Banco sin match");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(osUnmatched.length ? osUnmatched : [{ Aviso: "Todo conciliado" }]), "OS sin match");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partials.length ? partials : [{ Aviso: "Sin sugerencias parciales" }]), "Diferencias parciales");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        { Sección: "RESUMEN POR PROYECTO" }, ...projSummary,
        {}, { Sección: "RESUMEN POR CATEGORÍA" }, ...catSummary,
      ]), "Resumen");

      const filename = `revision_conciliacion_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success(`Excel descargado: ${filename}`, { id: "review-xlsx" });
    } catch (e: any) {
      toast.error(e?.message ?? "Error generando Excel", { id: "review-xlsx" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex-1">Conciliación bancaria</h1>
      </div>

      <Alert>
        <AlertTitle>Cómo usar esta página</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          <strong>Paso 1:</strong> Sube el CSV de Bank of America o el Excel "Conciliación Completa".{" "}
          <strong>Paso 2:</strong> Pulsa "Conciliar auto" — la app intenta cuadrar contra gastos/pagos ya registrados.{" "}
          <strong>Paso 3:</strong> Confirma sugerencias o crea gasto/pago para los que falten.{" "}
          <strong>Paso 4:</strong> Descarga el Excel de revisión para marcar a mano lo que aún no cuadra.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">1. Subir movimientos del banco</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <input ref={reviewFileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && handleUploadToReview(e.target.files[0])} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={busy} className="h-12">
              <Upload className="mr-2 h-5 w-5" /> {busy ? "Procesando…" : "Subir directo"}
            </Button>
            <Button onClick={autoMatch} disabled={busy || !txs.length} variant="outline" className="h-12">
              <Wand2 className="mr-2 h-5 w-5" /> Conciliar auto
            </Button>
          </div>
          <Button onClick={() => reviewFileRef.current?.click()} disabled={busy} variant="default" className="h-12 w-full">
            <Sparkles className="mr-2 h-5 w-5" /> Subir a revisión (recomendado · aplica reglas)
          </Button>
          <Button onClick={exportReviewWorkbook} disabled={busy} variant="secondary" className="h-12 w-full">
            <FileSpreadsheet className="mr-2 h-5 w-5" /> Descargar Excel de revisión (4 hojas)
          </Button>
          <p className="text-xs text-muted-foreground">
            Auto-detecto vendor, trabajador, cliente, proyecto y categoría desde la descripción; las filas con dudas se abren para confirmar.
            El Excel de revisión incluye: <em>Banco sin match</em>, <em>OS sin match</em>, <em>Diferencias parciales</em> y <em>Resumen por proyecto/categoría</em>.
          </p>
          {summary.suggestedCount > 0 && (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertTitle>{summary.suggestedCount} sugerencias pendientes</AlertTitle>
              <AlertDescription>
                Hay coincidencias con confianza entre {Math.round(STRICT_TOLERANCES.suggestThreshold * 100)}% y {Math.round(STRICT_TOLERANCES.matchedThreshold * 100)}%. Revísalas en la pestaña "Sugeridas".
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Resumen del día */}
      <Card className="border border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Resumen — {today}
            </CardTitle>
            <span className="text-xs text-muted-foreground">{summary.total} movimientos</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progreso de conciliación</span>
              <span className="font-medium">
                {summary.total === 0 ? 0 : Math.round((summary.matchedCount / summary.total) * 100)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-success transition-all"
                style={{ width: `${summary.total === 0 ? 0 : (summary.matchedCount / summary.total) * 100}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-success" />Conciliados {summary.matchedCount}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-primary" />Sugeridos {summary.suggestedCount}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-warning" />Pendientes {summary.unmatchedCount}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />Ignorados {summary.ignoredCount}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Cargos pendientes" value={usd(summary.pendingDebits)} tone="destructive" count={txs.filter((t:BankTx)=>t.status==="unmatched"&&Number(t.amount)<0).length} />
            <SummaryTile label="Abonos pendientes" value={usd(summary.pendingCredits)} tone="success" count={txs.filter((t:BankTx)=>t.status==="unmatched"&&Number(t.amount)>0).length} />
            <SummaryTile label="Cargos conciliados" value={usd(summary.matchedDebits)} tone="destructive" count={txs.filter((t:BankTx)=>t.status==="matched"&&Number(t.amount)<0).length} />
            <SummaryTile label="Abonos conciliados" value={usd(summary.matchedCredits)} tone="success" count={txs.filter((t:BankTx)=>t.status==="matched"&&Number(t.amount)>0).length} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Diferencia con el CSV</p>
              <p className="text-sm text-muted-foreground">Total cargos + abonos vs. conciliado</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${Math.abs(summary.allDebits + summary.allCredits - summary.matchedDebits - summary.matchedCredits) < 0.01 ? "text-success" : "text-warning"}`}>
                {usd(summary.allDebits + summary.allCredits - summary.matchedDebits - summary.matchedCredits)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {usd(summary.allDebits + summary.allCredits)} CSV · {usd(summary.matchedDebits + summary.matchedCredits)} conciliado
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="unmatched">Pendientes</TabsTrigger>
          <TabsTrigger value="review">Sugeridas {summary.suggestedCount > 0 && <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">{summary.suggestedCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="matched">Conciliados</TabsTrigger>
          <TabsTrigger value="ignored">Ignorados</TabsTrigger>
          <TabsTrigger value="months">Por mes</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "months" ? "Buscar mes (ej. julio, 2026-07)" : "Buscar por descripción, monto o fecha"}
            className="pl-9"
          />
        </div>

        <TabsContent value={tab} className="mt-3 space-y-2">
          {tab === "months" ? (
            <>
              {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
              {!isLoading && months.length === 0 && (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Todavía no hay movimientos importados.</CardContent></Card>
              )}
              {months.map((m) => (
                <Card key={m.key}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold capitalize">{m.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {usd(m.credits)} cobros · {usd(m.debits)} gastos
                        </p>
                      </div>
                      <Badge variant={m.pending > 0 ? "outline" : "secondary"} className="shrink-0">
                        {m.pending > 0 ? `${m.pending} por revisar` : "Al día"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Importados</p>
                        <p className="text-base font-semibold">{m.imported}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Duplicados</p>
                        <p className={`text-base font-semibold ${m.duplicates > 0 ? "text-destructive" : ""}`}>{m.duplicates}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pendientes</p>
                        <p className={`text-base font-semibold ${m.pending > 0 ? "text-amber-600" : ""}`}>{m.pending}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{m.matched} conciliados</span>
                      <span>·</span>
                      <span>{m.ignored} ignorados</span>
                    </div>
                    {m.pending > 0 && (
                      <Button size="sm" variant="outline" onClick={() => { setSearch(m.key); setTab("unmatched"); }}>
                        Ver pendientes de {m.label}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <>
              {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
              {!isLoading && visible.length === 0 && (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No hay movimientos en esta vista.</CardContent></Card>
              )}
              {visible.map((t: BankTx) => (
                <TxCard
                  key={t.id}
                  tx={t}
                  onEdit={() => setEditTx(t)}
                  onCreateExpense={() => setCreate({ kind: "expense", tx: t })}
                  onCreatePayment={() => setCreate({ kind: "payment", tx: t })}
                  onIgnore={() => setStatus(t, "ignored")}
                  onUnmatch={() => setStatus(t, "unmatched")}
                  onAcceptSuggestion={() => acceptSuggestion(t)}
                  onRejectSuggestion={() => rejectSuggestion(t)}
                  onEditLinked={() => openLinkedEditor(t)}
                />
              ))}
            </>
          )}
        </TabsContent>

      </Tabs>

      <BankTxEditSheet open={!!editTx} onOpenChange={(v) => { if (!v) setEditTx(null); }} tx={editTx} />

      <ExpenseSheet
        open={editLinked?.kind === "expense"}
        onOpenChange={(v) => { if (!v) { setEditLinked(null); qc.invalidateQueries({ queryKey: ["bank_transactions"] }); } }}
        expense={editLinked?.kind === "expense" ? editLinked.record : null}
      />
      <PaymentSheet
        open={editLinked?.kind === "payment"}
        onOpenChange={(v) => { if (!v) { setEditLinked(null); qc.invalidateQueries({ queryKey: ["bank_transactions"] }); } }}
        payment={editLinked?.kind === "payment" ? editLinked.record : null}
      />

      <ExpenseSheet
        open={create?.kind === "expense"}
        onOpenChange={(v) => { if (!v) { setCreate(null); qc.invalidateQueries({ queryKey: ["bank_transactions"] }); } }}
        initialValues={create?.kind === "expense" && create.tx ? {
          amount: Math.abs(Number(create.tx.amount)),
          spent_on: create.tx.posted_on,
          description: create.tx.description,
          new_vendor: create.tx.raw?.detection?.vendor ?? "",
          unassigned: !create.tx.raw?.detection?.project?.id,
          project_id: create.tx.raw?.detection?.project?.id ?? null,
          bank_transaction_id: create.tx.id,
        } : null}
      />
      <PaymentSheet
        open={create?.kind === "payment"}
        onOpenChange={(v) => { if (!v) { setCreate(null); qc.invalidateQueries({ queryKey: ["bank_transactions"] }); } }}
        initialValues={create?.kind === "payment" && create.tx ? {
          amount: Math.abs(Number(create.tx.amount)),
          received_on: create.tx.posted_on,
          notes: create.tx.description,
          new_client: create.tx.raw?.detection?.vendor ?? "",
          client_id: create.tx.raw?.detection?.client?.id ?? null,
          project_id: create.tx.raw?.detection?.project?.id ?? null,
          method: create.tx.raw?.detection?.raw_kind === "zelle_in" ? "zelle" : create.tx.raw?.detection?.raw_kind === "ach_credit" ? "ach" : "other",
          bank_transaction_id: create.tx.id,
        } : null}
      />

      {/* Pre-revisión de filas dudosas */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-warning" /> Revisar transacciones con dudas</DialogTitle>
            <DialogDescription>
              Estas {reviewTxs.length} filas tienen señales que necesitan confirmación: vendor no identificado, posible trabajador/cliente ambiguo, fecha rara o monto inusual. No se crearon gastos ni pagos automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {reviewTxs.map((t: BankTx) => (
              <ReviewRow key={t.id}
                tx={t}
                onCreateExpense={() => { setReviewOpen(false); setCreate({ kind: "expense", tx: t }); }}
                onCreatePayment={() => { setReviewOpen(false); setCreate({ kind: "payment", tx: t }); }}
                onIgnore={async () => { await setStatus(t, "ignored"); }}
              />
            ))}
            {!reviewTxs.length && (
              <p className="p-4 text-center text-sm text-muted-foreground">Todas las filas dudosas se resolvieron.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============================================================
// Sub-components
// ============================================================

const SummaryTile = ({ label, value, tone, count }: { label: string; value: string; tone?: "success" | "destructive"; count?: number }) => (
  <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-lg font-bold ${tone === "destructive" ? "text-destructive" : tone === "success" ? "text-success" : ""}`}>{value}</p>
    {count !== undefined && <p className="text-[10px] text-muted-foreground">{count} items</p>}
  </div>
);

const StatusBadge = ({ status, confidence }: { status: string; confidence?: number | null }) => {
  if (status === "matched") return <span className="pill pill-success"><CheckCircle2 className="mr-1 h-3 w-3" />Conciliado{confidence ? ` ${Math.round(confidence * 100)}%` : ""}</span>;
  if (status === "review") return <span className="pill pill-info"><Sparkles className="mr-1 h-3 w-3" />Sugerido{confidence ? ` ${Math.round(confidence * 100)}%` : ""}</span>;
  if (status === "ignored") return <span className="pill pill-muted">Ignorado</span>;
  return <span className="pill pill-pending"><AlertTriangle className="mr-1 h-3 w-3" />Pendiente</span>;
};

const DetectionChips = ({ detection }: { detection: Detection }) => {
  if (!detection) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {detection.vendor && (
        <Badge variant="outline" className="text-[10px] font-normal"><Tag className="mr-1 h-2.5 w-2.5" />{detection.vendor}</Badge>
      )}
      {detection.worker && (
        <Badge variant="outline" className="text-[10px] font-normal"><User className="mr-1 h-2.5 w-2.5" />{detection.worker.name}</Badge>
      )}
      {detection.client && (
        <Badge variant="outline" className="text-[10px] font-normal"><Building2 className="mr-1 h-2.5 w-2.5" />{detection.client.name}</Badge>
      )}
      {detection.project && (
        <Badge variant="outline" className="text-[10px] font-normal"><Briefcase className="mr-1 h-2.5 w-2.5" />{detection.project.name}</Badge>
      )}
      {detection.category_guess && (
        <Badge variant="outline" className="border-primary/30 text-[10px] font-normal text-primary">{detection.category_guess}</Badge>
      )}
    </div>
  );
};

const TxCard = ({ tx, onEdit, onCreateExpense, onCreatePayment, onIgnore, onUnmatch, onAcceptSuggestion, onRejectSuggestion, onEditLinked }: {
  tx: BankTx;
  onEdit: () => void;
  onCreateExpense: () => void;
  onCreatePayment: () => void;
  onIgnore: () => void;
  onUnmatch: () => void;
  onAcceptSuggestion: () => void;
  onRejectSuggestion: () => void;
  onEditLinked: () => void;
}) => {
  const detection = tx.raw?.detection as Detection | undefined;
  const hasSuggestion = tx.status === "review" && tx.raw?.suggestion?.id;
  const isDebit = Number(tx.amount) < 0;
  const edgeClass =
    tx.status === "matched" ? "edge edge-success"
    : tx.status === "review" ? "edge edge-info"
    : tx.status === "ignored" ? "edge edge-muted"
    : "edge edge-pending";
  return (
    <Card className="relative overflow-hidden">
      <span className={edgeClass} aria-hidden />
      <CardContent className="space-y-2 p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">{tx.description}</p>
            <p className="text-[11px] text-muted-foreground">
              <span className="money">{tx.posted_on}</span> · {isDebit ? "Cargo" : "Abono"}
            </p>
          </div>
          <p className={`money text-base font-bold ${isDebit ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
            {isDebit ? "−" : "+"}{usd(Math.abs(Number(tx.amount)))}
          </p>
        </div>
        {detection && <DetectionChips detection={detection} />}
        {detection?.flags?.length ? (
          <p className="text-[10px] text-warning-foreground/80">⚠ {detection.flags.join(" · ")}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={tx.status} confidence={tx.match_confidence} />
          <div className="ml-auto flex flex-wrap gap-1">
            {hasSuggestion && (
              <>
                <Button size="sm" onClick={onAcceptSuggestion}><CheckCircle2 className="mr-1 h-3 w-3" /> Aceptar</Button>
                <Button size="sm" variant="outline" onClick={onEditLinked}>
                  <Pencil className="mr-1 h-3 w-3" /> Editar sugerido
                </Button>
                <Button size="sm" variant="ghost" onClick={onRejectSuggestion}>Rechazar</Button>
              </>
            )}
            {tx.status === "matched" && (tx.matched_expense_id || tx.matched_payment_id) && (
              <Button size="sm" variant="outline" onClick={onEditLinked}>
                <Pencil className="mr-1 h-3 w-3" /> Editar registro
              </Button>
            )}
            {(tx.status === "unmatched" || tx.status === "review") && isDebit && (
              <Button size="sm" variant="outline" onClick={onCreateExpense}>
                <Receipt className="mr-1 h-3 w-3" /> Crear/editar gasto
              </Button>
            )}
            {(tx.status === "unmatched" || tx.status === "review") && !isDebit && (
              <Button size="sm" variant="outline" onClick={onCreatePayment}>
                <DollarSign className="mr-1 h-3 w-3" /> Crear/editar pago
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Editar
            </Button>
            {tx.status !== "ignored" && (
              <Button size="sm" variant="ghost" onClick={onIgnore}>Ignorar</Button>
            )}
            {tx.status !== "unmatched" && (
              <Button size="sm" variant="ghost" onClick={onUnmatch}>
                <Unlink className="mr-1 h-3 w-3" /> Desconciliar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};


const ReviewRow = ({ tx, onCreateExpense, onCreatePayment, onIgnore }: {
  tx: BankTx;
  onCreateExpense: () => void;
  onCreatePayment: () => void;
  onIgnore: () => void;
}) => {
  const detection = tx.raw?.detection as Detection | undefined;
  const warns = (tx.raw?.parse_warnings ?? []) as string[];
  const isDebit = Number(tx.amount) < 0;
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{tx.description}</p>
          <p className="text-xs text-muted-foreground">{tx.posted_on} · {isDebit ? "Cargo" : "Abono"}</p>
        </div>
        <p className={`text-sm font-bold ${isDebit ? "text-destructive" : "text-success"}`}>{usd(Number(tx.amount))}</p>
      </div>
      {detection && <DetectionChips detection={detection} />}
      {[...(detection?.flags ?? []), ...warns].length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-warning">
          {[...(detection?.flags ?? []), ...warns].map((f, i) => (
            <li key={i}>⚠ {f}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1">
        {isDebit ? (
          <Button size="sm" variant="outline" onClick={onCreateExpense}><Receipt className="mr-1 h-3 w-3" /> Crear/editar gasto</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onCreatePayment}><DollarSign className="mr-1 h-3 w-3" /> Crear/editar pago</Button>
        )}
        <Button size="sm" variant="ghost" onClick={onIgnore}>Ignorar</Button>
      </div>
    </div>
  );
};

export default BankReconciliation;
