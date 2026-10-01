import type { ReviewEstimate, ReviewItem } from "@/lib/estimatePhotoReview";
import { reviewFinancials } from "@/lib/estimatePhotoReview";

export type RecommendationCategory = "missing_scope" | "missing_cost" | "price_opportunity";
export type EstimateRecommendation = { category: RecommendationCategory; title: string; explanation: string; suggestedAction: string; evidence: { code: string; itemId?: string } };

export function buildEstimateRecommendations(estimate: ReviewEstimate, items: ReviewItem[]): EstimateRecommendation[] {
  const recommendations: EstimateRecommendation[] = [];
  const unclear = items.find((item) => item.extraction_status === "uncertain" || item.extraction_status === "unreadable" || !item.description_normalized?.trim());
  if (unclear) recommendations.push({ category: "missing_scope", title: "Confirma el alcance", explanation: "Hay una partida cuyo alcance todavía no está completamente confirmado.", suggestedAction: "Revisa manualmente la descripción antes de aprobar.", evidence: { code: "unresolved_scope", itemId: unclear.id } });
  const missingCost = items.find((item) => item.planned_cost === null);
  if (missingCost) recommendations.push({ category: "missing_cost", title: "Completa el costo planeado", explanation: "Falta el costo interno estimado de una partida.", suggestedAction: "Confirma el costo planeado sin cambiar automáticamente el precio al cliente.", evidence: { code: "missing_planned_cost", itemId: missingCost.id } });
  const financials = reviewFinancials(estimate, items);
  if (financials.margin !== null && financials.margin < 0.2) recommendations.push({ category: "price_opportunity", title: "Revisa el precio", explanation: "El margen proyectado es menor al 20%.", suggestedAction: "Decide manualmente si mantienes el precio o ajustas alcance y costos.", evidence: { code: "low_projected_margin" } });
  return recommendations.slice(0, 3);
}

export type ClientEstimateItem = { description: string; quantity: number; unit: string | null; unitPrice: number; total: number };
export type ClientEstimatePreview = { title: string; scope: string; items: ClientEstimateItem[]; subtotal: number; total: number; terms: string[] };

const INTERNAL_CLIENT_TERMS = /planned[_\s-]?cost|internal\s+labor\s+cost|markup|margin|projected\s+profit|\brisk\b|recommendation|confidence|extraction[_\s-]?status|provenance|source[_\s-]?text|unreadable|internal[_\s-]?notes|analysis(?:\s+runs?)?|ai\s+metadata/i;
const NON_ENGLISH_CLIENT_TERMS = /[áéíóúñ¿¡]|\b(presupuesto|pintura|trabajo|alcance|costo|precio|cliente|techo|jardín|demolición|materiales|mano de obra)\b/i;
const safeClientText = (value: string | null | undefined, fallback: string) => {
  const candidate = value?.trim();
  return candidate && !INTERNAL_CLIENT_TERMS.test(candidate) && !NON_ENGLISH_CLIENT_TERMS.test(candidate) ? candidate : fallback;
};
const clientUnit = (value: string | null) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const units: Record<string, string> = { trabajo: "job", pieza: "piece", piezas: "pieces", hora: "hour", horas: "hours", cuarto: "room", cuartos: "rooms" };
  const candidate = units[normalized] ?? value.trim();
  const allowed = /^(job|jobs|piece|pieces|hour|hours|room|rooms|sq\.?\s*ft|square feet|linear feet|day|days|each|lot)$/i;
  return allowed.test(candidate) && !INTERNAL_CLIENT_TERMS.test(candidate) ? candidate : null;
};

export function buildClientEstimatePreview(estimate: ReviewEstimate & { client_description_en?: string | null }, items: ReviewItem[]): ClientEstimatePreview {
  if (estimate.status !== "approved") throw new Error("client_preview_requires_approved_estimate");
  const clientItems = items.map((item) => {
    const quantity = item.quantity ?? 0;
    const total = item.client_price ?? 0;
    const generic = !item.description_client_en?.trim() || /^approved work item$/i.test(item.description_client_en.trim());
    const description = generic
      ? safeClientText(item.description_normalized ?? item.description_original, "Approved work item")
      : safeClientText(item.description_client_en, "Approved work item");
    return { description, quantity, unit: clientUnit(item.unit), unitPrice: quantity > 0 ? total / quantity : total, total };
  });
  const total = estimate.charge_amount ?? clientItems.reduce((sum, item) => sum + item.total, 0);
  return { title: safeClientText(estimate.title, "Project Estimate"), scope: safeClientText(estimate.client_description_en, "Work described in the approved estimate."), items: clientItems, subtotal: total, total, terms: [] };
}

export const CLIENT_PREVIEW_KEYS = ["title", "scope", "items", "subtotal", "total", "terms"] as const;
