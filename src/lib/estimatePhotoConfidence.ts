import { chargeConfirmationPending, type ReviewEstimate, type ReviewItem } from "@/lib/estimatePhotoReview";

export type ConfidenceQuestion = {
  id?: string;
  category?: "scope" | "hidden_cost" | "profitability";
  answer: string | null;
};
export type ConfidenceReviewIssue = {
  code: string;
  id: string;
  blocking: boolean;
  itemId?: string;
  field?: "planned_cost" | "client_price" | "description" | "quantity" | "unit" | "charge_amount" | "title";
  questionId?: string;
  questionCategory?: ConfidenceQuestion["category"];
};
export type EstimateConfidenceSummary = {
  ready: boolean;
  confirmedCount: number;
  reviewCount: number;
  conflictCount: number;
  answeredQuestions: number;
  lines: string[];
  blockers: string[];
  reviewIssues: ConfidenceReviewIssue[];
};

const reviewFields = ["planned_cost", "client_price", "description", "quantity", "unit"] as const;
export const isFieldHumanConfirmed = (fields: readonly string[] | undefined, field: string): boolean => (fields ?? []).includes(field);
const itemHasUncertainOrigin = (item: ReviewItem): boolean => item.extraction_status === "uncertain" || item.extraction_status === "unreadable";
const unresolvedUncertainFields = (item: ReviewItem) => itemHasUncertainOrigin(item)
  ? reviewFields.filter((field) => !isFieldHumanConfirmed(item.human_confirmed_fields, field))
  : [];
/**
 * El costo interno casi nunca está impreso en un presupuesto de cliente.
 * Si la partida se leyó bien y el documento no menciona costo, es "ausente en el documento"
 * (dato que solo el contratista conoce), no "no lo pudimos leer".
 */
export const plannedCostAbsentInDocument = (item: ReviewItem): boolean => {
  if (item.planned_cost !== null) return false;
  if (itemHasUncertainOrigin(item)) return false;
  if (isFieldHumanConfirmed(item.human_confirmed_fields, "planned_cost")) return false;
  return !/cost|costo|cost\.|precio de costo/i.test(item.source_text ?? "");
};

const stableTextId = (value: string) => {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};

export function buildEstimateConfidenceSummary(
  estimate: ReviewEstimate,
  items: ReviewItem[],
  questions: ConfidenceQuestion[],
  warnings: readonly string[] = [],
  uncertainties: readonly string[] = [],
): EstimateConfidenceSummary {
  const chargeConflict = chargeConfirmationPending(estimate, warnings);
  const missingCharge = estimate.charge_amount === null;
  const missingCosts = items.filter((item) => item.planned_cost === null).length;
  const missingClientPrices = items.filter((item) => item.client_price === null).length;
  const unresolvedItems = items.filter((item) => unresolvedUncertainFields(item).length > 0);
  const uncertain = unresolvedItems.filter((item) => item.extraction_status === "uncertain").length;
  const unreadable = unresolvedItems.filter((item) => item.extraction_status === "unreadable").length;
  const answeredQuestions = questions.filter((question) => Boolean(question.answer?.trim())).length;
  const unansweredQuestions = Math.max(0, 3 - answeredQuestions);
  const confirmedFields = new Set(estimate.human_confirmed_fields ?? []);
  const confirmedCount = confirmedFields.size + items.reduce((total, item) => total + new Set(item.human_confirmed_fields ?? []).size, 0);
  const blockers: string[] = [];
  const reviewIssues: ConfidenceReviewIssue[] = [];

  if (missingCharge) reviewIssues.push({ code: "missing_charge_amount", id: "estimate:charge_amount", blocking: true, field: "charge_amount" });
  if (chargeConflict) reviewIssues.push({ code: "conflicting_total", id: "warning:conflicting_total", blocking: true, field: "charge_amount" });
  for (const item of items) {
    if (item.planned_cost === null) reviewIssues.push({ code: plannedCostAbsentInDocument(item) ? "absent_planned_cost" : "missing_planned_cost", id: `item:${item.id}:planned_cost`, blocking: true, itemId: item.id, field: "planned_cost" });
    if (item.client_price === null) reviewIssues.push({ code: "missing_client_price", id: `item:${item.id}:client_price`, blocking: true, itemId: item.id, field: "client_price" });
    for (const field of unresolvedUncertainFields(item)) {
      if ((field === "planned_cost" && item.planned_cost === null) || (field === "client_price" && item.client_price === null)) continue;
      reviewIssues.push({ code: `uncertain_${field}`, id: `item:${item.id}:${field}`, blocking: true, itemId: item.id, field });
    }
  }
  if (!estimate.title.trim()) reviewIssues.push({ code: "missing_title", id: "estimate:title", blocking: true, field: "title" });
  questions.forEach((question, index) => {
    if (!question.answer?.trim()) reviewIssues.push({
      code: "unanswered_question",
      id: `question:${question.id ?? index + 1}`,
      blocking: true,
      questionId: question.id,
      questionCategory: question.category,
    });
  });
  const explicitUnansweredQuestions = questions.filter((question) => !question.answer?.trim()).length;
  for (let index = explicitUnansweredQuestions; index < unansweredQuestions; index += 1) {
    reviewIssues.push({ code: "unanswered_question", id: `question:missing:${index + 1}`, blocking: true });
  }
  Array.from(new Set(uncertainties)).forEach((uncertainty) => reviewIssues.push({ code: "optional_observation", id: `observation:${stableTextId(uncertainty)}`, blocking: false }));

  if (missingCharge) blockers.push("Falta confirmar el precio al cliente.");
  if (chargeConflict) blockers.push("La foto muestra dos totales distintos; confirma manualmente el precio al cliente.");
  if (missingCosts) blockers.push(`Falta confirmar el costo planeado de ${missingCosts} ${missingCosts === 1 ? "partida" : "partidas"}.`);
  if (missingClientPrices) blockers.push(`Falta confirmar el precio al cliente de ${missingClientPrices} ${missingClientPrices === 1 ? "partida" : "partidas"}.`);
  if (unreadable) blockers.push(`${unreadable} ${unreadable === 1 ? "partida no se pudo leer" : "partidas no se pudieron leer"}.`);
  if (uncertain) blockers.push(`${uncertain} ${uncertain === 1 ? "partida sigue incierta" : "partidas siguen inciertas"}.`);
  if (unansweredQuestions) blockers.push(`Falta responder ${unansweredQuestions} de las 3 preguntas de revisión.`);
  if (!estimate.title.trim()) blockers.push("Falta completar el título del presupuesto.");
  if (estimate.status !== "reviewed" && estimate.status !== "approved" && unansweredQuestions === 0) blockers.push("Guarda la revisión antes de aprobar.");
  if (estimate.status !== "reviewed" && estimate.status !== "approved" && unansweredQuestions === 0) reviewIssues.push({ code: "review_not_saved", id: "approval:review_not_saved", blocking: true });

  const lines = [
    missingCharge || chargeConflict ? "Precio al cliente: pendiente de confirmar" : "Precio al cliente: confirmado",
    missingCosts ? `Costos: ${missingCosts} ${missingCosts === 1 ? "partida pendiente" : "partidas pendientes"}` : "Costos: confirmados",
    unreadable ? `${unreadable} ${unreadable === 1 ? "partida no legible" : "partidas no legibles"}` : uncertain ? `${uncertain} ${uncertain === 1 ? "partida incierta" : "partidas inciertas"}` : "0 campos inciertos",
    chargeConflict ? "Conflicto entre totales pendiente" : "0 conflictos",
    `${answeredQuestions} de 3 preguntas respondidas`,
  ];

  return {
    ready: blockers.length === 0,
    confirmedCount,
    reviewCount: blockers.length,
    conflictCount: chargeConflict ? 1 : 0,
    answeredQuestions,
    lines,
    blockers,
    reviewIssues,
  };
}

export function approvalErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("material_monetary_uncertainty_unresolved")) return "Aún hay precios, costos o partidas inciertas por confirmar.";
  if (message.includes("estimate_requires_reviewed_status")) return "Guarda la revisión y responde las tres preguntas antes de aprobar.";
  if (message.includes("conflicting_total_candidates")) return "La foto muestra dos totales distintos; confirma manualmente el precio al cliente.";
  if (message.includes("estimate_approval_forbidden")) return "No tienes permiso para aprobar este presupuesto.";
  if (message.includes("estimate_approval_requires_authenticated_user")) return "Vuelve a iniciar sesión antes de aprobar.";
  return "No pudimos aprobar el presupuesto.";
}
