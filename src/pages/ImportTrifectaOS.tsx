import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Download, Link2, FileSpreadsheet, Settings2, RotateCcw, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronRight, Plus, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SHEET_NAMES = [
  "PROJECTS_AUTO",
  "HANDOFF_RAW",
  "EXPENSES_MANUAL",
  "GENERAL_EXPENSES",
  "LABOR_TRACKING",
  "PAYMENTS_RECEIVED",
  "TASKS",
  "LOOKUPS",
] as const;

type ImportSheetName = typeof SHEET_NAMES[number];

const norm = (s: any) => String(s ?? "").trim();
const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const key = (s: any) => stripAccents(norm(s)).toLowerCase().replace(/[^a-z0-9]/g, "");

const SHEET_ALIASES: Record<ImportSheetName, string[]> = {
  PROJECTS_AUTO: ["projectsauto", "projects", "project", "proyectos", "proyectosauto"],
  HANDOFF_RAW: ["handoffraw", "handoff", "estimate", "estimates", "estimados", "presupuesto"],
  EXPENSES_MANUAL: ["expensesmanual", "expenses", "gastos", "gastosmanual", "expense"],
  GENERAL_EXPENSES: ["generalexpenses", "gastosgenerales", "general", "overhead"],
  LABOR_TRACKING: ["labortracking", "labor", "manoobra", "manodeobra", "workers", "trabajo"],
  PAYMENTS_RECEIVED: ["paymentsreceived", "payments", "pagos", "pagosrecibidos"],
  TASKS: ["tasks", "tareas", "task"],
  LOOKUPS: ["lookups", "catalogos", "listas", "settings"],
};

// Synonym groups → all variants normalized via key(). Used for flexible auto-detect.
// Add Spanish, English, and common phrasings. Order: first item per group is the "canonical" key from CANONICAL_FIELDS (normalized).
const SYNONYMS: Record<string, string[]> = {
  projectcode: ["projectcode", "codigoproyecto", "codigodeproyecto", "codigo", "code", "projectid", "idproyecto", "proyecto"],
  clientname: ["clientname", "cliente", "nombrecliente", "customer", "customername", "nombre"],
  clientnameauto: ["clientnameauto", "clientenombreauto", "clienteautocompletado"],
  address: ["address", "direccion", "domicilio", "ubicacion", "addr"],
  contractamountestimated: ["contractamountestimated", "contractamount", "contrato", "montocontrato", "valorcontrato", "estimatedcontract"],
  amount: ["amount", "monto", "importe", "valor", "total"],
  amountusd: ["amountusd", "montousd", "importeusd", "amountindollars"],
  date: ["date", "fecha"],
  vendor: ["vendor", "proveedor", "supplier", "comercio", "vendedor"],
  expensecategory: ["expensecategory", "categoriagasto", "categoriadelgasto", "tipogasto"],
  category: ["category", "categoria", "tipo", "rubro"],
  notes: ["notes", "notas", "comentarios", "observaciones", "obs", "comment", "remarks"],
  worker: ["worker", "trabajador", "empleado", "operario", "person", "persona"],
  labortype: ["labortype", "tipomanoobra", "tipodemanodeobra", "laborkind"],
  paymentmethod: ["paymentmethod", "metodopago", "metododepago", "formapago", "formadepago"],
  paidby: ["paidby", "pagadopor", "payby", "pagopor"],
  title: ["title", "titulo", "nombre"],
  status: ["status", "estado", "estatus"],
  assignee: ["assignee", "asignado", "responsable", "encargado"],
  phase: ["phase", "fase", "etapa"],
  startdate: ["startdate", "fechainicio", "inicio", "fechadeinicio"],
  enddate: ["enddate", "fechafin", "fin", "fechadefin", "fechatermino"],
  listname: ["listname", "nombrelista", "lista"],
  value: ["value", "valor"],
  itemtitle: ["itemtitle", "titulodelitem", "tituloitem", "concepto", "descripcion", "item"],
  description: ["description", "descripcion", "detalle"],
  group: ["group", "grupo", "seccion", "section"],
  quantity: ["quantity", "qty", "cantidad", "cant"],
  uom: ["uom", "unidad", "unit", "unidaddemedida"],
  rate: ["rate", "tarifa", "preciounitario", "unitprice", "precio"],
};

// Build reverse lookup: any synonym key → canonical key
const SYN_TO_CANON: Record<string, string> = {};
Object.entries(SYNONYMS).forEach(([canon, syns]) => syns.forEach((s) => { SYN_TO_CANON[s] = canon; }));

// Canonical key → list of human-readable aliases written into row objects so the edge function finds them.
const HEADER_ALIASES: Record<string, string[]> = {
  projectcode: ["Project Code", "PROJECT CODE"],
  clientname: ["Client Name"],
  clientnameauto: ["Client Name (auto)"],
  address: ["Address"],
  contractamountestimated: ["Contract Amount (Estimated)"],
  amount: ["Amount", "AMOUNT", "AMOUNT "],
  amountusd: ["AMOUNT (USD)"],
  date: ["Date", "DATE"],
  vendor: ["Vendor", "VENDOR", "VENDOR "],
  expensecategory: ["Expense Category"],
  category: ["Category", "CATEGORY", "CATEGORY "],
  notes: ["Notes", "NOTES"],
  worker: ["WORKER"],
  labortype: ["LABOR TYPE"],
  paymentmethod: ["Payment Method", "PAYMENT METHOD"],
  paidby: ["Paid By", "PAY BY"],
  title: ["Title"],
  status: ["Status"],
  assignee: ["Assignee"],
  phase: ["Phase"],
  startdate: ["Start Date"],
  enddate: ["End Date"],
  listname: ["List Name"],
  value: ["Value"],
  itemtitle: ["Item Title"],
  description: ["description"],
  group: ["Group"],
  quantity: ["Quantity"],
  uom: ["UoM"],
  rate: ["Rate"],
  total: ["Total"],
};

// Resolve a raw header to its canonical key using exact-key match, then synonym lookup,
// then loose substring match against canonical names.
const canonicalOf = (header: string): string | null => {
  const k = key(header);
  if (!k) return null;
  if (HEADER_ALIASES[k]) return k;
  if (SYN_TO_CANON[k]) return SYN_TO_CANON[k];
  // loose: header contains a synonym or vice versa (min length 4 to avoid false positives)
  for (const [canon, syns] of Object.entries(SYNONYMS)) {
    for (const s of syns) {
      if (s.length >= 4 && (k.includes(s) || s.includes(k))) return canon;
    }
  }
  return null;
};

const addHeaderAliases = (obj: Record<string, any>, header: string, value: any) => {
  const canon = canonicalOf(header);
  if (!canon) return;
  for (const alias of HEADER_ALIASES[canon] ?? []) {
    if (obj[alias] === undefined || obj[alias] === "") obj[alias] = value;
  }
};

const scoreHeaderRow = (row: any[] = []) => {
  const cells = row.map(key).filter(Boolean);
  const known = cells.filter((cell) => HEADER_ALIASES[cell]).length;
  const labels = row.filter((cell) => typeof cell === "string" && norm(cell).length > 0 && norm(cell).length < 80).length;
  return known * 10 + labels;
};

const sheetToRows = (wb: XLSX.WorkBook, name: string): Record<string, any>[] => {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const arr = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true, blankrows: false });
  if (!arr.length) return [];
  let headerIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(20, arr.length); i++) {
    const score = scoreHeaderRow(arr[i]);
    if (score > bestScore) { bestScore = score; headerIdx = i; }
  }
  const headers = (arr[headerIdx] || []).map((h: any) => norm(h));
  const rows: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < arr.length; i++) {
    const r = arr[i];
    if (!r || r.every((c: any) => c === "" || c == null)) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h: string, idx: number) => {
      if (!h) return;
      const cell = r[idx];
      // Excel date cells come through as JS Date when {cellDates:true}; serialize to ISO string
      const value = cell instanceof Date ? cell.toISOString() : cell;
      obj[h] = value;
      addHeaderAliases(obj, h, value);
    });
    rows.push(obj);
  }
  return rows;
};

const sheetNameTarget = (name: string): ImportSheetName | null => {
  const normalized = key(name);
  return SHEET_NAMES.find((target) => SHEET_ALIASES[target].some((alias) => normalized.includes(alias))) ?? null;
};

const classifyRows = (rows: Record<string, any>[]): ImportSheetName | null => {
  const headers = new Set(Object.keys(rows[0] ?? {}));
  const has = (h: string) => headers.has(h);
  if (has("Payment Method")) return "PAYMENTS_RECEIVED";
  if (has("WORKER")) return "LABOR_TRACKING";
  if (has("Title") && has("Status")) return "TASKS";
  if (has("List Name") && has("Value")) return "LOOKUPS";
  if (has("Item Title") || (has("Rate") && has("Total") && has("Project Code"))) return "HANDOFF_RAW";
  if ((has("Vendor") || has("VENDOR")) && (has("Amount") || has("AMOUNT")) && (has("Date") || has("DATE")) && has("Project Code")) return "EXPENSES_MANUAL";
  if ((has("Vendor") || has("VENDOR")) && (has("Amount") || has("AMOUNT")) && (has("Date") || has("DATE"))) return "GENERAL_EXPENSES";
  if (has("Project Code") && (has("Client Name") || has("Address"))) return "PROJECTS_AUTO";
  return null;
};

const parseWorkbook = (buf: ArrayBuffer) => {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const sheets: Record<string, Record<string, any>[]> = Object.fromEntries(SHEET_NAMES.map((name) => [name, []]));
  const rawHeaders: Record<string, Set<string>> = Object.fromEntries(SHEET_NAMES.map((name) => [name, new Set<string>()]));
  const diagnostics: { sheet: string; target: string; rows: number; headers: string[] }[] = [];

  for (const name of wb.SheetNames) {
    const rows = sheetToRows(wb, name);
    const target = sheetNameTarget(name) ?? classifyRows(rows);
    diagnostics.push({ sheet: name, target: target ?? "ignorada", rows: rows.length, headers: Object.keys(rows[0] ?? {}).slice(0, 12) });
    if (target && rows.length) {
      sheets[target].push(...rows);
      rows.forEach((r) => Object.keys(r).forEach((k) => rawHeaders[target].add(k)));
    }
  }

  return { sheets, diagnostics, rawHeaders };
};

// Canonical fields the edge function expects, per target sheet. Editable by user via mapping UI.
const CANONICAL_FIELDS: Record<ImportSheetName, string[]> = {
  PROJECTS_AUTO: ["Project Code", "Client Name", "Address", "Contract Amount (Estimated)"],
  HANDOFF_RAW: ["Project Code", "Client Name", "Address", "Group", "Item Title", "description", "Quantity", "UoM", "Rate", "Total", "Category"],
  EXPENSES_MANUAL: ["Date", "Project Code", "Vendor", "Expense Category", "Amount", "Payment Method", "Paid By", "Notes"],
  GENERAL_EXPENSES: ["DATE", "CATEGORY", "VENDOR ", "AMOUNT ", "NOTES", "PAYMENT METHOD", "PAY BY"],
  LABOR_TRACKING: ["WORKER", "DATE", "AMOUNT (USD)", "PAYMENT METHOD", "PROJECT CODE", "LABOR TYPE", "NOTES"],
  PAYMENTS_RECEIVED: ["Date", "Project Code", "Client Name (auto)", "Amount", "Payment Method", "Notes"],
  TASKS: ["Project Code", "Phase", "Title", "Status", "Start Date", "End Date", "Notes", "Assignee"],
  LOOKUPS: ["List Name", "Value"],
};

type ColumnMapping = Partial<Record<ImportSheetName, Record<string, string>>>;

const MAPPING_KEY = "trifecta.import.columnMapping";
const loadMapping = (): ColumnMapping => {
  try { return JSON.parse(localStorage.getItem(MAPPING_KEY) || "{}"); } catch { return {}; }
};
const saveMapping = (m: ColumnMapping) => {
  try { localStorage.setItem(MAPPING_KEY, JSON.stringify(m)); } catch {}
};

// Apply user mapping to rows: copy row[source] → row[canonical] (non-destructive).
const applyMapping = (sheets: Record<string, Record<string, any>[]>, mapping: ColumnMapping) => {
  const out: Record<string, Record<string, any>[]> = {};
  for (const [target, rows] of Object.entries(sheets)) {
    const m = mapping[target as ImportSheetName] ?? {};
    out[target] = rows.map((row) => {
      const next = { ...row };
      for (const [canonical, source] of Object.entries(m)) {
        if (source && (next[canonical] === undefined || next[canonical] === "") && row[source] !== undefined) {
          next[canonical] = row[source];
        }
      }
      return next;
    });
  }
  return out;
};

// Detect duplicate source columns assigned to different canonical fields within each sheet.
// Returns an array of { target, canonicalField, sourceColumn, alsoUsedBy }.
type MappingConflict = { target: ImportSheetName; canonicalField: string; sourceColumn: string; alsoUsedBy: string };
const getMappingConflicts = (mapping: ColumnMapping): MappingConflict[] => {
  const conflicts: MappingConflict[] = [];
  (Object.keys(CANONICAL_FIELDS) as ImportSheetName[]).forEach((target) => {
    const m = mapping[target] ?? {};
    const usedBy: Record<string, string[]> = {};
    Object.entries(m).forEach(([canonical, source]) => {
      if (!source) return;
      if (!usedBy[source]) usedBy[source] = [];
      usedBy[source].push(canonical);
    });
    Object.entries(usedBy).forEach(([source, fields]) => {
      if (fields.length > 1) {
        fields.forEach((field) => {
          const others = fields.filter((f) => f !== field);
          conflicts.push({ target, canonicalField: field, sourceColumn: source, alsoUsedBy: others.join(", ") });
        });
      }
    });
  });
  return conflicts;
};

const CHUNK_SIZE = 200;

const chunkRows = <T,>(rows: T[] = [], size = CHUNK_SIZE): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
};

const chunkHandoffRows = (rows: Record<string, any>[] = [], size = CHUNK_SIZE): Record<string, any>[][] => {
  const byProject = new Map<string, Record<string, any>[]>();
  rows.forEach((row, index) => {
    const code = norm(row["Project Code"]) || `row-${index}`;
    byProject.set(code, [...(byProject.get(code) ?? []), row]);
  });

  const chunks: Record<string, any>[][] = [];
  let current: Record<string, any>[] = [];
  byProject.forEach((group) => {
    if (current.length && current.length + group.length > size) {
      chunks.push(current);
      current = [];
    }
    if (group.length > size) chunks.push(group);
    else current.push(...group);
  });
  if (current.length) chunks.push(current);
  return chunks;
};

const getFunctionErrorMessage = async (error: any, fallback = "Edge Function returned a non-2xx status code") => {
  const response = error?.context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.json();
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch (_) {
      // Keep the SDK fallback below when the response body is not JSON.
    }
  }
  return error?.message ?? fallback;
};

const mergeSummary = (target: any, source: any) => {
  if (!source) return;
  for (const section of ["counts", "created", "skipped"]) {
    Object.entries(source[section] ?? {}).forEach(([key, value]) => {
      target[section][key] = (target[section][key] ?? 0) + (Number(value) || 0);
    });
  }
  if (Array.isArray(source.errors)) target.errors.push(...source.errors);
  if (Array.isArray(source.pending_tasks)) target.pending_tasks.push(...source.pending_tasks);
};

const ImportTrifectaOS = () => {
  const navigate = useNavigate();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [resolvingCode, setResolvingCode] = useState<string | null>(null);
  const [dateFormat, setDateFormat] = useState<"dmy" | "mdy" | "auto">(
    () => (typeof window !== "undefined" && (localStorage.getItem("trifecta.import.dateFormat") as any)) || "dmy"
  );
  useEffect(() => {
    try { localStorage.setItem("trifecta.import.dateFormat", dateFormat); } catch {}
  }, [dateFormat]);

  const resolvePendingForCode = async (code: string, projectName: string) => {
    if (!result?.pending_tasks?.length) return;
    setResolvingCode(code);
    try {
      // Get company + division
      const { data: thi } = await supabase.from("companies").select("id").eq("name", "Trifecta Home Improvement").maybeSingle();
      if (!thi?.id) throw new Error("Empresa Trifecta Home Improvement no encontrada");
      const { data: div } = await supabase.from("divisions").select("id").eq("company_id", thi.id).eq("slug", "home-improvement").maybeSingle();
      if (!div?.id) throw new Error("División Home Improvement no encontrada");

      // Create project if it doesn't already exist
      const { data: existing } = await supabase.from("projects").select("id").eq("company_id", thi.id).eq("project_code", code).maybeSingle();
      if (!existing?.id) {
        const { error: insErr } = await supabase.from("projects").insert({
          company_id: thi.id,
          division_id: div.id,
          name: projectName || code,
          project_code: code,
          status: "active",
          project_type: "other",
        });
        if (insErr) throw new Error(insErr.message);
      }

      // Re-run TASKS import for just the rows tied to this code
      const taskRows = result.pending_tasks.filter((t: any) => (t.project_code || "") === code).map((t: any) => t.raw);
      const { data, error } = await supabase.functions.invoke("import-trifecta-os", {
        body: { sheets: { TASKS: taskRows }, source: `resume:${code}`, date_format: dateFormat },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      // Update local result: remove resolved pending tasks, bump counters
      setResult((prev: any) => {
        if (!prev) return prev;
        const remaining = prev.pending_tasks.filter((t: any) => (t.project_code || "") !== code);
        const createdTasks = data?.summary?.created?.tasks ?? 0;
        return {
          ...prev,
          pending_tasks: remaining,
          summary: {
            ...prev.summary,
            pending_tasks: remaining,
            created: { ...prev.summary.created, tasks: (prev.summary.created.tasks ?? 0) + createdTasks, projects: (prev.summary.created.projects ?? 0) + (existing?.id ? 0 : 1) },
            skipped: { ...prev.summary.skipped, tasks: Math.max(0, (prev.summary.skipped.tasks ?? 0) - taskRows.length) },
          },
        };
      });
      toast.success(`Proyecto creado y ${data?.summary?.created?.tasks ?? 0} tareas importadas`);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo crear el proyecto");
    } finally {
      setResolvingCode(null);
    }
  };

  const runImport = async (sheets: Record<string, any[]>, source: string, diagnostics: any[] = []) => {
    // NEW FLOW: stage rows into import_rows, then navigate to the review wizard.
    // Nothing gets inserted into expenses/payments/projects/tasks until the user confirms.
    const nonEmpty: Record<string, any[]> = {};
    for (const [k, v] of Object.entries(sheets)) {
      if (Array.isArray(v) && v.length > 0) nonEmpty[k] = v;
    }
    if (Object.keys(nonEmpty).length === 0) {
      const inspected = diagnostics.map((d) => `${d.sheet}: ${d.rows} filas → ${d.target}`).join(" | ");
      throw new Error(`No encontré filas importables. Pestañas detectadas: ${inspected || "ninguna"}.`);
    }
    setStage("Preparando filas para revisión…");
    const { data, error } = await supabase.functions.invoke("import-stage", {
      body: { sheets: nonEmpty, source, file_name: source || "import.xlsx" },
    });
    if (error) throw new Error(await getFunctionErrorMessage(error));
    if (data?.error) throw new Error(data.error);
    toast.success(`${data.totals.totalRows} filas listas para revisar`);
    navigate(`/import-review/${data.import_file_id}`);
  };

  const [staged, setStaged] = useState<null | {
    sheets: Record<string, Record<string, any>[]>;
    diagnostics: any[];
    rawHeaders: Record<string, Set<string>>;
    source: string;
  }>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(() => loadMapping());
  useEffect(() => { saveMapping(mapping); }, [mapping]);

  const stageParsed = (parsed: ReturnType<typeof parseWorkbook>, source: string) => {
    setStaged({ sheets: parsed.sheets, diagnostics: parsed.diagnostics, rawHeaders: parsed.rawHeaders, source });
  };

  const importFromUrl = async () => {
    if (!sheetUrl) return toast.error("Pega el link del Google Sheet");
    setBusy(true); setResult(null); setStaged(null);
    try {
      setStage("Descargando Google Sheet…");
      const { data, error } = await supabase.functions.invoke("fetch-sheet-proxy", { body: { url: sheetUrl } });
      if (error) throw new Error(await getFunctionErrorMessage(error, "No pude descargar el Google Sheet"));
      if (data?.error) throw new Error(data.error);
      setStage("Parseando archivo…");
      const bin = atob(data.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const parsed = parseWorkbook(bytes.buffer);
      stageParsed(parsed, `google_sheet:${sheetUrl}`);
      toast.success("Archivo analizado. Revisa el mapeo y confirma.");
    } catch (e: any) {
      toast.error(e.message ?? "Error en importación");
      setResult({ error: e.message });
    } finally {
      setBusy(false); setStage("");
    }
  };

  const importFromFile = async () => {
    if (!file) return toast.error("Selecciona un archivo .xlsx");
    setBusy(true); setResult(null); setStaged(null);
    try {
      setStage("Parseando archivo…");
      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf);
      stageParsed(parsed, `file:${file.name}`);
      toast.success("Archivo analizado. Revisa el mapeo y confirma.");
    } catch (e: any) {
      toast.error(e.message ?? "Error en importación");
      setResult({ error: e.message });
    } finally {
      setBusy(false); setStage("");
    }
  };

  const confirmImport = async () => {
    if (!staged) return;
    const conflicts = getMappingConflicts(mapping);
    if (conflicts.length) {
      const bySheet = new Map<string, MappingConflict[]>();
      conflicts.forEach((c) => {
        const list = bySheet.get(c.target) ?? [];
        list.push(c);
        bySheet.set(c.target, list);
      });
      const detail = Array.from(bySheet.entries())
        .map(([target, list]) => {
          const unique = Array.from(new Set(list.map((c) => `${c.sourceColumn} → ${c.canonicalField} / ${c.alsoUsedBy}`)));
          return `${target}: ${unique.join("; ")}`;
        })
        .join(" | ");
      toast.error(`Corrige el mapeo antes de importar: ${detail}`);
      return;
    }
    setBusy(true); setResult(null);
    try {
      const remapped = applyMapping(staged.sheets, mapping);
      await runImport(remapped, staged.source, staged.diagnostics);
      setStaged(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error en importación");
      setResult({ error: e.message });
    } finally {
      setBusy(false); setStage("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Importar Trifecta OS</h1>
        <p className="text-sm text-muted-foreground">
          Importa proyectos, clientes, gastos, pagos, mano de obra y tareas desde tu Google Sheet de Trifecta OS.
          El Excel es la fuente única: al re-importar, los proyectos existentes actualizan dirección, contrato y cliente,
          y los estimates se reemplazan si cambiaron sus líneas. Gastos y pagos se omiten por hash para evitar duplicados.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fuente</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Formato de fecha en el origen</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                { v: "dmy", label: "DMY (31/12/2026)" },
                { v: "mdy", label: "MDY (12/31/2026)" },
                { v: "auto", label: "Auto-detectar" },
              ] as const).map((o) => (
                <Button
                  key={o.v}
                  type="button"
                  size="sm"
                  variant={dateFormat === o.v ? "default" : "outline"}
                  onClick={() => setDateFormat(o.v)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Se aplica a fechas ambiguas (ej. 09/02/2026). Tu selección se guarda para próximas importaciones.
            </p>
          </div>
          <Tabs defaultValue="url">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="url"><Link2 className="mr-2 h-4 w-4" /> Google Sheet</TabsTrigger>
              <TabsTrigger value="file"><FileSpreadsheet className="mr-2 h-4 w-4" /> Subir .xlsx</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-3 pt-3">
              <Label>Link del Google Sheet (debe ser público o "cualquiera con el enlace")</Label>
              <Input
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
              <Button onClick={importFromUrl} disabled={busy} className="w-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Analizar Google Sheet
              </Button>
            </TabsContent>
            <TabsContent value="file" className="space-y-3 pt-3">
              <Label>Archivo Excel (.xlsx)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button onClick={importFromFile} disabled={busy || !file} className="w-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Analizar archivo
              </Button>
            </TabsContent>
          </Tabs>
          {busy && stage && <p className="mt-3 text-sm text-muted-foreground">{stage}</p>}
        </CardContent>
      </Card>

      {staged && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Mapeo de columnas
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next: ColumnMapping = { ...mapping };
                  let applied = 0;
                  (Object.keys(CANONICAL_FIELDS) as ImportSheetName[]).forEach((target) => {
                    const headers = Array.from(staged?.rawHeaders[target] ?? []);
                    CANONICAL_FIELDS[target].forEach((field) => {
                      if (next[target]?.[field]) return;
                      if (headers.includes(field)) return;
                      const fieldCanon = canonicalOf(field);
                      if (!fieldCanon) return;
                      const sugg = headers.find((h) => canonicalOf(h) === fieldCanon);
                      if (sugg) {
                        next[target] = { ...(next[target] ?? {}), [field]: sugg };
                        applied++;
                      }
                    });
                  });
                  setMapping(next);
                  toast.success(applied ? `${applied} sugerencias aplicadas` : "No hay sugerencias nuevas");
                }}
              >
                Aplicar sugerencias
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setMapping({}); toast.success("Mapeo restablecido"); }}>
                <RotateCcw className="mr-2 h-3 w-3" /> Restablecer
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Auto-detección flexible: ignora acentos, mayúsculas y reconoce sinónimos (es/en).
              Verde = match exacto, amarillo = sugerencia. Tus cambios se guardan para futuros imports.
            </p>
            {(() => {
              const conflicts = getMappingConflicts(mapping);
              if (!conflicts.length) return null;
              const bySheet = new Map<string, Set<string>>();
              conflicts.forEach((c) => {
                const set = bySheet.get(c.target) ?? new Set<string>();
                set.add(`${c.sourceColumn} → ${c.canonicalField} y ${c.alsoUsedBy}`);
                bySheet.set(c.target, set);
              });
              return (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="font-semibold">Columnas duplicadas en el mapeo</p>
                  <p className="mt-1 text-xs">Dos campos canónicos no pueden usar la misma columna fuente en una misma hoja. Corrige los selects marcados en rojo antes de importar.</p>
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {Array.from(bySheet.entries()).map(([target, items]) => (
                      <li key={target}>
                        <span className="font-mono">{target}</span>: {Array.from(items).join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            {(Object.keys(CANONICAL_FIELDS) as ImportSheetName[]).map((target) => {
              const headers = Array.from(staged.rawHeaders[target] ?? []).filter(Boolean).sort();
              const rowCount = staged.sheets[target]?.length ?? 0;
              if (!rowCount && !headers.length) return null;
              // Precompute conflicts for this sheet
              const sheetMapping = mapping[target] ?? {};
              const usedBy: Record<string, string[]> = {};
              Object.entries(sheetMapping).forEach(([canonical, source]) => {
                if (!source) return;
                if (!usedBy[source]) usedBy[source] = [];
                usedBy[source].push(canonical);
              });
              return (
                <div key={target} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-mono text-xs font-semibold">{target}</p>
                    <span className="text-xs text-muted-foreground">{rowCount} filas</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CANONICAL_FIELDS[target].map((field) => {
                      const current = mapping[target]?.[field] ?? "";
                      const exact = headers.includes(field);
                      // fuzzy suggestion: find a header whose canonical key matches the field's canonical key
                      const fieldCanon = canonicalOf(field);
                      const suggestion = !exact && fieldCanon
                        ? headers.find((h) => canonicalOf(h) === fieldCanon) ?? null
                        : null;
                      const conflict = current && usedBy[current]?.length > 1;
                      const conflictLabel = conflict
                        ? `también usado por ${usedBy[current]!.filter((f) => f !== field).join(", ")}`
                        : "";
                      return (
                        <div key={field} className="space-y-1">
                          <Label className={`text-xs ${conflict ? "text-destructive" : ""}`}>
                            {field}
                            {exact && !current && <span className="ml-1 text-[10px] text-emerald-600">(auto ✓)</span>}
                            {!exact && suggestion && !current && (
                              <span className="ml-1 text-[10px] text-amber-600">(sugerido: {suggestion})</span>
                            )}
                            {conflict && (
                              <span className="ml-1 text-[10px] text-destructive">(conflicto: {conflictLabel})</span>
                            )}
                          </Label>
                          <Select
                            value={current || "__auto__"}
                            onValueChange={(v) => {
                              setMapping((prev) => {
                                const next = { ...prev, [target]: { ...(prev[target] ?? {}) } };
                                if (v === "__auto__") delete next[target]![field];
                                else next[target]![field] = v;
                                if (!Object.keys(next[target]!).length) delete next[target];
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className={`h-8 text-xs ${conflict ? "border-destructive text-destructive" : ""}`}>
                              <SelectValue placeholder="Auto" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__auto__">Auto-detectar</SelectItem>
                              {headers.map((h) => (
                                <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2">
              <Button onClick={confirmImport} disabled={busy} className="flex-1">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Confirmar e importar
              </Button>
              <Button variant="outline" onClick={() => setStaged(null)} disabled={busy}>
                Cancelar
              </Button>
            </div>
            {busy && stage && <p className="text-sm text-muted-foreground">{stage}</p>}
          </CardContent>
        </Card>
      )}

      {result && (() => {
        if (result.error) {
          return (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> No se pudo importar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-destructive">{result.error}</p>
                <Button variant="outline" onClick={() => setResult(null)}>Volver a intentar</Button>
              </CardContent>
            </Card>
          );
        }

        const counts = (result.summary?.counts ?? {}) as Record<string, number>;
        const created = (result.summary?.created ?? {}) as Record<string, number>;
        const skipped = (result.summary?.skipped ?? {}) as Record<string, number>;
        const allErrors: string[] = result.summary?.errors ?? [];
        // Separate "informational" errors (duplicate-hash races) from real ones.
        const isDuplicate = (msg: string) => /duplicate key|expenses_company_import_hash_uniq|payments_company_import_hash_uniq|23505/i.test(msg);
        const realErrors = allErrors.filter((m) => !isDuplicate(m));
        const dupErrors = allErrors.filter(isDuplicate);
        const totalCreated = Object.values(created).reduce((a, b) => a + (Number(b) || 0), 0);
        const totalSkipped = Object.values(skipped).reduce((a, b) => a + (Number(b) || 0), 0);
        const totalRead = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
        const pendingTasks = Array.isArray(result.pending_tasks) ? result.pending_tasks : [];
        const status: "success" | "partial" | "warning" =
          realErrors.length ? "warning" : (totalCreated === 0 && totalSkipped > 0 ? "partial" : "success");

        const statusUi = {
          success:  { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900", title: "Importación completada" },
          partial:  { icon: Info,         color: "text-blue-600",    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900",              title: "Sin cambios nuevos" },
          warning:  { icon: AlertTriangle,color: "text-amber-600",   bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900",          title: "Importado con avisos" },
        }[status];
        const StatusIcon = statusUi.icon;

        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resultado de la importación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status banner */}
              <div className={`flex items-start gap-3 rounded-md border p-3 ${statusUi.bg}`}>
                <StatusIcon className={`h-5 w-5 shrink-0 ${statusUi.color}`} />
                <div className="flex-1 text-sm">
                  <p className={`font-semibold ${statusUi.color}`}>{statusUi.title}</p>
                  <p className="text-muted-foreground mt-0.5">
                    Leí <b>{totalRead}</b> filas · creé <b>{totalCreated}</b> nuevas · omití <b>{totalSkipped}</b> duplicadas
                    {realErrors.length ? <> · <span className="text-amber-700">{realErrors.length} aviso{realErrors.length === 1 ? "" : "s"}</span></> : null}
                    {pendingTasks.length ? <> · <span className="text-amber-700">{pendingTasks.length} tareas sin proyecto</span></> : null}
                  </p>
                </div>
              </div>

              {/* Per-entity totals */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(created).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
                  <div key={k} className="rounded-md border p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Creados</p>
                    <p className="text-lg font-semibold">{String(v)}</p>
                    <p className="text-xs text-muted-foreground">{k}</p>
                  </div>
                ))}
                {Object.entries(skipped).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
                  <div key={`s-${k}`} className="rounded-md border border-dashed p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Omitidos</p>
                    <p className="text-lg font-semibold">{String(v)}</p>
                    <p className="text-xs text-muted-foreground">{k} (duplicados)</p>
                  </div>
                ))}
              </div>

              {/* Pending tasks (no project) */}
              {pendingTasks.length > 0 && (() => {
                const groups = new Map<string, any[]>();
                pendingTasks.forEach((t: any) => {
                  const code = t.project_code || "(sin código)";
                  groups.set(code, [...(groups.get(code) ?? []), t]);
                });
                return (
                  <div>
                    <p className="mb-1 text-sm font-semibold">Tareas sin proyecto</p>
                    <p className="mb-2 text-xs text-muted-foreground">Estas tareas hacen referencia a un Project Code que aún no existe. Crea el proyecto para reanudarlas.</p>
                    <div className="space-y-2">
                      {Array.from(groups.entries()).map(([code, items]) => (
                        <div key={code} className="rounded-md border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm">
                              <span className="font-mono">{code}</span>
                              <span className="ml-2 text-muted-foreground">{items.length} tarea{items.length === 1 ? "" : "s"}</span>
                            </div>
                            {code !== "(sin código)" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resolvingCode === code}
                                onClick={() => {
                                  const name = window.prompt(`Nombre del proyecto a crear para "${code}":`, code);
                                  if (!name) return;
                                  resolvePendingForCode(code, name.trim());
                                }}
                              >
                                {resolvingCode === code ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                                Crear proyecto
                              </Button>
                            )}
                          </div>
                          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                            {items.slice(0, 4).map((t: any, i: number) => <li key={i}>{t.title}{t.assignee ? ` — ${t.assignee}` : ""}</li>)}
                            {items.length > 4 && <li>+{items.length - 4} más…</li>}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Real errors with friendly hints */}
              {realErrors.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20 dark:border-amber-900">
                  <p className="mb-1 text-sm font-semibold text-amber-800 dark:text-amber-300">Avisos</p>
                  <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                    {realErrors.map((e, i) => {
                      let hint = "";
                      if (/invalid input value for enum payment_method/i.test(e)) {
                        hint = " · Método de pago no reconocido. Usa: cash, check, card, ach, zelle, venmo u other.";
                      } else if (/violates foreign key/i.test(e)) {
                        hint = " · Referencia inválida (proyecto/cliente/vendor inexistente).";
                      } else if (/null value in column/i.test(e)) {
                        hint = " · Falta un campo obligatorio en la fila.";
                      }
                      return <li key={i}><span className="font-mono">{e}</span>{hint && <span className="opacity-80">{hint}</span>}</li>;
                    })}
                  </ul>
                </div>
              )}

              {/* Duplicate notices, collapsed and informational */}
              {dupErrors.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <Info className="mr-1 inline h-3 w-3" />
                  {dupErrors.length} chunk{dupErrors.length === 1 ? "" : "s"} con filas ya importadas anteriormente (se omitieron correctamente).
                </p>
              )}

              {/* Diagnostics (collapsible) */}
              {result.diagnostics?.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showDiagnostics ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Pestañas detectadas ({result.diagnostics.length})
                  </button>
                  {showDiagnostics && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {result.diagnostics.map((d: any, i: number) => (
                        <li key={i}><span className="font-mono">{d.sheet}</span>: {d.rows} filas → <span className="font-mono">{d.target}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Primary actions */}
              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
                <Button onClick={() => { setResult(null); setFile(null); setSheetUrl(""); }} variant="outline" className="flex-1">
                  <Plus className="mr-2 h-4 w-4" /> Nueva importación
                </Button>
                <Button onClick={() => navigate("/projects")} className="flex-1">
                  Ver proyectos <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button onClick={() => navigate("/expenses")} variant="secondary" className="flex-1">
                  Ver gastos <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
};

export default ImportTrifectaOS;
