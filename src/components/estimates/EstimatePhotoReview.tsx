import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Lightbulb, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { buildEstimateReviewQuestions, formatEstimateMoney, humanReviewErrorMessage, humanStatus, normalizeEstimateCurrency, reviewFinancials, type ReviewEstimate, type ReviewItem } from "@/lib/estimatePhotoReview";
import { EstimatePhotoApproval } from "@/components/estimates/EstimatePhotoApproval";
import { estimateStatusLabel, itemTypeLabel, formatObservedNotes } from "@/lib/estimatePhotoI18n";
import { applyReviewOrder, buildEstimateReviewPriorities, countReviewPriorities, getNextReviewIssue, sortReviewItemsByPriority, type ReviewPriorityIssue } from "@/lib/estimatePhotoReviewPriority";
import { plannedCostAbsentInDocument } from "@/lib/estimatePhotoConfidence";
import { learnedSuggestionHeadline, buildLearnedSuggestion, buildManualLearnedCorrection, collectLearnableCorrections, learnedSuggestionTrace, saveReviewThenLearn, type LearnableField, type LearnedBaseline, type LearnedSuggestion, type LearnedTermRow } from "@/lib/estimateLearnedTerms";

type QuestionRow = { id: string; ordinal: number; category: "scope" | "hidden_cost" | "profitability"; question: string; reason: string | null; answer: string | null };
// Foundation is newer than checked-in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Aviso discreto: una corrección previa coincide con esta lectura. Nunca se aplica sola. */
function LearnedSuggestionHint({ suggestion, disabled, onUse, onKeep }: { suggestion: LearnedSuggestion; disabled?: boolean; onUse: () => void; onKeep: () => void }) {
  return <div className="rounded-md border border-dashed bg-muted/40 p-2 text-xs">
    <p className="flex items-center gap-1 font-medium"><Lightbulb className="h-3.5 w-3.5" />{learnedSuggestionHeadline(suggestion)}</p>
    <p className="mt-1 text-muted-foreground">{learnedSuggestionTrace(suggestion)}</p>
    {suggestion.conflict
      ? <p className="mt-1">Hay más de una corrección previa para esta lectura ({suggestion.options.join(" · ")}). Escribe tú la versión correcta.</p>
      : <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onUse}>Usar sugerencia</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onKeep}>Mantener lectura original</Button>
      </div>}
  </div>;
}


export function EstimatePhotoReview({ estimateId, uncertainties = [], extractionWarnings = [], onEstimateChange }: { estimateId: string; uncertainties?: string[]; extractionWarnings?: string[]; onEstimateChange?: (estimateId: string) => void }) {
  const [estimate, setEstimate] = useState<ReviewEstimate | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [visualItemOrder, setVisualItemOrder] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [learnedTerms, setLearnedTerms] = useState<LearnedTermRow[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  const [manualLearned, setManualLearned] = useState<string[]>([]);
  const [learningField, setLearningField] = useState<string | null>(null);
  // Lectura AI de esta sesión: base para detectar correcciones humanas reales al guardar.
  const baselineRef = useRef<LearnedBaseline>({ title: null, items: {} });
  const extractionWarningsRef = useRef(extractionWarnings);
  const uncertaintiesRef = useRef(uncertainties);
  extractionWarningsRef.current = extractionWarnings;
  uncertaintiesRef.current = uncertainties;
  const load = useCallback(async () => {
    setLoading(true);
    const fetched = await db.from("estimates").select("id,title,charge_amount,status,currency_code,human_confirmed_fields,internal_notes,client_description_en,project_id,estimate_items(id,description_original,description_normalized,description_client_en,quantity,unit,client_price,planned_cost,item_type,confidence,extraction_status,source_text,human_confirmed_fields)").eq("id", estimateId).single();
    if (fetched.error) { setLoading(false); toast.error("No pudimos cargar el borrador."); return; }
    const nextEstimate = fetched.data as ReviewEstimate & { estimate_items: ReviewItem[] };
    const nextItems = [...(nextEstimate.estimate_items ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    let rows: QuestionRow[] = [];
    if (nextEstimate.status === "needs_answers" || nextEstimate.status === "reviewed") {
      const generated = buildEstimateReviewQuestions(nextEstimate, nextItems);
      const initialized = await db.rpc("initialize_estimate_review_questions", { _estimate_id: estimateId, _questions: generated });
      if (initialized.error) { setLoading(false); toast.error("No pudimos preparar las preguntas."); return; }
      rows = (initialized.data ?? []) as QuestionRow[];
    } else {
      const existing = await db.from("estimate_questions").select("id,ordinal,category,question,reason,answer").eq("estimate_id", estimateId).order("ordinal");
      if (existing.error) { setLoading(false); toast.error("No pudimos cargar las preguntas."); return; }
      rows = (existing.data ?? []) as QuestionRow[];
    }
    const loadedEstimate = { id: nextEstimate.id, title: nextEstimate.title, charge_amount: nextEstimate.charge_amount, status: nextEstimate.status, currency_code: normalizeEstimateCurrency(nextEstimate.currency_code), human_confirmed_fields: nextEstimate.human_confirmed_fields ?? [], internal_notes: nextEstimate.internal_notes, client_description_en: nextEstimate.client_description_en, project_id: nextEstimate.project_id } as ReviewEstimate;
    setEstimate({ ...loadedEstimate });
    setItems(nextItems);
    const loadedIssues = buildEstimateReviewPriorities(loadedEstimate, nextItems, rows, extractionWarningsRef.current, uncertaintiesRef.current);
    setVisualItemOrder(sortReviewItemsByPriority(nextItems, loadedIssues).map((item) => item.id));
    setQuestions(rows);
    baselineRef.current = { title: nextEstimate.title, items: Object.fromEntries(nextItems.map((item) => [item.id, { description: item.description_normalized, unit: item.unit }])) };
    const terms = await db.from("estimate_learned_terms").select("id,observed_term,normalized_term,term_type,confirmations,is_active").eq("is_active", true).limit(500);
    setLearnedTerms(((terms.data ?? []) as LearnedTermRow[]));
    setDismissedSuggestions([]);
    setManualLearned([]);
    setAnswers(Object.fromEntries(rows.map((question) => [question.id, question.answer ?? ""])));
    setLoading(false);
  }, [estimateId]);
  useEffect(() => { void load(); }, [load]);

  const suggestionKey = (field: LearnableField, targetId: string) => `${field}:${targetId}`;
  const itemSuggestions = useMemo(() => new Map(items.flatMap((item) => [
    ["description" as LearnableField, item.description_normalized] as const,
    ["unit" as LearnableField, item.unit] as const,
  ].map(([field, value]) => {
    const suggestion = buildLearnedSuggestion(value, field, item.id, learnedTerms);
    return suggestion ? [suggestionKey(field, item.id), suggestion] as const : null;
  }).filter((entry): entry is readonly [string, LearnedSuggestion] => entry !== null))), [items, learnedTerms]);
  const visibleSuggestion = (field: LearnableField, targetId: string, suggestion: LearnedSuggestion | null | undefined) =>
    suggestion && !dismissedSuggestions.includes(suggestionKey(field, targetId)) ? suggestion : null;
  const dismissSuggestion = (field: LearnableField, targetId: string) =>
    setDismissedSuggestions((current) => [...current, suggestionKey(field, targetId)]);
  // Aplicar una sugerencia NUNCA confirma el campo: sigue exigiendo "Confirmar".
  const applyLearnedSuggestion = (suggestion: LearnedSuggestion) => {
    if (!suggestion.suggested) return;
    if (suggestion.field === "description") editItem(suggestion.targetId, { description_normalized: suggestion.suggested }, "description");
    else editItem(suggestion.targetId, { unit: suggestion.suggested }, "unit");
    dismissSuggestion(suggestion.field, suggestion.targetId);
  };

  const refreshLearnedTerms = async () => {
    const terms = await db.from("estimate_learned_terms").select("id,observed_term,normalized_term,term_type,confirmations,is_active").eq("is_active", true).limit(500);
    setLearnedTerms(((terms.data ?? []) as LearnedTermRow[]));
  };
  /** Aprendizaje manual: guarda la corrección sin exigir "Confirmar" y nunca marca el campo como confirmado. */
  const learnCorrection = async (field: LearnableField, item: ReviewItem) => {
    const base = baselineRef.current.items[item.id];
    const corrected = field === "description" ? item.description_normalized : item.unit;
    const term = buildManualLearnedCorrection(base ? (field === "description" ? base.description : base.unit) : null, corrected, field, item.id);
    if (!term) { toast.error("No hay una corrección de texto que aprender en este campo."); return; }
    setLearningField(suggestionKey(field, item.id));
    try {
      const saved = await db.rpc("record_estimate_learned_terms", { _estimate_id: estimateId, _terms: [term] });
      if (saved.error) { toast.error("No pudimos guardar la corrección aprendida."); return; }
      setManualLearned((current) => [...current, suggestionKey(field, item.id)]);
      await refreshLearnedTerms();
      toast.success("Corrección aprendida");
    } catch { toast.error("No pudimos guardar la corrección aprendida."); }
    finally { setLearningField(null); }
  };
  const learnableCorrection = (field: LearnableField, item: ReviewItem) => {
    const base = baselineRef.current.items[item.id];
    return buildManualLearnedCorrection(base ? (field === "description" ? base.description : base.unit) : null, field === "description" ? item.description_normalized : item.unit, field, item.id) !== null;
  };
  const LearnButton = ({ field, item }: { field: LearnableField; item: ReviewItem }) => manualLearned.includes(suggestionKey(field, item.id))
    ? <p className="text-xs text-muted-foreground">Corrección aprendida para futuras coincidencias.</p>
    : learnableCorrection(field, item)
      ? <Button type="button" size="sm" variant="ghost" className="self-start" disabled={immutable || learningField === suggestionKey(field, item.id)} onClick={() => void learnCorrection(field, item)}><Lightbulb className="mr-1 h-3.5 w-3.5" />Aprender esta corrección</Button>
      : null;

  const financials = useMemo(() => estimate ? reviewFinancials(estimate, items) : null, [estimate, items]);
  const priorityIssues = useMemo(() => estimate ? buildEstimateReviewPriorities(estimate, items, questions.map((question) => ({ ...question, answer: answers[question.id] ?? question.answer })), extractionWarnings, uncertainties) : [], [estimate, items, questions, answers, extractionWarnings, uncertainties]);
  const priorityCounts = useMemo(() => countReviewPriorities(priorityIssues), [priorityIssues]);
  // El orden visual se congela: reordenar mientras se escribe movería el input enfocado y cortaría la captura.
  const visualItems = useMemo(() => applyReviewOrder(items, visualItemOrder), [items, visualItemOrder]);
  const focusIssue = (issue: ReviewPriorityIssue | null) => {
    if (!issue) return;
    setActiveIssueId(issue.id);
    requestAnimationFrame(() => document.getElementById(issue.targetId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  useEffect(() => {
    if (activeIssueId && !priorityIssues.some((issue) => issue.id === activeIssueId)) setActiveIssueId(null);
  }, [activeIssueId, priorityIssues]);
  const updateItem = (id: string, patch: Partial<ReviewItem>, confirmedField?: string) => setItems((current) => current.map((item) => item.id === id ? {
    ...item, ...patch,
    human_confirmed_fields: confirmedField ? Array.from(new Set([...(item.human_confirmed_fields ?? []), confirmedField])) : item.human_confirmed_fields,
  } : item));
  // Editing must NOT confirm: it clears any prior confirmation for that field so the user re-confirms explicitly.
  const editItem = (id: string, patch: Partial<ReviewItem>, field: string) => setItems((current) => current.map((item) => item.id === id ? {
    ...item, ...patch,
    human_confirmed_fields: (item.human_confirmed_fields ?? []).filter((confirmed) => confirmed !== field),
  } : item));
  const confirmItemField = (item: ReviewItem, field: string, value: unknown) => {
    if (value === null || value === undefined || String(value).trim() === "") { toast.error(`Falta completar ${field === "planned_cost" ? "el costo planeado" : "este campo"}.`); return; }
    updateItem(item.id, {}, field);
  };
  const updateEstimateField = (patch: Partial<ReviewEstimate>, field?: string) => setEstimate((current) => current ? ({ ...current, ...patch, human_confirmed_fields: field ? Array.from(new Set([...(current.human_confirmed_fields ?? []), field])) : (current.human_confirmed_fields ?? []) }) : current);
  // Editar NUNCA confirma: quita la confirmación previa de ese campo para exigir "Confirmar" otra vez.
  const editEstimateField = (patch: Partial<ReviewEstimate>, field: string) => setEstimate((current) => current ? ({ ...current, ...patch, human_confirmed_fields: (current.human_confirmed_fields ?? []).filter((confirmed) => confirmed !== field) }) : current);
  const confirmEstimateField = (field: string, value: unknown) => {
    if (value === null || value === undefined || String(value).trim() === "") { toast.error("Falta completar este campo antes de confirmarlo."); return; }
    updateEstimateField({}, field);
  };
  const save = async () => {
    if (!estimate || saving) return;
    setSaving(true);
    try {
      const generated = buildEstimateReviewQuestions(estimate, items);
      const reviewPayload = {
        _estimate_id: estimate.id,
        _title: estimate.title,
        _charge_amount: estimate.charge_amount,
        _currency_code: normalizeEstimateCurrency(estimate.currency_code),
        _estimate_confirmed_fields: estimate.human_confirmed_fields ?? [],
        _items: items.map((item) => ({ id: item.id, description: item.description_normalized, quantity: String(item.quantity ?? ""), unit: item.unit ?? "", client_price: String(item.client_price ?? ""), planned_cost: item.planned_cost === null ? null : String(item.planned_cost), item_type: item.item_type, confirmed_fields: item.human_confirmed_fields ?? [] })),
        _questions: generated,
        _answers: questions.map((question) => ({ id: question.id, answer: answers[question.id]?.trim() ?? question.answer ?? "" })),
      };
      // El aprendizaje es secundario: si falla, la revisión humana permanece guardada.
      const learnable = collectLearnableCorrections(baselineRef.current, { id: estimate.id, title: estimate.title, human_confirmed_fields: estimate.human_confirmed_fields ?? [], items });
      const { learningFailed } = await saveReviewThenLearn(
        () => db.rpc("save_estimate_human_review_v11", reviewPayload),
        learnable.length > 0 ? () => db.rpc("record_estimate_learned_terms", { _estimate_id: estimate.id, _terms: learnable }) : null,
      );
      toast.success(learningFailed ? "Revisión guardada; no se pudo actualizar el aprendizaje" : "Revisión guardada");
      await load();
    } catch (error) { toast.error(humanReviewErrorMessage(error)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-40 items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!estimate || !financials) return null;
  const pendingAnalysis = estimate.status === "draft";
  const immutable = estimate.status === "approved" || pendingAnalysis;
  return <div className="space-y-4 pb-24">
    <div className="space-y-2"><div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Esto entendí</h2><Badge variant="outline">{estimateStatusLabel(estimate.status)}</Badge></div><p className="text-sm text-muted-foreground">Revisa y corrige el borrador antes de aprobarlo.</p></div>
    {pendingAnalysis && <Card><CardContent className="p-4"><p className="text-sm font-medium">Nueva revisión creada.</p><p className="text-sm text-muted-foreground">Pulsa “Analizar” arriba para volver a leer las fotos de esta revisión. Después podrás corregir las partidas y responder las tres preguntas.</p></CardContent></Card>}
    <Card id="review-summary" className="border-primary/30"><CardHeader className="pb-3"><CardTitle>{priorityIssues.length === 0 ? "Sin asuntos críticos" : "Revisa primero"}</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-md bg-destructive/10 p-2"><strong className="block text-base">{priorityCounts.high}</strong>alta</div><div className="rounded-md bg-muted p-2"><strong className="block text-base">{priorityCounts.medium}</strong>media</div><div className="rounded-md bg-muted p-2"><strong className="block text-base">{priorityCounts.low}</strong>baja</div></div>
      {priorityIssues.length > 0 && <p className="text-sm font-semibold">{priorityCounts.high === 0 ? "Sin asuntos críticos" : `${priorityCounts.high} ${priorityCounts.high === 1 ? "asunto de alta prioridad" : "asuntos de alta prioridad"}`}</p>}
      {priorityIssues.length > 0 && <ul className="space-y-1">{priorityIssues.slice(0, 3).map((issue) => <li key={issue.id}><button type="button" className={`flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-muted ${activeIssueId === issue.id ? "bg-muted font-medium" : ""}`} onClick={() => focusIssue(issue)}><span>{issue.label}</span><ArrowRight className="h-4 w-4 shrink-0" /></button></li>)}</ul>}
      <Button type="button" variant="outline" className="min-h-11 w-full" disabled={immutable || priorityIssues.length === 0} onClick={() => focusIssue(getNextReviewIssue(priorityIssues))}>Revisar siguiente</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Precio y costos proyectados</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">
      <div id="review-charge"><Label>Precio al cliente · {normalizeEstimateCurrency(estimate.currency_code)}</Label><div className="flex gap-2"><Input disabled={immutable} inputMode="decimal" value={estimate.charge_amount ?? ""} onChange={(event) => editEstimateField({ charge_amount: event.target.value === "" ? null : Number(event.target.value) }, "charge_amount")} /><Button type="button" variant="outline" disabled={immutable || estimate.charge_amount === null || estimate.human_confirmed_fields?.includes("charge_amount")} onClick={() => confirmEstimateField("charge_amount", estimate.charge_amount)}>Confirmar</Button></div>{estimate.charge_amount !== null && <p className="mt-1 text-sm font-medium">{formatEstimateMoney(estimate.charge_amount, estimate.currency_code)}</p>}</div>
      <div><p className="text-xs text-muted-foreground">Costo planeado · ESTIMADO</p><p className="font-semibold">{financials.incompleteCosts ? "Sin confirmar" : formatEstimateMoney(financials.cost, estimate.currency_code)}</p></div>
      <div><p className="text-xs text-muted-foreground">Ganancia · PROYECTADA</p><p className="font-semibold">{financials.profit === null ? "Sin confirmar" : formatEstimateMoney(financials.profit, estimate.currency_code)}</p></div>
      <div><p className="text-xs text-muted-foreground">Margen · PROYECTADO</p><p className="font-semibold">{financials.margin === null ? "Sin calcular" : `${Math.round(financials.margin * 100)}%`}</p></div>
      <div className="col-span-2 rounded-lg bg-muted p-3"><p className="font-medium">{financials.risk.level === "high" ? "Atención" : financials.risk.level === "review" ? "Revisar" : "Riesgo bajo"}</p><p className="text-sm">{financials.risk.reasons[0] ?? "No detectamos señales relevantes."}</p><p className="mt-1 text-xs text-muted-foreground">{financials.risk.disclosure}</p></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Partidas</CardTitle></CardHeader><CardContent className="space-y-3">{visualItems.map((item) => { const itemPriority = priorityIssues.find((issue) => issue.itemId === item.id)?.priority; return <Collapsible key={item.id} defaultOpen={item.extraction_status !== "confirmed"} className="rounded-lg border p-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left"><div><p className="font-medium">{item.description_normalized || item.description_original || "Partida sin descripción"}</p><p className="text-sm text-muted-foreground">{item.client_price === null ? "Precio sin confirmar" : formatEstimateMoney(item.client_price, estimate.currency_code)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{humanStatus(item.extraction_status)}</Badge><ChevronDown className="h-4 w-4" /></div></CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
      {itemPriority && <Badge variant={itemPriority === "high" ? "destructive" : "secondary"}>Prioridad {itemPriority === "high" ? "alta" : itemPriority === "medium" ? "media" : "baja"}</Badge>}
      <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Original: {item.description_original || item.source_text || "No legible"}</p></div>
      <div id={`review-item-${item.id}-description`} className="flex gap-2"><Input aria-label="Descripción" disabled={immutable} value={item.description_normalized ?? ""} onChange={(event) => editItem(item.id, { description_normalized: event.target.value }, "description")} /><Button type="button" variant="outline" disabled={immutable || item.human_confirmed_fields?.includes("description")} onClick={() => confirmItemField(item, "description", item.description_normalized)}>Confirmar</Button></div>
      <LearnButton field="description" item={item} />
      {(() => { const suggestion = visibleSuggestion("description", item.id, itemSuggestions.get(suggestionKey("description", item.id))); return suggestion ? <LearnedSuggestionHint suggestion={suggestion} disabled={immutable} onUse={() => applyLearnedSuggestion(suggestion)} onKeep={() => dismissSuggestion("description", item.id)} /> : null; })()}
      <div className="grid grid-cols-2 gap-2"><div id={`review-item-${item.id}-quantity`} className="flex gap-1"><Input aria-label="Cantidad" disabled={immutable} inputMode="decimal" value={item.quantity ?? ""} onChange={(event) => editItem(item.id, { quantity: event.target.value === "" ? null : Number(event.target.value) }, "quantity")} /><Button type="button" size="sm" variant="outline" disabled={immutable || item.human_confirmed_fields?.includes("quantity")} onClick={() => confirmItemField(item, "quantity", item.quantity)}>Confirmar</Button></div><div id={`review-item-${item.id}-unit`} className="flex gap-1"><Input aria-label="Unidad" disabled={immutable} value={item.unit ?? ""} onChange={(event) => editItem(item.id, { unit: event.target.value }, "unit")} /><Button type="button" size="sm" variant="outline" disabled={immutable || item.human_confirmed_fields?.includes("unit")} onClick={() => confirmItemField(item, "unit", item.unit)}>Confirmar</Button></div></div>
      <LearnButton field="unit" item={item} />
      {(() => { const suggestion = visibleSuggestion("unit", item.id, itemSuggestions.get(suggestionKey("unit", item.id))); return suggestion ? <LearnedSuggestionHint suggestion={suggestion} disabled={immutable} onUse={() => applyLearnedSuggestion(suggestion)} onKeep={() => dismissSuggestion("unit", item.id)} /> : null; })()}
      <Select disabled={immutable} value={item.item_type} onValueChange={(value: ReviewItem["item_type"]) => updateItem(item.id, { item_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["scope","material","labor","other"] as const).map((value) => <SelectItem key={value} value={value}>{itemTypeLabel(value)}</SelectItem>)}</SelectContent></Select>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div id={`review-item-${item.id}-client-price`}><Label>Precio cliente · {normalizeEstimateCurrency(estimate.currency_code)}</Label><div className="flex gap-1"><Input disabled={immutable} inputMode="decimal" value={item.client_price ?? ""} onChange={(event) => editItem(item.id, { client_price: event.target.value === "" ? null : Number(event.target.value) }, "client_price")} /><Button type="button" size="sm" variant="outline" disabled={immutable || item.human_confirmed_fields?.includes("client_price")} onClick={() => confirmItemField(item, "client_price", item.client_price)}>Confirmar</Button></div></div><div id={`review-item-${item.id}-planned-cost`}><Label>Costo planeado · {normalizeEstimateCurrency(estimate.currency_code)}</Label><div className="flex gap-1"><Input disabled={immutable} inputMode="decimal" value={item.planned_cost ?? ""} onChange={(event) => editItem(item.id, { planned_cost: event.target.value === "" ? null : Number(event.target.value) }, "planned_cost")} /><Button type="button" size="sm" variant="outline" disabled={immutable || item.human_confirmed_fields?.includes("planned_cost")} onClick={() => confirmItemField(item, "planned_cost", item.planned_cost)}>Confirmar</Button></div>{plannedCostAbsentInDocument(item) && <p className="mt-1 text-xs text-muted-foreground">Este costo no aparece en la foto. Escribe tu costo interno.</p>}</div></div>
      </CollapsibleContent>
    </Collapsible>; })}</CardContent></Card>
    <Card id="review-title"><CardHeader><CardTitle>Trabajo</CardTitle></CardHeader><CardContent className="space-y-2"><Label htmlFor="estimate-title">Título o descripción</Label><div className="flex gap-2"><Input id="estimate-title" disabled={immutable} value={estimate.title} onChange={(event) => editEstimateField({ title: event.target.value }, "title")} /><Button type="button" variant="outline" disabled={immutable || estimate.human_confirmed_fields?.includes("title")} onClick={() => confirmEstimateField("title", estimate.title)}>Confirmar</Button></div>{estimate.internal_notes && <div className="rounded-lg bg-muted p-3"><p className="text-xs font-medium">Cliente, dirección y notas observadas</p><p className="whitespace-pre-wrap text-sm">{formatObservedNotes(estimate.internal_notes)}</p></div>}</CardContent></Card>
    <Card id="review-questions"><CardHeader><CardTitle>Tres preguntas antes de continuar</CardTitle></CardHeader><CardContent className="space-y-4">{questions.map((question) => <div id={`review-question-${question.id}`} key={question.id} className="space-y-2"><Label htmlFor={question.id}>{question.ordinal}. {question.question}</Label><Input id={question.id} disabled={immutable} value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Tu respuesta" /></div>)}</CardContent></Card>
    {uncertainties.length > 0 && <Card id="review-observations"><CardHeader><CardTitle>Por confirmar</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{uncertainties.slice(0, 10).map((uncertainty) => <li key={uncertainty}>{uncertainty}</li>)}</ul></CardContent></Card>}
    {!immutable && <div id="review-save" className="sticky bottom-3"><Button className="min-h-12 w-full shadow-lg" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}Guardar revisión</Button></div>}
    {(estimate.status === "reviewed" || estimate.status === "approved") && <EstimatePhotoApproval estimate={estimate} items={items} questions={questions} extractionWarnings={extractionWarnings} onChanged={load} onRevisionCreated={onEstimateChange} />}
  </div>;
}
