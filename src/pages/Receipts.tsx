import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileText, Image as ImageIcon, Inbox, Plus, RefreshCw, Sparkles, Upload } from "lucide-react";
import {
  useCategories,
  useProjects,
  useReceipts,
  useUpdateReceipt,
  useUploadReceipt,
  useVendors,
  RECEIPT_ALLOWED_MIME,
  RECEIPT_MAX_BYTES,
  getReceiptMimeType,
} from "@/hooks/useTrifectaData";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { usd } from "@/lib/format";
import { ReceiptStatusBadge, receiptStatusEdge } from "@/components/receipts/ReceiptStatusBadge";
import { ReceiptReviewSheet } from "@/components/receipts/ReceiptReviewSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { extractReceiptText } from "@/lib/receiptText";
import { prepareReceiptFile, isHeicLike } from "@/lib/imagePrep";
import { cn } from "@/lib/utils";
import { sha256File } from "@/lib/fileHash";
import { findDuplicateReceipt } from "@/hooks/useDuplicateReceipt";
import { parseReceiptOcrResponse, withReceiptOcrTimeout } from "@/lib/receiptOcr";

const fmtSize = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const fmtDate = (s?: string | null) => {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return ""; }
};

type TabKey =
  | "needs_review"
  | "ready_to_convert"
  | "converted_to_expense"
  | "rejected"
  | "unassigned";

const TABS: { value: TabKey; label: string }[] = [
  { value: "needs_review", label: "Revisar" },
  { value: "ready_to_convert", label: "Listos" },
  { value: "converted_to_expense", label: "Completados" },
  { value: "rejected", label: "Rechazados" },
  { value: "unassigned", label: "Sin asignar" },
];

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  needs_review: { title: "Inbox limpio", description: "No hay recibos esperando revisión. Sube uno nuevo para empezar." },
  ready_to_convert: { title: "Nada listo aún", description: "Los recibos revisados aparecerán aquí antes de convertirse en gasto." },
  converted_to_expense: { title: "Sin convertidos", description: "Los recibos convertidos en gasto se archivan en esta pestaña." },
  rejected: { title: "Sin rechazos", description: "Los recibos descartados aparecerán aquí para auditoría." },
  unassigned: { title: "Todo asignado", description: "No quedan recibos huérfanos sin proyecto o gasto." },
};

const Receipts = () => {
  const { data: projects } = useProjects();
  const { data: vendors } = useVendors();
  const { data: categories } = useCategories("expense");
  const updateReceipt = useUpdateReceipt();
  const [tab, setTab] = useState<TabKey>("needs_review");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [extracting, setExtracting] = useState(false);

  const filterOpts = useMemo(() => {
    if (tab === "unassigned") return { unlinkedOnly: true } as const;
    return {
      status: tab,
      projectId: projectFilter !== "all" ? projectFilter : undefined,
    } as const;
  }, [tab, projectFilter]);

  const { data: receipts, isLoading, error, refetch, isFetching } = useReceipts(filterOpts as any);

  const upload = useUploadReceipt();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open review sheet when arriving with ?review=<id> (e.g. from QuickCapture)
  const reviewIdParam = searchParams.get("review");
  useEffect(() => {
    if (!reviewIdParam) return;
    const found = (receipts ?? []).find((r: any) => r.id === reviewIdParam);
    if (found) {
      setReviewing(found);
      // Clean URL so it doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete("review");
      setSearchParams(next, { replace: true });
      return;
    }
    // Receipt may not be in the current tab's filter — fetch directly
    (async () => {
      const { data } = await supabase
        .from("receipts")
        .select("*, vendors(name), categories(name), projects(name), expenses(id, projects(name))")
        .eq("id", reviewIdParam)
        .maybeSingle();
      if (data) {
        setReviewing(data);
        const next = new URLSearchParams(searchParams);
        next.delete("review");
        setSearchParams(next, { replace: true });
      }
    })();
  }, [reviewIdParam, receipts, searchParams, setSearchParams]);

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const handleUpload = async (rawFile: File | undefined) => {
    if (!rawFile || upload.isPending || extracting) return;
    if (!RECEIPT_ALLOWED_MIME.includes(getReceiptMimeType(rawFile))) { toast.error("Solo JPG, PNG, HEIC o PDF"); return; }
    if (rawFile.size > RECEIPT_MAX_BYTES) { toast.error("El archivo excede 10 MB"); return; }
    setProgress(5);
    try {
      const file = await prepareReceiptFile(rawFile);
      if (isHeicLike(rawFile) && !isHeicLike(file)) toast.message("HEIC convertido a JPG");
      const fileHash = await sha256File(file);
      const duplicate = await findDuplicateReceipt({ hash: fileHash });
      if (duplicate) {
        toast.warning("Este recibo ya fue subido", {
          description: "Abre el recibo existente para revisarlo.",
        });
        return;
      }
      const created: any = await upload.mutateAsync({ file, fileHash, onProgress: setProgress });
      if (!created) return;

      setExtracting(true);
      let enriched = created;
      try {
        const dataUrl = await fileToDataUrl(file);
        const ocrText = await extractReceiptText(file).catch(() => "");
        const { data, error: ocrErr } = await withReceiptOcrTimeout(supabase.functions.invoke("process-receipt", {
          body: {
            fileDataUrl: dataUrl,
            ocrText,
            knownCategories: (categories ?? []).map((c: any) => c.name),
            knownVendors: (vendors ?? []).map((v: any) => v.name),
          },
        }));
        if (ocrErr) throw ocrErr;
        const parsed = parseReceiptOcrResponse(data);

        if (parsed) {
          const matchedVendor = parsed.vendor
            ? (vendors ?? []).find((v: any) => norm(v.name) === norm(parsed.vendor))
            : null;
          const matchedCategory = parsed.category
            ? (categories ?? []).find((c: any) => norm(c.name) === norm(parsed.category))
            : null;

          const patch: Record<string, any> = { file_hash: fileHash };
          if (parsed.amount != null) patch.amount = parsed.amount;
          if (parsed.spent_on) patch.spent_on = parsed.spent_on;
          if (parsed.description) patch.description = parsed.description;
          if (matchedVendor?.id) patch.vendor_id = matchedVendor.id;
          if (matchedCategory?.id) patch.category_id = matchedCategory.id;

          if (Object.keys(patch).length > 0) {
            enriched = await updateReceipt.mutateAsync({ id: created.id, patch });
            if (parsed.amount) {
              toast.success(`Detectado: $${parsed.amount}${parsed.vendor ? ` · ${parsed.vendor}` : ""}`);
            }
          }
        }
      } catch (e) {
        console.warn("OCR failed, opening review anyway", e);
        await updateReceipt.mutateAsync({ id: created.id, patch: { file_hash: fileHash } });
        toast.warning("El recibo se guardó, pero no se pudo leer", {
          description: "Puedes completar los datos manualmente o volver a intentar.",
        });
      } finally {
        setExtracting(false);
      }

      setReviewing(enriched);
    } finally {
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleUpload(f);
  };

  const busy = upload.isPending || extracting;

  return (
    <div className="space-y-4 pb-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => handleUpload(e.target.files?.[0])}
      />

      {/* Header */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recibos</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Revisa, asigna y convierte recibos en gastos.
          </p>
        </div>
        <Button
          size="lg"
          className="h-11"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Plus className="mr-1 h-4 w-4" />
          {upload.isPending ? "Subiendo…" : extracting ? "Leyendo…" : "Subir"}
        </Button>
      </div>

      {/* Dropzone + upload state */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={cn(
          "group relative cursor-pointer rounded-lg border-2 border-dashed bg-card px-4 py-5 transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
          busy && "pointer-events-none opacity-90"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            {busy ? <Sparkles className="h-5 w-5 animate-pulse text-primary" /> : <Upload className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {upload.isPending ? "Subiendo recibo…" : extracting ? "Analizando con IA…" : "Arrastra o toca para subir"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">JPG · PNG · HEIC · PDF · máx 10MB</p>
          </div>
        </div>
        {(upload.isPending && progress > 0) && (
          <Progress value={progress} className="mt-3 h-1.5" />
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid w-full grid-cols-5 rounded-xl">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-[11px] font-semibold uppercase tracking-wide">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Filter */}
      {tab !== "unassigned" && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">Proyecto</span>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(projects ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* States */}
      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="flex items-center gap-3 p-3">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && !isLoading && (
        <Card className="relative overflow-hidden border-destructive/40">
          <span className="edge bg-destructive" />
          <CardContent className="flex flex-col items-center gap-3 p-6 pl-7 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-destructive">Error</p>
              <p className="text-sm font-semibold">No pudimos cargar los recibos</p>
              <p className="text-xs text-muted-foreground">
                {(error as any)?.message || "Revisa tu conexión e inténtalo de nuevo."}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Reintentando…" : "Reintentar"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && receipts && receipts.length === 0 && (
        <EmptyState
          icon={Inbox}
          title={EMPTY_COPY[tab].title}
          description={EMPTY_COPY[tab].description}
          actionLabel={tab === "needs_review" ? "Subir recibo" : undefined}
          onAction={tab === "needs_review" ? () => inputRef.current?.click() : undefined}
        />
      )}

      {/* List */}
      <div className="space-y-2">
        {(receipts ?? []).map((r: any) => {
          const isImage = r.mime_type?.startsWith("image/");
          const projectName = r.projects?.name ?? r.expenses?.projects?.name;
          const edgeClass = receiptStatusEdge[r.status as keyof typeof receiptStatusEdge] ?? "edge-muted";
          return (
            <Card
              key={r.id}
              className="cursor-pointer transition-colors hover:bg-accent/40"
              onClick={() => setReviewing(r)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                  {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">
                      {r.vendors?.name ?? r.file_name ?? "Recibo"}
                    </p>
                    <ReceiptStatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {r.amount != null && (
                      <span className="money font-semibold text-foreground">{usd(Number(r.amount))}</span>
                    )}
                    {r.spent_on && <span className="money">{fmtDate(r.spent_on)}</span>}
                    {projectName ? (
                      <span className="truncate">· {projectName}</span>
                    ) : (
                      <span className="text-warning-foreground/80">· sin proyecto</span>
                    )}
                    <span className="ml-auto shrink-0 text-muted-foreground/70">{fmtSize(r.file_size)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ReceiptReviewSheet
        open={!!reviewing}
        onOpenChange={(o) => !o && setReviewing(null)}
        receipt={reviewing}
      />
    </div>
  );
};

export default Receipts;
