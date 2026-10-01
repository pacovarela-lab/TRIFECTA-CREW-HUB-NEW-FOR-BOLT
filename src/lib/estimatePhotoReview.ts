import { evaluateEstimateRisk, plannedCost, projectedMargin, projectedProfit, type EstimateItemType } from "@/lib/estimateFinancials";
import { extractionStatusLabel } from "@/lib/estimatePhotoI18n";

export type ReviewItem = {
  id: string;
  description_original: string | null;
  description_normalized: string | null;
  quantity: number | null;
  unit: string | null;
  client_price: number | null;
  planned_cost: number | null;
  item_type: EstimateItemType;
  confidence: number | null;
  extraction_status: "confirmed" | "inferred" | "uncertain" | "unreadable";
  source_text?: string | null;
  description_client_en?: string | null;
  human_confirmed_fields?: string[];
};

export type ReviewEstimate = { id: string; title: string; charge_amount: number | null; status: string; currency_code?: string | null; human_confirmed_fields?: string[]; internal_notes?: string | null; client_description_en?: string | null; project_id?: string | null };
export type ReviewQuestion = { ordinal: 1 | 2 | 3; category: "scope" | "hidden_cost" | "profitability"; question: string; reason: string };

export const normalizeEstimateCurrency = (value?: string | null) => /^[A-Z]{3}$/.test(value ?? "") ? value! : "USD";
export const formatEstimateMoney = (value: number, currencyCode?: string | null) => {
  const currency = normalizeEstimateCurrency(currencyCode);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: currency === "USD" ? "symbol" : "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};
const money = (value: number, currencyCode?: string | null) => formatEstimateMoney(value, currencyCode);
const percent = (value: number) => new Intl.NumberFormat("es-US", { style: "percent", maximumFractionDigits: 0 }).format(value);

export function reviewFinancials(estimate: ReviewEstimate, items: ReviewItem[]) {
  const cost = plannedCost(items.map((item) => ({ itemType: item.item_type, plannedCost: item.planned_cost })));
  const incompleteCosts = items.some((item) => item.planned_cost === null);
  const profit = incompleteCosts ? null : projectedProfit(estimate.charge_amount, cost);
  const margin = projectedMargin(estimate.charge_amount, profit);
  const risk = evaluateEstimateRisk({
    projectedMargin: margin,
    hasMajorMonetaryUncertainty: estimate.charge_amount === null || items.some((item) => item.extraction_status === "uncertain" && (item.client_price !== null || item.planned_cost !== null)),
    hasEssentialLabor: items.some((item) => item.item_type === "labor"),
    hasEssentialMaterials: items.some((item) => item.item_type === "material"),
    hasContingency: items.some((item) => /contingenc/i.test(`${item.description_normalized ?? ""} ${item.description_original ?? ""}`)),
    hasRelevantScopeWarnings: items.some((item) => item.extraction_status === "uncertain" || item.extraction_status === "unreadable"),
  });
  return { cost, profit, margin, risk, incompleteCosts };
}

export function buildEstimateReviewQuestions(estimate: ReviewEstimate, items: ReviewItem[]): ReviewQuestion[] {
  const unclear = items.find((item) => item.extraction_status === "unreadable")
    ?? items.find((item) => item.extraction_status === "uncertain")
    ?? items.find((item) => item.quantity === null || !item.unit);
  const scope = unclear
    ? `¿Puedes confirmar el alcance de “${unclear.description_original || unclear.description_normalized || "esta partida"}”?`
    : `¿Confirmas que “${estimate.title}” describe todo el trabajo incluido?`;

  const missingCost = items.find((item) => item.planned_cost === null);
  const hasLabor = items.some((item) => item.item_type === "labor");
  const hasMaterials = items.some((item) => item.item_type === "material");
  const costEvidence = items.find((item) => /demoli|prepar|retir|desech|debris|disposal|transport|permiso|protecci|contingenc/i.test(`${item.description_original ?? ""} ${item.description_normalized ?? ""} ${item.source_text ?? ""}`));
  const hidden = missingCost
    ? `¿Cuál es el costo planeado de “${missingCost.description_normalized || missingCost.description_original || "esta partida"}”?`
    : !hasLabor
      ? "¿Confirmas que este trabajo no requiere costo de mano de obra?"
      : !hasMaterials
        ? "¿Confirmas que este trabajo no requiere costo de materiales?"
        : costEvidence
          ? `¿Confirmas que el costo planeado de “${costEvidence.description_normalized || costEvidence.description_original}” está completo?`
          : "¿Confirmas que el costo planeado incluye todos los costos de este trabajo?";

  const financials = reviewFinancials(estimate, items);
  const profitability = estimate.charge_amount === null
    ? "¿Cuál es el precio total que se cobrará al cliente?"
    : financials.incompleteCosts
      ? `El precio al cliente es ${money(estimate.charge_amount, estimate.currency_code)}. ¿Confirmas los costos faltantes antes de revisar la rentabilidad?`
      : financials.margin === null
        ? "No se puede calcular el margen con un precio de cero. ¿Quieres mantener este precio?"
        : `Con estos costos, el margen proyectado es ${percent(financials.margin)}. ¿Quieres mantener este precio?`;

  return [
    { ordinal: 1, category: "scope", question: scope, reason: unclear ? "Alcance con información incierta o incompleta." : "Confirmación del alcance detectado." },
    { ordinal: 2, category: "hidden_cost", question: hidden, reason: missingCost || !hasLabor || !hasMaterials ? "Costo esencial incompleto." : "Confirmación de costos potencialmente omitidos." },
    { ordinal: 3, category: "profitability", question: profitability, reason: financials.risk.reasons[0] ?? "Confirmación de rentabilidad proyectada." },
  ];
}

/** Espejo cliente del warning del contrato: dos totales globales distintos exigen confirmación humana. */
export const CHARGE_CONFLICT_WARNING = "conflicting_total_candidates";
export const hasChargeAmountConflict = (warnings: readonly string[] | null | undefined): boolean =>
  (warnings ?? []).some((warning) => warning.startsWith(`${CHARGE_CONFLICT_WARNING}:`));
/** Aprobación bloqueada mientras el total en conflicto siga sin confirmación humana explícita. */
export const chargeConfirmationPending = (estimate: ReviewEstimate, warnings: readonly string[] | null | undefined): boolean =>
  hasChargeAmountConflict(warnings) && !(estimate.human_confirmed_fields ?? []).includes("charge_amount");

export const humanStatus = (status: ReviewItem["extraction_status"]) => extractionStatusLabel(status);

export function humanReviewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("confirmed_field_requires_value")) return "Falta completar el campo que intentaste confirmar.";
  if (message.includes("invalid_review_answer") || message.includes("estimate_requires_exactly_three_answers")) return "Responde las tres preguntas antes de guardar la revisión.";
  if (message.includes("invalid_review_item")) return "Revisa los valores de las partidas; hay un campo incompleto o inválido.";
  if (message.includes("trial_expired")) return "El periodo de prueba no permite guardar cambios.";
  if (message.includes("estimate_review_forbidden")) return "No tienes permiso para modificar este presupuesto o ya fue aprobado.";
  return "No pudimos guardar la revisión.";
}
