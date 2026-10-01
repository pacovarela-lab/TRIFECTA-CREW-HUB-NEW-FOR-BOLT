import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Check, Images, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { estimateImageStoragePath } from "@/lib/estimatePhotoFoundation";
import { analysisErrorIsRetryable, analysisErrorMessage, extractAnalysisErrorCode } from "@/lib/estimatePhotoErrors";
import { orderedEstimateImageSetHash, prepareEstimatePhotos, type PreparedEstimatePhoto } from "@/lib/estimatePhotoScan";
import { EstimatePhotoReview } from "@/components/estimates/EstimatePhotoReview";

type Photo = PreparedEstimatePhoto & { id: string };
type AnalysisStage = "idle" | "preparing" | "reading" | "organizing" | "ready" | "error";
const ANALYSIS_STEPS: { stage: Exclude<AnalysisStage, "idle" | "error">; label: string }[] = [
  { stage: "preparing", label: "Preparando foto" },
  { stage: "reading", label: "Leyendo presupuesto" },
  { stage: "organizing", label: "Organizando partidas" },
  { stage: "ready", label: "Listo para revisar" },
];

const extension = (file: File): "jpg" | "jpeg" | "png" | "webp" => {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
};

export default function EstimatePhotoScan() {
  const { user } = useAuth();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>("idle");
  const submitLock = useRef(false);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [uncertainties, setUncertainties] = useState<string[]>([]);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      const incoming = Array.from(list);
      if (photos.length + incoming.length > 5) throw new Error("Puedes usar hasta 5 fotos.");
      const prepared = await prepareEstimatePhotos(incoming);
      setPhotos((current) => [...current, ...prepared.map((photo) => ({ ...photo, id: crypto.randomUUID() }))]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos preparar las fotos."); }
  };

  const move = (index: number, delta: number) => setPhotos((current) => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const copy = [...current];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  });

  const analyze = async () => {
    if (!user || photos.length < 1 || busy || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setFailureCode(null);
    setAnalysisStage("preparing");
    try {
      setProgress("Preparando foto");
      // Foundation is newer than the checked-in generated Database type; keep the escape hatch local.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const profile = await db.from("profiles").select("company_id").eq("id", user.id).single();
      if (profile.error || !profile.data?.company_id) throw new Error("No se encontró tu compañía.");
      const companyId = profile.data.company_id as string;
      let currentEstimateId = estimateId;
      if (!currentEstimateId) {
        const created = await db.from("estimates").insert({ company_id: companyId, source: "photo_ai", source_type: "photo_ai", created_by: user.id, imported_by: user.id, title: "Foto de presupuesto", status: "draft", schema_version: "estimate-photo-v1", total: 0 }).select("id").single();
        if (created.error) throw created.error;
        currentEstimateId = created.data.id;
        setEstimateId(currentEstimateId);
      }

      setProgress("Preparando foto");
      const existing = await db.from("estimate_images").select("id,page_number,sha256").eq("estimate_id", currentEstimateId).eq("company_id", companyId);
      if (existing.error) throw existing.error;
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        const page = index + 1;
        const prior = existing.data?.find((entry: { page_number: number; sha256: string }) => entry.page_number === page && entry.sha256 === photo.sha256);
        if (prior) continue;
        const path = estimateImageStoragePath(companyId, currentEstimateId!, photo.id, extension(photo.file));
        const uploaded = await supabase.storage.from("estimate-images").upload(path, photo.file, { contentType: photo.file.type, upsert: false });
        if (uploaded.error && !/already exists/i.test(uploaded.error.message)) throw uploaded.error;
        const metadata = await db.from("estimate_images").insert({ id: photo.id, company_id: companyId, estimate_id: currentEstimateId, storage_path: path, page_number: page, sha256: photo.sha256, mime_type: photo.file.type, byte_size: photo.file.size, created_by: user.id });
        if (metadata.error && !/duplicate/i.test(metadata.error.message)) throw metadata.error;
      }

      const imageSetHash = await orderedEstimateImageSetHash(photos.map((photo) => photo.sha256));
      setAnalysisStage("reading");
      setProgress("Leyendo presupuesto");
      const response = await supabase.functions.invoke("estimate-photo-analyze", { body: { estimate_id: currentEstimateId, request_key: requestKey, image_set_hash: imageSetHash } });
      if (response.error) {
        const code = await extractAnalysisErrorCode(response.error);
        setFailureCode(code ?? "analysis_failed");
        setProgress(analysisErrorMessage(code));
        setAnalysisStage("error");
        toast.error(analysisErrorMessage(code));
        return;
      }
      setAnalysisStage("organizing");
      setProgress("Organizando partidas");
      setFailureCode(null);
      setExtractionWarnings(Array.isArray(response.data?.extraction?.warnings) ? response.data.extraction.warnings.filter((value: unknown): value is string => typeof value === "string") : []);
      setUncertainties(Array.isArray(response.data?.extraction?.uncertainties) ? response.data.extraction.uncertainties.filter((value: unknown): value is string => typeof value === "string") : []);
      setAnalysisStage("ready");
      setProgress("Listo para revisar");
      toast.success("Análisis completado");
    } catch (error) {
      const code = await extractAnalysisErrorCode(error);
      setFailureCode(code ?? "analysis_failed");
      setProgress(analysisErrorMessage(code));
      setAnalysisStage("error");
      toast.error(analysisErrorMessage(code));
    } finally { submitLock.current = false; setBusy(false); }

  };

  return <div className="space-y-4 pb-8">
    <div><h1 className="text-2xl font-bold">Foto de presupuesto</h1><p className="text-sm text-muted-foreground">Carga de 1 a 5 fotos. El resultado permanecerá como borrador para revisión humana.</p></div>
    <div className="grid grid-cols-2 gap-3">
      <Button className="min-h-12" onClick={() => camera.current?.click()}><Camera className="mr-2 h-5 w-5" />Tomar foto</Button>
      <Button className="min-h-12" variant="outline" onClick={() => gallery.current?.click()}><Images className="mr-2 h-5 w-5" />Galería</Button>
      <input ref={camera} className="absolute h-px w-px opacity-0" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={(event) => void add(event.target.files)} />
      <input ref={gallery} className="absolute h-px w-px opacity-0" type="file" accept="image/*,.heic,.heif" multiple tabIndex={-1} aria-hidden="true" onChange={(event) => void add(event.target.files)} />
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {photos.map((photo, index) => <Card key={photo.id}>
        <CardContent className="p-3"><img src={photo.previewUrl} alt={`Presupuesto ${index + 1}`} className="aspect-[4/3] w-full rounded-lg object-cover" /><div className="mt-2 flex items-center justify-between"><span className="text-sm font-semibold">Foto {index + 1}</span><div className="flex gap-1"><Button size="icon" variant="ghost" className="min-h-11 min-w-11" disabled={index === 0 || busy || Boolean(estimateId)} onClick={() => move(index, -1)} aria-label="Mover arriba"><ArrowUp /></Button><Button size="icon" variant="ghost" className="min-h-11 min-w-11" disabled={index === photos.length - 1 || busy || Boolean(estimateId)} onClick={() => move(index, 1)} aria-label="Mover abajo"><ArrowDown /></Button><Button size="icon" variant="ghost" className="min-h-11 min-w-11 text-destructive" disabled={busy || Boolean(estimateId)} onClick={() => { URL.revokeObjectURL(photo.previewUrl); setPhotos((items) => items.filter((item) => item.id !== photo.id)); }} aria-label="Eliminar"><Trash2 /></Button></div></div></CardContent>
      </Card>)}
    </div>
    <Button className="min-h-12 w-full" disabled={busy || photos.length < 1} onClick={() => void analyze()}>{busy && <Loader2 className="mr-2 animate-spin" />}{busy ? progress : `Analizar ${photos.length ? `${photos.length} foto${photos.length > 1 ? "s" : ""}` : ""}`}</Button>
    {analysisStage !== "idle" && <div role="status" aria-label={progress} className={`rounded-lg p-3 text-sm ${failureCode ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
      {failureCode ? progress : <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4">{ANALYSIS_STEPS.map((step, index) => {
        const activeIndex = ANALYSIS_STEPS.findIndex((entry) => entry.stage === analysisStage);
        const complete = index < activeIndex || analysisStage === "ready";
        const active = step.stage === analysisStage;
        return <li key={step.stage} className={`flex items-center gap-2 ${complete || active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{complete ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-2 w-2 rounded-full bg-border" />}{step.label}</li>;
      })}</ol>}
    </div>}
    {failureCode && analysisErrorIsRetryable(failureCode) && <Button variant="outline" className="min-h-12 w-full" disabled={busy} onClick={() => void analyze()}>Reintentar análisis (conserva el borrador y las fotos)</Button>}
    {estimateId && analysisStage === "ready" && <EstimatePhotoReview estimateId={estimateId} uncertainties={uncertainties} extractionWarnings={extractionWarnings} onEstimateChange={setEstimateId} />}
  </div>;
}
