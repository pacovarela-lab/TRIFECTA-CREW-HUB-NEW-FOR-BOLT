import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useClients, useDivisions } from "@/hooks/useTrifectaData";
import { buildClientEstimatePreview, buildEstimateRecommendations } from "@/lib/estimatePhotoApproval";
import { chargeConfirmationPending, formatEstimateMoney } from "@/lib/estimatePhotoReview";
import { recommendationCategoryLabel } from "@/lib/estimatePhotoI18n";
import type { ReviewEstimate, ReviewItem } from "@/lib/estimatePhotoReview";
import { approvalErrorMessage, buildEstimateConfidenceSummary, type ConfidenceQuestion } from "@/lib/estimatePhotoConfidence";

// Generated types intentionally lag local migrations until the schema is deployed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function EstimatePhotoApproval({ estimate, items, questions = [], onChanged, onRevisionCreated, extractionWarnings = [] }: { estimate: ReviewEstimate & { client_description_en?: string | null; project_id?: string | null }; items: ReviewItem[]; questions?: ConfidenceQuestion[]; onChanged: () => Promise<void>; onRevisionCreated?: (estimateId: string) => void; extractionWarnings?: string[] }) {
  const chargePending = chargeConfirmationPending(estimate, extractionWarnings);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [projectCreationKey] = useState(() => crypto.randomUUID());
  const { data: clients = [] } = useClients();
  const { data: divisions = [] } = useDivisions();
  const recommendations = useMemo(() => buildEstimateRecommendations(estimate, items), [estimate, items]);
  const approved = estimate.status === "approved";
  const preview = approved ? buildClientEstimatePreview(estimate, items) : null;
  const confidence = useMemo(() => buildEstimateConfidenceSummary(estimate, items, questions, extractionWarnings), [estimate, items, questions, extractionWarnings]);

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    const result = await db.rpc("approve_photo_estimate", { _estimate_id: estimate.id });
    setBusy(false);
    if (result.error) return toast.error(approvalErrorMessage(result.error));
    toast.success("Presupuesto aprobado");
    await onChanged();
  };

  const createWork = async () => {
    if (busy || !clientId || !divisionId) return;
    setBusy(true);
    const result = await db.rpc("create_work_from_estimate", { _estimate_id: estimate.id, _project_creation_key: projectCreationKey, _client_id: clientId, _division_id: divisionId, _address: null, _business_unit_id: null, _project_type: "other" });
    setBusy(false);
    if (result.error) return toast.error(result.error.message ?? "No pudimos crear el trabajo.");
    toast.success("Trabajo creado");
    await onChanged();
  };

  const createRevision = async () => {
    if (busy) return;
    setBusy(true);
    const result = await db.rpc("create_estimate_revision", { _estimate_id: estimate.id });
    setBusy(false);
    if (result.error) return toast.error(result.error.message ?? "No pudimos crear la revisión.");
    toast.success("Nueva revisión creada como borrador");
    onRevisionCreated?.(result.data as string);
  };

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Recomendaciones internas</CardTitle></CardHeader><CardContent className="space-y-3">
      {recommendations.length === 0 && <p className="text-sm text-muted-foreground">No detectamos recomendaciones pendientes.</p>}
      {recommendations.map((entry) => <div key={entry.category} className="rounded-lg border p-3"><Badge variant="outline">{recommendationCategoryLabel(entry.category)}</Badge><p className="mt-2 font-semibold">{entry.title}</p><p className="text-sm">{entry.explanation}</p><p className="mt-1 text-sm text-muted-foreground">Acción sugerida: {entry.suggestedAction}</p></div>)}
      <p className="text-xs text-muted-foreground">Estas sugerencias nunca cambian partidas, precio ni costos automáticamente.</p>
    </CardContent></Card>

    {!approved && <Card><CardHeader className="pb-3"><CardTitle>Revisión del presupuesto</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-md bg-muted p-2"><strong className="block text-base">{confidence.confirmedCount}</strong>confirmados</div><div className="rounded-md bg-muted p-2"><strong className="block text-base">{confidence.reviewCount}</strong>por revisar</div><div className="rounded-md bg-muted p-2"><strong className="block text-base">{confidence.conflictCount}</strong>conflictos</div></div>
      <p className={`flex items-center gap-2 text-sm font-semibold ${confidence.ready ? "text-foreground" : "text-destructive"}`}>{confidence.ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{confidence.ready ? "Todo listo para aprobar" : confidence.blockers[0]}</p>
      <ul className="space-y-1 text-sm">{confidence.lines.slice(0, 5).map((line) => <li key={line} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{line}</li>)}</ul>
      {confidence.blockers.length > 1 && <details className="text-sm"><summary className="flex cursor-pointer items-center gap-1 font-medium">Ver razones pendientes <ChevronDown className="h-4 w-4" /></summary><ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">{confidence.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></details>}
      <p className="text-sm">Al aprobar, esta versión y su evidencia quedarán inmutables. Para editar después deberás crear una revisión.</p><Button className="min-h-12 w-full" disabled={busy || !confidence.ready || chargePending || estimate.status !== "reviewed"} onClick={() => void approve()}>{busy && <Loader2 className="mr-2 animate-spin" />}Aprobar presupuesto</Button>
    </CardContent></Card>}

    {approved && preview && <>
      <Card className="print:shadow-none"><CardHeader><div className="flex items-center justify-between"><CardTitle>Client Estimate Preview</CardTitle><Badge><CheckCircle2 className="mr-1 h-3 w-3" />Aprobado</Badge></div></CardHeader><CardContent className="space-y-4"><div><h3 className="text-xl font-bold">{preview.title}</h3><p className="text-sm text-muted-foreground">{preview.scope}</p></div>{preview.items.map((item, index) => <div key={`${item.description}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 border-b pb-2 text-sm"><span>{item.description} · {item.quantity} {item.unit ?? ""}</span><span>{formatEstimateMoney(item.total, estimate.currency_code)}</span></div>)}<div className="flex justify-between font-bold"><span>Total</span><span>{formatEstimateMoney(preview.total, estimate.currency_code)}</span></div></CardContent></Card>
      {!estimate.project_id && <Card><CardHeader><CardTitle>Crear Trabajo</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Selecciona un cliente existente. Nunca enlazamos clientes automáticamente desde texto observado.</p><div><Label>Cliente confirmado</Label><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger><SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div><div><Label>División</Label><Select value={divisionId} onValueChange={setDivisionId}><SelectTrigger><SelectValue placeholder="Seleccionar división" /></SelectTrigger><SelectContent>{divisions.map((division) => <SelectItem key={division.id} value={division.id}>{division.name}</SelectItem>)}</SelectContent></Select></div><Button className="min-h-12 w-full" disabled={busy || !clientId || !divisionId} onClick={() => void createWork()}>{busy && <Loader2 className="mr-2 animate-spin" />}Crear Trabajo</Button></CardContent></Card>}
      {estimate.project_id && <p className="rounded-lg bg-muted p-3 text-sm">Trabajo creado. Los costos reales permanecen separados.</p>}
      <Button variant="outline" className="min-h-12 w-full" disabled={busy} onClick={() => void createRevision()}>Crear nueva revisión para editar</Button>
    </>}
  </div>;
}
