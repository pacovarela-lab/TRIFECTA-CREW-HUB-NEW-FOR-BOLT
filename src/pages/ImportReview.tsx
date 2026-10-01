import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Copy, FileQuestion, Upload, RefreshCw, Wand2, Settings2, CalendarClock, Sparkles } from "lucide-react";
import { swapDayMonth, hasAmbiguousDates } from "@/lib/dateSwap";


type Row = {
  id: string;
  source_sheet: string | null;
  row_number: number;
  raw_json: Record<string, any>;
  detected_type: string;
  parsed_amount: number | null;
  parsed_date: string | null;
  parsed_description: string | null;
  suggested_project_id: string | null;
  suggested_category_id: string | null;
  suggested_vendor_id: string | null;
  suggested_client_id: string | null;
  confidence_score: number;
  status: string;
  error_message: string | null;
  imported_record_id: string | null;
  imported_at?: string | null;
  import_hash?: string | null;
  suggested_division_id?: string | null;
  suggested_worker_id?: string | null;
};


type Lookups = {
  projects: { id: string; project_code: string | null; name: string }[];
  vendors: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

type RuleDraft = {
  rowId: string;
  detected_type: string;
  raw_json: Record<string, any>;
  parsed_description: string | null;
  changes: {
    project_id?: string | null;
    category_id?: string | null;
    vendor_id?: string | null;
    client_id?: string | null;
  };
  projectLabel?: string;
  categoryLabel?: string;
  vendorLabel?: string;
  clientLabel?: string;
};


const GROUP_KEYS = [
  { key: "auto", label: "Aprobación automática", icon: CheckCircle2, color: "text-emerald-600", filter: (r: Row) => r.status === "suggested" },
  { key: "needs", label: "Requieren revisión", icon: AlertTriangle, color: "text-amber-600", filter: (r: Row) => r.status === "pending" && r.detected_type !== "unknown" },
  { key: "nomatch", label: "Sin coincidencia", icon: FileQuestion, color: "text-rose-600", filter: (r: Row) => r.detected_type === "unknown" && r.status === "pending" },
  { key: "dup", label: "Duplicados", icon: Copy, color: "text-slate-500", filter: (r: Row) => r.status === "duplicate" },
  { key: "imp", label: "Importados", icon: CheckCircle2, color: "text-blue-600", filter: (r: Row) => r.status === "imported" },
  { key: "excl", label: "Excluidos", icon: XCircle, color: "text-slate-400", filter: (r: Row) => r.status === "excluded" },
] as const;

export default function ImportReview() {
  const nav = useNavigate();
  const params = useParams<{ fileId?: string }>();
  const [files, setFiles] = useState<any[]>([]);
  const [activeFile, setActiveFile] = useState<any | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [lookups, setLookups] = useState<Lookups>({ projects: [], vendors: [], clients: [], categories: [] });
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<string>("auto");
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [dateFormatOpen, setDateFormatOpen] = useState(false);
  const originalRef = useRef<Map<string, Pick<Row, "suggested_project_id" | "suggested_category_id" | "suggested_vendor_id" | "suggested_client_id">>>(new Map());

  const loadFiles = async () => {
    const { data } = await supabase.from("import_files").select("*").order("created_at", { ascending: false }).limit(20);
    const fileRows = data ?? [];
    const ids = fileRows.map((f: any) => f.id);
    if (ids.length === 0) {
      setFiles([]);
      return;
    }
    const { data: statsRows } = await supabase
      .from("import_rows")
      .select("import_file_id, status, detected_type")
      .in("import_file_id", ids);

    const stats = new Map<string, { auto: number; needs: number; noMatch: number; imported: number }>();
    for (const f of fileRows) stats.set(f.id, { auto: 0, needs: 0, noMatch: 0, imported: 0 });
    for (const r of statsRows ?? []) {
      const s = stats.get((r as any).import_file_id);
      if (!s) continue;
      if ((r as any).status === "suggested") s.auto += 1;
      if ((r as any).status === "pending" && (r as any).detected_type !== "unknown") s.needs += 1;
      if ((r as any).status === "pending" && (r as any).detected_type === "unknown") s.noMatch += 1;
      if ((r as any).status === "imported") s.imported += 1;
    }
    setFiles(fileRows.map((f: any) => {
      const s = stats.get(f.id);
      return s ? {
        ...f,
        auto_approved_count: s.auto,
        needs_review_count: s.needs,
        no_match_count: s.noMatch,
        imported_count: s.imported,
      } : f;
    }));
  };


  const loadFile = async (fileId: string) => {
    setLoading(true);
    setSelected(new Set());
    const [{ data: file }, { data: rs }, lkProjects, lkVendors, lkClients, lkCategories] = await Promise.all([
      supabase.from("import_files").select("*").eq("id", fileId).single(),
      supabase.from("import_rows").select("*").eq("import_file_id", fileId).order("source_sheet").order("row_number"),
      supabase.from("projects").select("id, project_code, name"),
      supabase.from("vendors").select("id, name"),
      supabase.from("clients").select("id, name"),
      supabase.from("categories").select("id, name"),
    ]);
    setActiveFile(file);
    const loadedRows = (rs ?? []) as Row[];
    setRows(loadedRows);
    // snapshot original suggestions to detect user corrections later
    const snap = new Map<string, any>();
    loadedRows.forEach((r) => snap.set(r.id, {
      suggested_project_id: r.suggested_project_id,
      suggested_category_id: r.suggested_category_id,
      suggested_vendor_id: r.suggested_vendor_id,
      suggested_client_id: r.suggested_client_id,
    }));
    originalRef.current = snap;
    setLookups({
      projects: lkProjects.data ?? [],
      vendors: lkVendors.data ?? [],
      clients: lkClients.data ?? [],
      categories: lkCategories.data ?? [],
    });
    setLoading(false);
    // Auto-prompt for date format if file has ambiguous dates and no preference stored yet
    const meta = (file as any)?.metadata ?? {};
    if (!meta.date_format && hasAmbiguousDates(loadedRows.map((r) => {
      const v = r.raw_json?.date ?? r.raw_json?.Date ?? r.raw_json?.fecha ?? r.raw_json?.Fecha;
      return v ? String(v) : null;
    }))) {
      setDateFormatOpen(true);
    }
  };


  useEffect(() => { loadFiles(); }, []);
  useEffect(() => { if (params.fileId) loadFile(params.fileId); }, [params.fileId]);

  const grouped = useMemo(() => {
    const out: Record<string, Row[]> = {};
    for (const g of GROUP_KEYS) out[g.key] = rows.filter(g.filter);
    return out;
  }, [rows]);

  const visibleRows = grouped[tab] ?? [];
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visibleRows.forEach((r) => next.delete(r.id));
    else visibleRows.forEach((r) => next.add(r.id));
    setSelected(next);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  /** Propagate a row-level correction to the linked expense/payment (if already imported). */
  const propagateToRecord = async (row: Row, patch: Record<string, any>) => {
    if (!row.imported_record_id) return;
    const table = row.detected_type === "payment" ? "payments" : "expenses";
    const mapped: Record<string, any> = {};
    if ("parsed_date" in patch) {
      mapped[table === "payments" ? "received_on" : "spent_on"] = patch.parsed_date;
    }
    if ("suggested_project_id" in patch) mapped.project_id = patch.suggested_project_id;
    if ("suggested_category_id" in patch && table === "expenses") mapped.category_id = patch.suggested_category_id;
    if ("suggested_vendor_id" in patch && table === "expenses") mapped.vendor_id = patch.suggested_vendor_id;
    if ("suggested_client_id" in patch && table === "payments") mapped.client_id = patch.suggested_client_id;
    if ("parsed_amount" in patch) mapped.amount = patch.parsed_amount;
    if ("parsed_description" in patch && table === "expenses") mapped.description = patch.parsed_description;
    if (Object.keys(mapped).length === 0) return;
    await (supabase.from(table as any) as any).update(mapped).eq("id", row.imported_record_id);
  };

  const updateRow = async (id: string, patch: Record<string, any>, opts?: { promptRule?: boolean }) => {
    const row = rows.find((r) => r.id === id);
    await (supabase.from("import_rows") as any).update(patch).eq("id", id);
    if (row) await propagateToRecord(row, patch);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } as Row : r)));

    // Auto-prompt: if the user changed a suggested field, offer to save as rule.
    if (opts?.promptRule && row) {
      const orig = originalRef.current.get(id);
      const changes: RuleDraft["changes"] = {};
      const nextRow = { ...row, ...patch } as Row;
      if (orig) {
        if (nextRow.suggested_project_id && nextRow.suggested_project_id !== orig.suggested_project_id) changes.project_id = nextRow.suggested_project_id;
        if (nextRow.suggested_category_id && nextRow.suggested_category_id !== orig.suggested_category_id) changes.category_id = nextRow.suggested_category_id;
        if (nextRow.suggested_vendor_id && nextRow.suggested_vendor_id !== orig.suggested_vendor_id) changes.vendor_id = nextRow.suggested_vendor_id;
        if (nextRow.suggested_client_id && nextRow.suggested_client_id !== orig.suggested_client_id) changes.client_id = nextRow.suggested_client_id;
      }
      if (Object.keys(changes).length > 0) {
        setRuleDraft({
          rowId: id,
          detected_type: nextRow.detected_type,
          raw_json: nextRow.raw_json,
          parsed_description: nextRow.parsed_description,
          changes,
          projectLabel: lookups.projects.find((p) => p.id === changes.project_id)?.name,
          categoryLabel: lookups.categories.find((p) => p.id === changes.category_id)?.name,
          vendorLabel: lookups.vendors.find((p) => p.id === changes.vendor_id)?.name,
          clientLabel: lookups.clients.find((p) => p.id === changes.client_id)?.name,
        });
        // snapshot the new value so we don't re-prompt for the same change
        originalRef.current.set(id, {
          suggested_project_id: nextRow.suggested_project_id,
          suggested_category_id: nextRow.suggested_category_id,
          suggested_vendor_id: nextRow.suggested_vendor_id,
          suggested_client_id: nextRow.suggested_client_id,
        });
      }
    }
  };

  const findExistingRecordForRow = async (row: Row): Promise<string | null> => {
    if (row.imported_record_id) return row.imported_record_id;
    if (!activeFile?.company_id || !row.parsed_date || row.parsed_amount == null) return null;

    const table = row.detected_type === "payment" ? "payments" : row.detected_type === "expense" ? "expenses" : null;
    if (!table) return null;

    if (row.import_hash) {
      const { data } = await (supabase.from(table as any) as any)
        .select("id")
        .eq("company_id", activeFile.company_id)
        .eq("import_hash", row.import_hash)
        .maybeSingle();
      if (data?.id) return data.id;
    }

    const dateColumn = table === "payments" ? "received_on" : "spent_on";
    let q = (supabase.from(table as any) as any)
      .select("id")
      .eq("company_id", activeFile.company_id)
      .eq(dateColumn, row.parsed_date)
      .gte("amount", Number(row.parsed_amount) - 0.01)
      .lte("amount", Number(row.parsed_amount) + 0.01)
      .limit(1);
    if (row.suggested_project_id) q = q.eq("project_id", row.suggested_project_id);
    const { data } = await q;
    return data?.[0]?.id ?? null;
  };

  const markRowResolvedByExistingRecord = async (row: Row, recordId: string) => {
    const patch = {
      status: "imported",
      imported_record_id: recordId,
      imported_at: new Date().toISOString(),
      error_message: null,
    } as const;
    await (supabase.from("import_rows") as any).update(patch).eq("id", row.id);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } as Row : r)));
  };

  /** Confirm a row. If user edited any suggested field, prompt to save as a reusable rule. */
  const confirmRow = async (row: Row) => {
    const orig = originalRef.current.get(row.id);
    const changes: RuleDraft["changes"] = {};
    if (orig) {
      if (row.suggested_project_id && row.suggested_project_id !== orig.suggested_project_id) changes.project_id = row.suggested_project_id;
      if (row.suggested_category_id && row.suggested_category_id !== orig.suggested_category_id) changes.category_id = row.suggested_category_id;
      if (row.suggested_vendor_id && row.suggested_vendor_id !== orig.suggested_vendor_id) changes.vendor_id = row.suggested_vendor_id;
      if (row.suggested_client_id && row.suggested_client_id !== orig.suggested_client_id) changes.client_id = row.suggested_client_id;
    }
    const existingRecordId = await findExistingRecordForRow(row);
    if (existingRecordId) {
      await propagateToRecord({ ...row, imported_record_id: existingRecordId }, row as any);
      await markRowResolvedByExistingRecord(row, existingRecordId);
      toast.success("Ya existía en Expenses; fila marcada como importada");
    } else {
      await updateRow(row.id, { status: "confirmed" });
    }
    if (Object.keys(changes).length > 0) {
      setRuleDraft({
        rowId: row.id,
        detected_type: row.detected_type,
        raw_json: row.raw_json,
        parsed_description: row.parsed_description,
        changes,
        projectLabel: lookups.projects.find((p) => p.id === changes.project_id)?.name,
        categoryLabel: lookups.categories.find((p) => p.id === changes.category_id)?.name,
        vendorLabel: lookups.vendors.find((p) => p.id === changes.vendor_id)?.name,
        clientLabel: lookups.clients.find((p) => p.id === changes.client_id)?.name,
      });
    }
  };


  /** Re-interpret all raw dates in this file using the chosen format (US or EU) and persist. */
  const applyDateFormat = async (fmt: "us" | "eu") => {
    if (!activeFile) return;
    const updates: { id: string; parsed_date: string; imported_record_id: string | null; detected_type: string }[] = [];
    for (const r of rows) {
      const rawDate = r.raw_json?.date ?? r.raw_json?.Date ?? r.raw_json?.fecha ?? r.raw_json?.Fecha;
      if (!rawDate) continue;
      const s = String(rawDate).trim();
      const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
      if (!m) continue;
      const a = +m[1], b = +m[2];
      const yRaw = m[3];
      const yyyy = yRaw.length === 2 ? `20${yRaw}` : yRaw;
      let day: number, month: number;
      if (fmt === "us") { month = a; day = b; } else { day = a; month = b; }
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      const iso = `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (iso !== r.parsed_date) updates.push({ id: r.id, parsed_date: iso, imported_record_id: r.imported_record_id, detected_type: r.detected_type });
    }
    // Persist per-row (small batches) and propagate to already-imported expense/payment rows.
    let propagated = 0;
    for (const u of updates) {
      await (supabase.from("import_rows") as any).update({ parsed_date: u.parsed_date }).eq("id", u.id);
      if (u.imported_record_id) {
        const table = u.detected_type === "payment" ? "payments" : "expenses";
        const col = table === "payments" ? "received_on" : "spent_on";
        const { error } = await (supabase.from(table as any) as any).update({ [col]: u.parsed_date }).eq("id", u.imported_record_id);
        if (!error) propagated++;
      }
    }
    const meta = { ...(activeFile.metadata || {}), date_format: fmt };
    await (supabase.from("import_files") as any).update({ metadata: meta }).eq("id", activeFile.id);
    setRows((rs) => rs.map((r) => {
      const u = updates.find((x) => x.id === r.id);
      return u ? { ...r, parsed_date: u.parsed_date } : r;
    }));
    setActiveFile({ ...activeFile, metadata: meta });
    setDateFormatOpen(false);
    toast.success(`Formato ${fmt === "us" ? "MM/DD/YYYY" : "DD/MM/YYYY"} aplicado: ${updates.length} filas · ${propagated} expenses/payments sincronizados`);
  };


  /** Save the current rule draft as a new import_rule (learning). */
  const saveRuleFromDraft = async (opts: {
    match_field: "description" | "vendor" | "client" | "raw";
    match_pattern: string;
    match_kind: "contains" | "exact" | "regex";
    auto_confirm: boolean;
  }) => {
    if (!ruleDraft || !activeFile) return;
    const pattern = opts.match_pattern.trim();
    if (!pattern) { toast.error("Escribe un patrón"); return; }
    const payload: any = {
      company_id: activeFile.company_id,
      name: `Aprendida: ${pattern.slice(0, 40)}`,
      match_field: opts.match_field,
      match_kind: opts.match_kind,
      match_pattern: pattern,
      set_project_id: ruleDraft.changes.project_id ?? null,
      set_category_id: ruleDraft.changes.category_id ?? null,
      set_vendor_id: ruleDraft.changes.vendor_id ?? null,
      set_client_id: ruleDraft.changes.client_id ?? null,
      set_type: ruleDraft.detected_type,
      auto_confirm: opts.auto_confirm,
      enabled: true,
      priority: 100,
    };
    const { error } = await (supabase.from("import_rules") as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Regla guardada. Se aplicará a futuras importaciones.");
    setRuleDraft(null);
  };


  const bulk = async (status: string) => {
    if (selected.size === 0) { toast.error("Selecciona filas"); return; }
    const ids = Array.from(selected);
    if (status === "confirmed") {
      let resolved = 0;
      const plainConfirmIds: string[] = [];
      for (const row of rows.filter((r) => selected.has(r.id))) {
        const existingRecordId = await findExistingRecordForRow(row);
        if (existingRecordId) {
          await markRowResolvedByExistingRecord(row, existingRecordId);
          resolved++;
        } else {
          plainConfirmIds.push(row.id);
        }
      }
      if (plainConfirmIds.length) {
        await (supabase.from("import_rows") as any).update({ status }).in("id", plainConfirmIds);
        setRows((rs) => rs.map((r) => (plainConfirmIds.includes(r.id) ? { ...r, status } as Row : r)));
      }
      setSelected(new Set());
      toast.success(`${plainConfirmIds.length} confirmadas · ${resolved} ya existían y se marcaron importadas`);
      return;
    }
    await (supabase.from("import_rows") as any).update({ status }).in("id", ids);
    setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, status } as Row : r)));
    setSelected(new Set());
    toast.success(`${ids.length} filas actualizadas`);
  };

  const commit = async () => {
    const ids = rows.filter((r) => (r.status === "confirmed" || r.status === "suggested")).map((r) => r.id);
    if (ids.length === 0) { toast.error("No hay filas confirmadas para importar"); return; }
    setCommitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-commit", { body: { row_ids: ids } });
      if (error) throw error;
      toast.success(`${data.created} registros creados`);
      if (params.fileId) await loadFile(params.fileId);
    } catch (e: any) {
      toast.error(e.message || "Error al importar");
    } finally {
      setCommitting(false);
    }
  };

  // File list view
  if (!params.fileId) {
    return (
      <div className="container py-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Importaciones</h1>
            <p className="text-sm text-muted-foreground">Revisa cada archivo antes de crear registros.</p>
          </div>
          <Button onClick={() => nav("/import-trifecta-os")}><Upload className="h-4 w-4 mr-2" />Nueva importación</Button>
        </div>
        <div className="space-y-3">
          {files.map((f) => (
            <Card key={f.id} className="cursor-pointer hover:bg-accent/50 transition" onClick={() => nav(`/import-review/${f.id}`)}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{f.file_name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {f.total_rows} filas · {new Date(f.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{f.auto_approved_count} auto</Badge>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{f.needs_review_count} revisar</Badge>
                  <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">{f.no_match_count} sin match</Badge>
                  <Badge variant="outline">{f.imported_count} importados</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {files.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Aún no has subido archivos. Empieza con "Nueva importación".
            </CardContent></Card>
          )}
        </div>
      </div>
    );
  }

  const applyRules = async () => {
    if (!params.fileId) return;
    setCommitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("apply_import_rules", { _file_id: params.fileId });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      toast.success(`${r?.applied ?? 0} reglas aplicadas · ${r?.confirmed ?? 0} auto-confirmadas`);
      await loadFile(params.fileId);
    } catch (e: any) {
      toast.error(e.message || "Error aplicando reglas");
    } finally {
      setCommitting(false);
    }
  };

  // Review view
  return (
    <div className="container py-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => nav("/import-review")}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-semibold">{activeFile?.file_name}</h1>
          <p className="text-xs text-muted-foreground">{activeFile?.total_rows} filas · {activeFile?.status}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => nav("/import-rules")}><Settings2 className="h-4 w-4 mr-2" />Reglas</Button>
        <Button variant="outline" size="sm" onClick={applyRules} disabled={committing}><Wand2 className="h-4 w-4 mr-2" />Aplicar reglas</Button>
        <Button variant="outline" size="sm" onClick={() => setDateFormatOpen(true)}>
          <CalendarClock className="h-4 w-4 mr-2" />Formato fecha
          {activeFile?.metadata?.date_format && (
            <Badge variant="secondary" className="ml-2 text-[10px]">{activeFile.metadata.date_format === "us" ? "MM/DD" : "DD/MM"}</Badge>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => params.fileId && loadFile(params.fileId)}><RefreshCw className="h-4 w-4 mr-2" />Recargar</Button>
        <Button onClick={commit} disabled={committing}>
          {committing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Importar confirmadas ({rows.filter(r => r.status === "confirmed" || r.status === "suggested").length})
        </Button>
      </div>


      {loading ? (
        <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-6 mb-4">
            {GROUP_KEYS.map((g) => (
              <TabsTrigger key={g.key} value={g.key} className="gap-2">
                <g.icon className={`h-4 w-4 ${g.color}`} />
                <span className="hidden md:inline">{g.label}</span>
                <Badge variant="secondary">{grouped[g.key]?.length ?? 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {GROUP_KEYS.map((g) => (
            <TabsContent key={g.key} value={g.key}>
              {visibleRows.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No hay filas en este grupo.</CardContent></Card>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3 p-3 bg-muted/30 rounded-lg">
                    <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} />
                    <span className="text-sm text-muted-foreground flex-1">
                      {selected.size > 0 ? `${selected.size} seleccionadas` : "Selecciona filas para acciones masivas"}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => bulk("confirmed")} disabled={selected.size === 0}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />Confirmar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => bulk("excluded")} disabled={selected.size === 0}>
                      <XCircle className="h-4 w-4 mr-1" />Excluir
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {visibleRows.map((r) => (
                      <RowCard key={r.id} row={r} selected={selected.has(r.id)} onToggle={() => toggle(r.id)}
                        lookups={lookups} onUpdate={(patch, opts) => { void updateRow(r.id, patch, opts); }}
                        onConfirm={() => confirmRow(r)} />


                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <RuleLearnDialog draft={ruleDraft} onClose={() => setRuleDraft(null)} onSave={saveRuleFromDraft} />
      <DateFormatDialog
        open={dateFormatOpen}
        current={activeFile?.metadata?.date_format}
        sample={rows.slice(0, 5).map((r) => String(r.raw_json?.date ?? r.raw_json?.Date ?? r.raw_json?.fecha ?? r.raw_json?.Fecha ?? "")).filter(Boolean)}
        onClose={() => setDateFormatOpen(false)}
        onApply={applyDateFormat}
      />
    </div>
  );
}


function RowCard({ row, selected, onToggle, lookups, onUpdate, onConfirm }: {
  row: Row; selected: boolean; onToggle: () => void; lookups: Lookups;
  onUpdate: (patch: Partial<Row>, opts?: { promptRule?: boolean }) => void;
  onConfirm: () => void;
}) {
  const confidencePct = Math.round(row.confidence_score * 100);
  const confColor = row.confidence_score >= 0.85 ? "text-emerald-600 bg-emerald-50" :
                    row.confidence_score >= 0.5 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50";
  const isImported = row.status === "imported";
  return (
    <Card className={selected ? "border-primary" : ""}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-1" />
          <div className="flex-1 grid grid-cols-12 gap-3 items-center">
            <div className="col-span-2">
              <Badge variant="outline" className="capitalize">{row.detected_type}</Badge>
              <div className={`text-xs mt-1 px-2 py-0.5 rounded inline-block ${confColor}`}>{confidencePct}%</div>
              {isImported && <Badge variant="secondary" className="mt-1 text-[10px]">importado</Badge>}
            </div>
            <div className="col-span-2 text-sm space-y-1">
              <Input
                type="date"
                value={row.parsed_date ?? ""}
                onChange={(e) => onUpdate({ parsed_date: (e.target.value || null) as any })}
                className="h-7 text-xs font-mono"
                title="Editar fecha (se sincroniza con el gasto/pago si ya fue importado)"
              />
              <div className="font-mono font-semibold">${row.parsed_amount?.toFixed(2) ?? "—"}</div>
            </div>
            <div className="col-span-3 text-sm truncate" title={row.parsed_description ?? ""}>
              {row.parsed_description ?? <span className="text-muted-foreground italic">sin descripción</span>}
              <div className="text-xs text-muted-foreground">{row.source_sheet} · fila {row.row_number}</div>
            </div>
            <div className="col-span-5 grid grid-cols-2 gap-2">
              <Select value={row.suggested_project_id ?? "none"} onValueChange={(v) => onUpdate({ suggested_project_id: v === "none" ? null : v }, { promptRule: true })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Proyecto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proyecto</SelectItem>
                  {lookups.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.project_code} · {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {row.detected_type === "expense" ? (
                <Select value={row.suggested_vendor_id ?? "none"} onValueChange={(v) => onUpdate({ suggested_vendor_id: v === "none" ? null : v }, { promptRule: true })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vendor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin vendor</SelectItem>
                    {lookups.vendors.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={row.suggested_client_id ?? "none"} onValueChange={(v) => onUpdate({ suggested_client_id: v === "none" ? null : v }, { promptRule: true })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin cliente</SelectItem>
                    {lookups.clients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {row.status !== "confirmed" && !isImported && (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onConfirm} title="Confirmar (te preguntará si guardar los cambios como regla)">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </Button>
            )}
            {row.status !== "excluded" && !isImported && (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onUpdate({ status: "excluded" as any })}>
                <XCircle className="h-4 w-4 text-rose-600" />
              </Button>
            )}
          </div>
        </div>
        {row.error_message && <div className="text-xs text-rose-600 mt-2 pl-7">{row.error_message}</div>}
      </CardContent>
    </Card>
  );
}


function DateFormatDialog({ open, current, sample, onClose, onApply }: {
  open: boolean; current?: string; sample: string[];
  onClose: () => void; onApply: (fmt: "us" | "eu") => void;
}) {
  const [fmt, setFmt] = useState<"us" | "eu">((current as any) || "us");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Formato de fecha del archivo</DialogTitle>
          <DialogDescription>
            Detectamos fechas ambiguas. Elige el formato correcto y lo aplicaremos a todas las filas de este archivo.
          </DialogDescription>
        </DialogHeader>
        {sample.length > 0 && (
          <div className="text-xs bg-muted rounded p-2 font-mono">
            Ejemplos en el archivo: {sample.slice(0, 3).join(" · ")}
          </div>
        )}
        <RadioGroup value={fmt} onValueChange={(v) => setFmt(v as any)} className="gap-3">
          <label className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-accent">
            <RadioGroupItem value="us" id="us" />
            <div>
              <div className="font-medium">MM/DD/YYYY (US)</div>
              <div className="text-xs text-muted-foreground">03/04/2026 = 4 de marzo</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-accent">
            <RadioGroupItem value="eu" id="eu" />
            <div>
              <div className="font-medium">DD/MM/YYYY (EU / MX)</div>
              <div className="text-xs text-muted-foreground">03/04/2026 = 3 de abril</div>
            </div>
          </label>
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onApply(fmt)}>Aplicar a todas las filas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleLearnDialog({ draft, onClose, onSave }: {
  draft: RuleDraft | null;
  onClose: () => void;
  onSave: (opts: { match_field: "description" | "vendor" | "client" | "raw"; match_pattern: string; match_kind: "contains" | "exact" | "regex"; auto_confirm: boolean }) => void;
}) {
  const vendorRaw = draft ? String(draft.raw_json?.vendor ?? draft.raw_json?.proveedor ?? draft.raw_json?.payee ?? "").trim() : "";
  const clientRaw = draft ? String(draft.raw_json?.client ?? draft.raw_json?.cliente ?? "").trim() : "";
  const defaultField: "description" | "vendor" | "client" = vendorRaw ? "vendor" : (clientRaw ? "client" : "description");
  const defaultPattern = vendorRaw || clientRaw || draft?.parsed_description || "";

  const [field, setField] = useState<"description" | "vendor" | "client" | "raw">(defaultField);
  const [pattern, setPattern] = useState<string>(defaultPattern);
  const [autoConfirm, setAutoConfirm] = useState<boolean>(true);

  // Reset when draft changes
  useEffect(() => {
    setField(defaultField);
    setPattern(defaultPattern);
    setAutoConfirm(true);
  }, [draft?.rowId]);

  if (!draft) return null;

  const changesList: string[] = [];
  if (draft.projectLabel) changesList.push(`Proyecto → ${draft.projectLabel}`);
  if (draft.categoryLabel) changesList.push(`Categoría → ${draft.categoryLabel}`);
  if (draft.vendorLabel) changesList.push(`Vendor → ${draft.vendorLabel}`);
  if (draft.clientLabel) changesList.push(`Cliente → ${draft.clientLabel}`);

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />¿Guardar como regla?</DialogTitle>
          <DialogDescription>
            Aprende esta corrección para aplicarla automáticamente en el futuro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm bg-muted rounded p-2">
            <div className="font-medium mb-1">Se aplicará:</div>
            <ul className="text-xs list-disc pl-4 space-y-0.5">
              {changesList.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cuando el campo</Label>
            <Select value={field} onValueChange={(v) => setField(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="description">Descripción</SelectItem>
                <SelectItem value="vendor">Vendor / Proveedor</SelectItem>
                <SelectItem value="client">Cliente</SelectItem>
                <SelectItem value="raw">Cualquier campo (raw)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contenga el texto</Label>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="ej: HOME DEPOT" />
            <p className="text-[11px] text-muted-foreground">Coincidencia parcial, sin distinguir mayúsculas.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoConfirm} onCheckedChange={(v) => setAutoConfirm(!!v)} />
            Auto-confirmar futuras filas que coincidan (no requerirán revisión)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>No, solo esta vez</Button>
          <Button onClick={() => onSave({ match_field: field, match_pattern: pattern, match_kind: "contains", auto_confirm: autoConfirm })}>
            <Sparkles className="h-4 w-4 mr-2" />Guardar regla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

