/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, Trash2, Plus, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useDivisions, useClientProjectCount } from "@/hooks/useTrifectaData";
import { applyMapping, autoMap, FieldKey, MappedItem, parseFile, ParsedFile } from "@/lib/estimateParser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usd } from "@/lib/format";
import { PROJECT_TYPES, type ProjectType } from "@/lib/enums";
import { ClientPicker, type ClientPickerValue } from "@/components/clients/ClientPicker";
import { buildProjectName, inferKeyword, KEYWORD_OPTIONS } from "@/lib/projectNaming";
import { useBusinessUnits } from "@/hooks/useBusinessUnits";

const FIELD_LABELS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "description", label: "Descripción", required: true },
  { key: "category", label: "Categoría" },
  { key: "quantity", label: "Cantidad" },
  { key: "unit", label: "Unidad" },
  { key: "unit_price", label: "Precio unitario" },
  { key: "total", label: "Total" },
];

const ImportEstimate = () => {
  const navigate = useNavigate();
  const { data: divisions } = useDivisions();
  const { data: businessUnits = [] } = useBusinessUnits({ activeOnly: true });

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({ description: null, category: null, quantity: null, unit: null, unit_price: null, total: null });
  const [items, setItems] = useState<MappedItem[]>([]);

  const [divisionId, setDivisionId] = useState<string>("");
  const [businessUnitId, setBusinessUnitId] = useState<string>("__none");
  const [projectType, setProjectType] = useState<ProjectType>("other");
  const [keyword, setKeyword] = useState<string>("");
  const [keywordTouched, setKeywordTouched] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [client, setClient] = useState<ClientPickerValue>({
    client_id: null, name: "", phone: "", email: "", address: "", notes: "",
  });
  const { data: existingClientCount } = useClientProjectCount(client.client_id ?? undefined);

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.total || 0), 0), [items]);

  useEffect(() => {
    if (parsed) setItems(applyMapping(parsed.rows, mapping));
  }, [parsed, mapping]);

  // Auto-infer keyword from project type or estimate items unless user touched it
  useEffect(() => {
    if (keywordTouched) return;
    const inferred = inferKeyword(projectType, items.map((i) => i.description));
    if (inferred) setKeyword(inferred);
  }, [projectType, items, keywordTouched]);

  // Auto-build project name unless user manually edited it
  useEffect(() => {
    if (nameTouched) return;
    if (!client.name.trim() || !keyword) { setProjectName(""); return; }
    setProjectName(buildProjectName(client.name, keyword, existingClientCount ?? 0));
  }, [client.name, keyword, existingClientCount, nameTouched]);

  // Handoff files are named after the client/project (e.g. "JACK PISCO.csv").
  // Turn that into a suggested client name so the user doesn't type it from
  // scratch — the file has no name/address columns, so this seeds the manual step.
  const suggestNameFromFilename = (fname: string) =>
    fname
      .replace(/\.[^.]+$/, "")           // drop extension
      .replace(/[_-]+/g, " ")            // underscores/dashes -> spaces
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()); // Title Case

  const handleFile = async (file: File) => {
    setFilename(file.name);
    try {
      const p = await parseFile(file);
      setParsed(p);
      setMapping(autoMap(p.headers));
      // Pre-fill the client name from the filename (only if not already set).
      const suggested = suggestNameFromFilename(file.name);
      if (suggested) {
        setClient((prev) => (prev.name.trim() || prev.client_id ? prev : { ...prev, name: suggested }));
      }
      toast.success(`Se analizaron ${p.rows.length} filas`);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo analizar el archivo");
      setParsed(null);
    }
  };

  const updateItem = (idx: number, patch: Partial<MappedItem>) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, { description: "", category: "", quantity: 1, unit: "", unit_price: 0, total: 0 }]);

  const canCreate = divisionId && projectName.trim() && client.name.trim() && keyword && items.length > 0;

  const createProject = async () => {
    if (!canCreate) {
      toast.error("Nombre del cliente, keyword, división y al menos un item son obligatorios.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      const company_id = profile?.company_id;
      if (!company_id) throw new Error("No company on profile");

      // Resolve client (link existing or create new)
      let client_id = client.client_id;
      if (!client_id) {
        const { data: c, error: ce } = await supabase
          .from("clients")
          .insert({
            company_id,
            name: client.name.trim(),
            phone: client.phone || null,
            email: client.email || null,
            address: client.address || null,
            notes: client.notes || null,
          })
          .select("id").single();
        if (ce) throw ce;
        client_id = c.id;
      }

      // Project
      const { data: project, error: pe } = await supabase
        .from("projects")
        .insert({
          company_id, division_id: divisionId, client_id,
          business_unit_id: businessUnitId === "__none" ? null : businessUnitId,
          name: projectName.trim(),
          address: client.address || null,
          project_type: projectType,
          estimated_total: total,
          status: "active",
          created_by: user.id,
        })
        .select("id").single();
      if (pe) throw pe;

      // Estimate + items
      const { data: est, error: ee } = await supabase
        .from("estimates")
        .insert({
          company_id, division_id: divisionId, project_id: project.id,
          source: "handoff",
          source_format: filename.split(".").pop()?.toLowerCase() ?? "csv",
          raw_filename: filename,
          total,
          imported_by: user.id,
        })
        .select("id").single();
      if (ee) throw ee;

      if (items.length > 0) {
        const itemsPayload = items.map((it, idx) => ({
          estimate_id: est.id, company_id,
          description: it.description || "Línea",
          category: it.category || null,
          quantity: it.quantity, unit: it.unit || null,
          unit_price: it.unit_price, total: it.total, position: idx,
        }));
        const { error: ie } = await supabase.from("estimate_items").insert(itemsPayload);
        if (ie) throw ie;
      }

      // Generate basic work plan
      const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];
      const taskSeeds = categories.length > 0
        ? categories.map((c) => ({ title: c, task_type: c }))
        : items.slice(0, 12).map((i) => ({ title: i.description.slice(0, 80), task_type: i.category || "general" }));

      const tasksPayload = taskSeeds.map((t, idx) => ({
        company_id, division_id: divisionId, project_id: project.id,
        project_type: projectType, task_type: t.task_type,
        title: t.title, status: "pending" as const, priority: "medium" as const, position: idx,
      }));
      if (tasksPayload.length > 0) {
        const { error: te } = await supabase.from("tasks").insert(tasksPayload);
        if (te) throw te;
      }

      toast.success("Proyecto creado con plan de trabajo");
      navigate(`/projects/${project.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "No se pudo crear el proyecto");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Importar estimado</h1>
      <p className="-mt-3 text-sm text-muted-foreground">Sube un CSV o Excel exportado de Handoff.ai. Soporte para PDF próximamente.</p>

      <Card>
        <CardContent className="p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-4 py-8 text-center transition hover:bg-muted">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">{filename || "Toca para elegir CSV / Excel"}</span>
            <span className="text-xs text-muted-foreground">CSV, XLSX, XLS</span>
            <input type="file" accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        </CardContent>
      </Card>

      {parsed && (
        <>
          {/* Column mapping */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Mapear columnas</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FIELD_LABELS.map(({ key, label, required }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
                    <Select value={mapping[key] ?? "__none"} onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v === "__none" ? null : v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— ninguno —</SelectItem>
                        {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Client */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">Cliente</p>
              <p className="-mt-1 text-xs text-muted-foreground">
                El archivo de Handoff no trae nombre ni dirección. Sugerimos el nombre a partir del archivo — <span className="font-medium">verifícalo y agrega la dirección</span> aquí.
              </p>
              <ClientPicker value={client} onChange={setClient} />
            </CardContent>
          </Card>

          {/* Project meta */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">Detalles del proyecto</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">División *</Label>
                  <Select value={divisionId} onValueChange={setDivisionId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona una división" /></SelectTrigger>
                    <SelectContent>{divisions?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de proyecto</Label>
                  <Select value={projectType} onValueChange={(v) => setProjectType(v as ProjectType)}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROJECT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Área del negocio</Label>
                  <Select value={businessUnitId} onValueChange={setBusinessUnitId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Sin área" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sin área</SelectItem>
                      {businessUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Keyword del proyecto *</Label>
                  <Select value={keyword || "__pick"} onValueChange={(v) => { setKeyword(v); setKeywordTouched(true); setNameTouched(false); }}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Elige keyword (Baño, Cocina…)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__pick" disabled>Elige keyword</SelectItem>
                      {KEYWORD_OPTIONS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Nombre del proyecto * (auto-generado, editable)</Label>
                  <Input className="h-11" value={projectName} placeholder="ej. Diego Passarella Baño"
                    onChange={(e) => { setProjectName(e.target.value); setNameTouched(true); }} />
                  {!nameTouched && client.client_id && (existingClientCount ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Este cliente tiene {existingClientCount} proyecto{existingClientCount === 1 ? "" : "s"} existente{existingClientCount === 1 ? "" : "s"} — numerado automáticamente.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items preview */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Líneas ({items.length})</p>
                <p className="text-sm font-bold">{usd(total)}</p>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="rounded-lg border border-border p-3">
                    <div className="grid grid-cols-12 gap-2">
                      <Input className="col-span-12 h-9" value={it.description} placeholder="Descripción" onChange={(e) => updateItem(idx, { description: e.target.value })} />
                      <Input className="col-span-6 h-9" value={it.category} placeholder="Categoría" onChange={(e) => updateItem(idx, { category: e.target.value })} />
                      <Input className="col-span-3 h-9" type="number" value={it.quantity} placeholder="Cant." onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                      <Input className="col-span-3 h-9" value={it.unit} placeholder="Unidad" onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                      <Input className="col-span-6 h-9" type="number" value={it.unit_price} placeholder="$ Unit." onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value), total: Number(e.target.value) * it.quantity })} />
                      <Input className="col-span-5 h-9" type="number" value={it.total} placeholder="$ Total" onChange={(e) => updateItem(idx, { total: Number(e.target.value) })} />
                      <Button variant="ghost" size="icon" className="col-span-1 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addItem} className="w-full"><Plus className="mr-1 h-4 w-4" /> Agregar línea</Button>
              </div>
            </CardContent>
          </Card>

          {/* Confirm bar — sticky so the action is always visible */}
          <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="truncate">{items.length} ítem{items.length === 1 ? "" : "s"} · {projectName || "(sin nombre)"}</span>
              </div>
              <span className="font-bold">{usd(total)}</span>
            </div>
            {!canCreate && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Falta:&nbsp;
                  {[
                    !divisionId && "división",
                    !client.name.trim() && "cliente",
                    !keyword && "keyword",
                    !projectName.trim() && "nombre",
                    items.length === 0 && "al menos 1 ítem",
                  ].filter(Boolean).join(", ")}.
                </span>
              </div>
            )}
            <Button onClick={createProject} disabled={!canCreate || submitting} className="h-12 w-full text-base font-semibold">
              {submitting
                ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Importando…</>
                : <><CheckCircle2 className="mr-2 h-5 w-5" /> Confirmar importación</>}
            </Button>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              Se creará el proyecto, el estimate y el plan de trabajo.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default ImportEstimate;
