import { useState } from "react";
import JSZip from "jszip";
import { AlertTriangle, CheckCircle2, FileArchive, Loader2, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { dryRunV10, V10_FILES, type V10DryRun, type V10FileName } from "@/lib/v10Import";

type LoadedFiles = Partial<Record<V10FileName, string>>;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const ZIP_NAME = "THI_V10_LOVABLE_REVIEW_PACKAGE.zip";

export default function ImportV10() {
  const { companyId, isAdmin, isManager, loading: roleLoading } = useUserRoles();
  const [files, setFiles] = useState<LoadedFiles>({});
  const [fileLabels, setFileLabels] = useState<string[]>([]);
  const [result, setResult] = useState<V10DryRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [publishLog, setPublishLog] = useState<string | null>(null);

  const allowed = isAdmin || isManager;

  const loadFiles = async (selected: FileList | null) => {
    const list = Array.from(selected ?? []);
    if (list.length === 1 && list[0].name.toLowerCase().endsWith(".zip")) {
      await loadZipPackage(list[0]);
      return;
    }
    const unexpected = list.filter((file) =>
      !V10_FILES.some((name) => name.toLowerCase() === file.name.toLowerCase()));
    if (unexpected.length) {
      toast.error(`Archivo no admitido: ${unexpected.map((file) => file.name).join(", ")}`);
      return;
    }
    if (list.some((file) => file.size > MAX_FILE_BYTES) ||
      list.reduce((total, file) => total + file.size, 0) > MAX_PACKAGE_BYTES) {
      toast.error("El paquete supera el límite permitido de 5 MB por archivo o 10 MB en total.");
      return;
    }
    const next: LoadedFiles = {};
    for (const file of list) {
      const expected = V10_FILES.find((name) => name.toLowerCase() === file.name.toLowerCase());
      if (expected) next[expected] = await file.text();
    }
    setFiles(next);
    setFileLabels(list.map((file) => file.name));
    setResult(null);
  };

  const loadZipPackage = async (file: File) => {
    if (file.size > MAX_PACKAGE_BYTES) {
      toast.error("El ZIP supera el límite permitido de 10 MB.");
      return;
    }
    try {
      const archive = await JSZip.loadAsync(file);
      const next: LoadedFiles = {};
      const labels: string[] = [];
      for (const expected of V10_FILES) {
        const entry = Object.values(archive.files).find((item) =>
          !item.dir && item.name.split("/").pop()?.toLowerCase() === expected.toLowerCase());
        if (!entry) continue;
        const text = await entry.async("string");
        const bytes = new TextEncoder().encode(text).byteLength;
        if (bytes > MAX_FILE_BYTES) {
          toast.error(`${expected} supera el límite de 5 MB.`);
          return;
        }
        next[expected] = text;
        labels.push(expected);
      }
      setFiles(next);
      setFileLabels([file.name, ...labels]);
      setResult(null);
      if (V10_FILES.every((name) => next[name])) {
        toast.success("ZIP V10 cargado. Ahora ejecuta el dry run antes de importar.");
      } else {
        toast.error("El ZIP no contiene los seis CSV requeridos del paquete V10.");
      }
    } catch {
      toast.error("No se pudo leer el ZIP. Sube el paquete V10 original o selecciona los CSV extraídos.");
    }
  };

  const runDry = async () => {
    if (!companyId || !allowed) return;
    setLoading(true);
    try {
      const [projectsRes, categoriesRes, existingRes] = await Promise.all([
        supabase.from("projects").select("id, name, project_code, clients(name)").eq("company_id", companyId),
        supabase.from("categories").select("id, name").eq("company_id", companyId).eq("kind", "expense"),
        // Generated types will include stable_key after the approved migration is applied.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("import_rows").select("stable_key").eq("company_id", companyId).not("stable_key", "is", null),
      ]);
      if (projectsRes.error) throw projectsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      const dry = dryRunV10({
        files,
        companyId,
        catalogs: {
          projects: projectsRes.data ?? [],
          categories: categoriesRes.data ?? [],
          existingStableKeys: (existingRes.data ?? []).map((row: { stable_key: string }) => row.stable_key),
        },
      });
      setResult(dry);
      if (dry.canImport) toast.success("Validación terminada. Revisa las advertencias antes de importar.");
      else toast.error("La validación encontró errores que bloquean la importación.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo ejecutar la validación.");
    } finally {
      setLoading(false);
    }
  };

  const stageImport = async () => {
    if (!result?.canImport || !companyId || !allowed || importing) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-v10-stage", {
        body: { files, expected_company_id: companyId },
      });
      if (error) throw error;
      toast.success(`Importación preparada: ${data?.inserted ?? 0} nuevas, ${data?.updated ?? 0} actualizadas, ${data?.ignored ?? data?.duplicates ?? 0} ignoradas y ${data?.review ?? 0} a revisión.`);
      setResult((current) => current ? { ...current, existingRows: current.existingRows + Number(data?.duplicates ?? 0) } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo preparar la importación.");
    } finally {
      setImporting(false);
    }
  };

  // Refreshes the classification of an already staged package in place. Nothing
  // is deleted or duplicated: same rows, same keys, only derived fields change.
  const reclassifyStaging = async () => {
    if (!companyId || !allowed || importing) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-v10-stage", {
        body: { files, expected_company_id: companyId, reclassify: true },
      });
      if (error) throw error;
      setPublishLog(`Recalculo: ${data?.changed ?? 0} filas actualizadas, ${data?.unchanged ?? 0} sin cambios, ${data?.locked ?? 0} ya publicadas, ${data?.missing ?? 0} sin coincidencia.`);
      toast.success("Clasificación recalculada sobre el staging existente.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo recalcular la clasificación.");
    } finally {
      setImporting(false);
    }
  };

  // Publishes the confirmed rows in idempotent batches; pending bank rows,
  // handoff analytics and the review tray stay untouched.
  const commitStaging = async () => {
    if (!companyId || !allowed || importing) return;
    setImporting(true);
    try {
      const { data: rows, error } = await supabase.from("import_rows")
        .select("id").eq("company_id", companyId).eq("status", "confirmed").limit(2000);
      if (error) throw error;
      const ids = (rows ?? []).map((row) => row.id);
      if (!ids.length) {
        setPublishLog("No hay filas confirmadas pendientes de publicar.");
        return;
      }
      let created = 0, skipped = 0, failed = 0;
      for (let offset = 0; offset < ids.length; offset += 200) {
        const { data, error: commitError } = await supabase.functions.invoke("import-commit", {
          body: { row_ids: ids.slice(offset, offset + 200) },
        });
        if (commitError) throw commitError;
        created += Number(data?.created ?? 0);
        skipped += Number(data?.skipped ?? 0);
        failed += Number(data?.errors?.length ?? 0);
        setPublishLog(`Publicando… ${created} creadas, ${skipped} omitidas, ${failed} con error.`);
      }
      setPublishLog(`Publicación terminada: ${created} creadas, ${skipped} omitidas por política, ${failed} con error.`);
      toast.success("Publicación de importación terminada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo publicar la importación.");
    } finally {
      setImporting(false);
    }
  };

  // Ledger-only publication: the review tray rows are confirmed bank movements,
  // so they belong in bank_transactions with no project/category and without
  // creating any expense, payment or profitability effect. Idempotent: only rows
  // whose ledger_transaction_id is still null are sent.
  const publishReviewLedger = async () => {
    if (!companyId || !allowed || importing) return;
    setImporting(true);
    try {
      const { data: rows, error } = await supabase.from("import_rows")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .not("traceability_status", "in", "(PENDING_BANK_CONFIRMATION,HANDOFF_ADJUSTMENT)")
        .is("ledger_transaction_id", null)
        .limit(2000);
      if (error) throw error;
      const ids = (rows ?? []).map((row) => row.id);
      if (!ids.length) {
        setPublishLog("El ledger de la bandeja de revisión ya está completo.");
        return;
      }
      let created = 0, skipped = 0, failed = 0;
      for (let offset = 0; offset < ids.length; offset += 200) {
        const { data, error: commitError } = await supabase.functions.invoke("import-commit", {
          body: { row_ids: ids.slice(offset, offset + 200), mode: "ledger_only" },
        });
        if (commitError) throw commitError;
        created += Number(data?.created ?? 0);
        skipped += Number(data?.skipped ?? 0);
        failed += Number(data?.errors?.length ?? 0);
        setPublishLog(`Publicando ledger de revisión… ${created} movimientos, ${skipped} omitidos, ${failed} con error.`);
      }
      setPublishLog(`Ledger de revisión listo: ${created} movimientos bancarios, ${skipped} omitidos, ${failed} con error. Las filas siguen en revisión.`);
      toast.success("Ledger de la bandeja de revisión publicado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo publicar el ledger de revisión.");
    } finally {
      setImporting(false);
    }
  };



  if (roleLoading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!allowed) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex gap-3 p-5">
          <ShieldAlert className="h-6 w-6 shrink-0 text-destructive" />
          <div>
            <p className="font-bold">Acceso restringido</p>
            <p className="text-sm text-muted-foreground">Solo administradores y managers pueden preparar importaciones financieras.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const loadedRequired = V10_FILES.filter((name) => files[name]).length;
  return (
    <div className="space-y-4 pb-8">
      <div>
        <p className="eyebrow">Finanzas · Importación controlada</p>
        <h1 className="text-2xl font-bold tracking-tight">Importar paquete V10</h1>
        <p className="mt-1 text-sm text-muted-foreground">Primero valida. Nada se crea antes de confirmar la importación.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Seleccionar archivos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><FileArchive className="h-4 w-4" />Paquete esperado: THI V10</p>
            <p className="mt-1 text-xs text-muted-foreground">Sube directamente {ZIP_NAME}. También puedes extraerlo y seleccionar juntos sus seis CSV.</p>
          </div>
          <input
            id="v10-files"
            type="file"
            multiple
            accept=".zip,.csv,application/zip,text/csv"
            className="hidden"
            onChange={(event) => void loadFiles(event.target.files)}
          />
          <Button className="h-11 w-full" variant="outline" onClick={() => document.getElementById("v10-files")?.click()}>
            <Upload className="mr-2 h-4 w-4" />Subir ZIP o CSV V10
          </Button>
          <div className="flex items-center justify-between text-sm">
            <span>Compañía</span><span className="font-mono text-xs">{companyId}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Archivos requeridos</span><Badge variant={loadedRequired === V10_FILES.length ? "default" : "secondary"}>{loadedRequired}/{V10_FILES.length}</Badge>
          </div>
          {fileLabels.length > 0 && <p className="break-words text-xs text-muted-foreground">{fileLabels.join(" · ")}</p>}
          <Button className="h-11 w-full" onClick={runDry} disabled={loading || loadedRequired !== V10_FILES.length}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ejecutar dry run
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card className={result.canImport ? "border-success/40" : "border-destructive/40"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {result.canImport ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
                2. Resultado del dry run
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Filas" value={result.totalRows} />
                <Metric label="Periodo" value={result.periodStart && result.periodEnd ? `${result.periodStart}–${result.periodEnd}` : "Sin periodo"} />
                <Metric label="Válidas" value={result.validRows} />
                <Metric label="Duplicados internos" value={result.internalDuplicates} warning />
                <Metric label="Grupos SPLIT" value={result.splitGroups} warning />
                <Metric label="SPLIT sin comprobar" value={result.unverifiableSplitGroups} warning />
                <Metric label="Ya existentes" value={result.existingRows} />
                <Metric label="Proyectos reconocidos" value={result.recognizedProjects} />
                <Metric label="Proyectos inexistentes" value={result.missingProjects.length} warning />
                <Metric label="Categorías desconocidas" value={result.unknownCategories.length} warning />
                <Metric label="Pendientes bancarios" value={result.pendingBank} warning />
                <Metric label="Revisión de proyecto" value={result.needsProjectReview} warning />
                <Metric label="Ajustes handoff" value={result.handoffAdjustments} />
                <Metric label="Correcciones" value={result.correctionsApplied} />
                <Metric label="Ingresos" value={`$${result.totalIncome.toFixed(2)}`} />
                <Metric label="Costos" value={`$${result.totalCost.toFixed(2)}`} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Control label="Diferencia de ingresos" value={result.summaryIncomeDifference} />
                <Control label="Diferencia de costos" value={result.summaryCostDifference} />
                <Control label="Control bancario ingresos" value={result.bankIncomeDifference} />
                <Control label="Control bancario egresos" value={result.bankCostDifference} />
              </div>
              {result.blockingErrors.map((message) => <Message key={message} text={message} destructive />)}
              {result.warnings.map((message) => <Message key={message} text={message} />)}
              {result.damagedCategories.map((category) => (
                <div key={category.original} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Categoría con codificación dañada</p>
                  <p>Original: <span className="font-mono">{category.original}</span></p>
                  <p>Detección: {category.detected}</p>
                  <p>Propuesta: <span className="font-mono">{category.proposed}</span></p>
                  <p>Filas CSV: {category.rows.join(", ")}</p>
                  <p className="mt-1 text-xs">No se asignará ni creará automáticamente.</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">3. Preparar importación</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Los pendientes y coincidencias aparentes quedarán en revisión. Los ajustes handoff permanecerán separados.
              </p>
              <Button className="h-12 w-full" onClick={stageImport} disabled={!result.canImport || importing}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Importar después de validar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">4. Recalcular y publicar el staging</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Si el paquete ya estaba preparado, primero recalcula su clasificación (no borra ni duplica nada) y
                después publica en lotes. Los 20 pendientes bancarios, los ajustes handoff y la bandeja de revisión
                nunca se publican.
              </p>
              <Button className="h-12 w-full" variant="outline" onClick={reclassifyStaging} disabled={!result.canImport || importing}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Recalcular clasificación
              </Button>
              <Button className="h-12 w-full" onClick={commitStaging} disabled={importing}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar y publicar por lotes
              </Button>
              <Button className="h-12 w-full" variant="secondary" onClick={publishReviewLedger} disabled={importing}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publicar sólo ledger de la bandeja de revisión
              </Button>
              <p className="text-xs text-muted-foreground">
                Los movimientos en revisión sí son bancarios: se registran en el ledger sin proyecto ni categoría,
                sin crear gasto ni pago, y las filas permanecen en revisión.
              </p>
              {publishLog && <p className="rounded-md bg-muted p-2 text-sm">{publishLog}</p>}
            </CardContent>
          </Card>

        </>
      )}
    </div>
  );
}

function Metric({ label, value, warning }: { label: string; value: string | number; warning?: boolean }) {
  return <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className={warning ? "mt-1 text-lg font-bold text-amber-600" : "mt-1 text-lg font-bold"}>{value}</p></div>;
}

function Control({ label, value }: { label: string; value: number | null }) {
  const ok = value === 0;
  return <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{label}</span><Badge variant={ok ? "default" : "destructive"}>{value == null ? "Sin control" : `$${value.toFixed(2)}`}</Badge></div>;
}

function Message({ text, destructive }: { text: string; destructive?: boolean }) {
  return <p className={destructive ? "rounded-md bg-destructive/10 p-2 text-sm text-destructive" : "rounded-md bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400"}>{text}</p>;
}
