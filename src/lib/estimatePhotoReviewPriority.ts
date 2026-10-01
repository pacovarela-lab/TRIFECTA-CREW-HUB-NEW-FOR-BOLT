import {
  buildEstimateConfidenceSummary,
  type ConfidenceReviewIssue,
} from "@/lib/estimatePhotoConfidence";
import type { ReviewEstimate, ReviewItem } from "@/lib/estimatePhotoReview";

export type ReviewPriority = "high" | "medium" | "low";
export type PriorityQuestion = { id: string; category: "scope" | "hidden_cost" | "profitability"; answer: string | null };
export type ReviewPriorityIssue = {
  id: string;
  priority: ReviewPriority;
  rank: number;
  label: string;
  targetId: string;
  blocking: boolean;
  itemId?: string;
};

const priorityRank: Record<ReviewPriority, number> = { high: 0, medium: 1, low: 2 };
const itemName = (item: ReviewItem | undefined) => item?.description_normalized?.trim() || item?.description_original?.trim() || "partida sin descripción";

export function mapConfidenceIssueToPriority(issue: ConfidenceReviewIssue, items: readonly ReviewItem[]): ReviewPriorityIssue {
  const name = itemName(items.find((item) => item.id === issue.itemId));
  const common = { id: issue.id, blocking: issue.blocking, itemId: issue.itemId };
  switch (issue.code) {
    case "missing_charge_amount":
      return { ...common, priority: "high", rank: 0, label: "Confirmar precio al cliente", targetId: "review-charge" };
    case "conflicting_total":
      return { ...common, priority: "high", rank: 1, label: "Resolver total conflictivo", targetId: "review-charge" };
    case "absent_planned_cost":
      return { ...common, priority: "medium", rank: 9, label: `Agregar tu costo interno de ${name} (no aparece en la foto)`, targetId: `review-item-${issue.itemId}-planned-cost` };
    case "missing_planned_cost":
    case "uncertain_planned_cost":
      return { ...common, priority: "high", rank: 2, label: `Revisar costo de ${name}`, targetId: `review-item-${issue.itemId}-planned-cost` };
    case "missing_client_price":
    case "uncertain_client_price":
      return { ...common, priority: "high", rank: 3, label: `Revisar precio de ${name}`, targetId: `review-item-${issue.itemId}-client-price` };
    case "uncertain_description":
      return { ...common, priority: "medium", rank: 10, label: `Confirmar alcance de ${name}`, targetId: `review-item-${issue.itemId}-description` };
    case "uncertain_quantity":
      return { ...common, priority: "medium", rank: 11, label: `Confirmar cantidad de ${name}`, targetId: `review-item-${issue.itemId}-quantity` };
    case "uncertain_unit":
      return { ...common, priority: "medium", rank: 12, label: `Confirmar unidad de ${name}`, targetId: `review-item-${issue.itemId}-unit` };
    case "missing_title":
      return { ...common, priority: "medium", rank: 13, label: "Completar título del presupuesto", targetId: "review-title" };
    case "unanswered_question":
      return { ...common, priority: "medium", rank: issue.questionCategory === "scope" ? 14 : issue.questionCategory === "hidden_cost" ? 15 : 16, label: "Responder pregunta de revisión", targetId: issue.questionId ? `review-question-${issue.questionId}` : "review-questions" };
    case "optional_observation":
      return { ...common, priority: "low", rank: 20, label: "Revisar observación pendiente", targetId: "review-observations" };
    case "review_not_saved":
      return { ...common, priority: "high", rank: 5, label: "Guardar la revisión antes de aprobar", targetId: "review-save" };
    default:
      return {
        ...common,
        priority: issue.blocking ? "high" : "medium",
        rank: issue.blocking ? 6 : 17,
        label: issue.blocking ? "Hay un asunto pendiente antes de aprobar" : "Hay un asunto pendiente por revisar",
        targetId: "review-summary",
      };
  }
}

export function buildEstimateReviewPriorities(
  estimate: ReviewEstimate,
  items: readonly ReviewItem[],
  questions: readonly PriorityQuestion[],
  warnings: readonly string[] = [],
  uncertainties: readonly string[] = [],
): ReviewPriorityIssue[] {
  const confidence = buildEstimateConfidenceSummary(
    estimate,
    Array.from(items),
    questions.map(({ id, category, answer }) => ({ id, category, answer })),
    warnings,
    uncertainties,
  );
  const itemOrder = new Map(items.map((item, index) => [item.id, index]));
  return confidence.reviewIssues
    .map((issue) => mapConfidenceIssueToPriority(issue, items))
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]
      || a.rank - b.rank
      || (itemOrder.get(a.itemId ?? "") ?? Number.MAX_SAFE_INTEGER) - (itemOrder.get(b.itemId ?? "") ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id));
}

/** Always returns the highest-priority issue in the current canonical state. */
export function getNextReviewIssue(issues: readonly ReviewPriorityIssue[]): ReviewPriorityIssue | null {
  return issues[0] ?? null;
}

export function sortReviewItemsByPriority(items: readonly ReviewItem[], issues: readonly ReviewPriorityIssue[]): ReviewItem[] {
  const itemRank = new Map<string, number>();
  issues.forEach((issue, index) => { if (issue.itemId && !itemRank.has(issue.itemId)) itemRank.set(issue.itemId, index); });
  return items.map((item, index) => ({ item, index })).sort((a, b) => (itemRank.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) - (itemRank.get(b.item.id) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index).map(({ item }) => item);
}

export function countReviewPriorities(issues: readonly ReviewPriorityIssue[]) {
  return {
    high: issues.filter((issue) => issue.priority === "high").length,
    medium: issues.filter((issue) => issue.priority === "medium").length,
    low: issues.filter((issue) => issue.priority === "low").length,
  };
}

/** True when the frozen visual order no longer covers exactly the current item set (load, reload, revision). */
export function reviewOrderIsStale(items: readonly ReviewItem[], order: readonly string[]): boolean {
  if (items.length !== order.length) return true;
  const known = new Set(order);
  return items.some((item) => !known.has(item.id));
}

/** Renders items in a previously frozen order so editing a field never moves the focused input. */
export function applyReviewOrder(items: readonly ReviewItem[], order: readonly string[]): ReviewItem[] {
  const rank = new Map<string, number>();
  order.forEach((id, index) => { if (!rank.has(id)) rank.set(id, index); });
  return items.map((item, index) => ({ item, index })).sort((a, b) => (rank.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.item.id) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index).map(({ item }) => item);
}
