/**
 * Capa explícita de traducción UI para el flujo interno de "Foto de presupuesto AI".
 * Los enums/keys técnicos permanecen en inglés en DB/código, pero NUNCA se muestran al usuario.
 * Excepción intencional: el "Client Estimate Preview" permanece en inglés (documento del cliente).
 */

export type EstimateRecommendationCategoryKey = "missing_scope" | "missing_cost" | "price_opportunity";
export type EstimateExtractionStatusKey = "confirmed" | "inferred" | "uncertain" | "unreadable" | "human_corrected";
export type EstimateStatusKey = "draft" | "needs_answers" | "reviewed" | "approved" | string;
export type EstimateQuestionCategoryKey = "scope" | "hidden_cost" | "profitability";
export type EstimateItemTypeKey = "scope" | "material" | "labor" | "other";

const RECOMMENDATION_LABELS: Record<EstimateRecommendationCategoryKey, string> = {
  missing_scope: "Falta alcance",
  missing_cost: "Falta costo",
  price_opportunity: "Oportunidad de precio",
};

const EXTRACTION_STATUS_LABELS: Record<EstimateExtractionStatusKey, string> = {
  confirmed: "Confirmado",
  inferred: "Interpretado — revisa",
  uncertain: "No estamos seguros",
  unreadable: "No se pudo leer",
  human_corrected: "Corregido por usuario",
};

const ESTIMATE_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  needs_answers: "Preguntas por responder",
  reviewed: "Requiere revisión",
  approved: "Aprobado",
};

const QUESTION_CATEGORY_LABELS: Record<EstimateQuestionCategoryKey, string> = {
  scope: "Alcance",
  hidden_cost: "Costo oculto",
  profitability: "Rentabilidad",
};

const ITEM_TYPE_LABELS: Record<EstimateItemTypeKey, string> = {
  scope: "Alcance",
  material: "Material",
  labor: "Mano de obra",
  other: "Otro",
};

export const recommendationCategoryLabel = (key: string) => RECOMMENDATION_LABELS[key as EstimateRecommendationCategoryKey] ?? "Requiere revisión";
export const extractionStatusLabel = (key: string) => EXTRACTION_STATUS_LABELS[key as EstimateExtractionStatusKey] ?? "Requiere revisión";
export const estimateStatusLabel = (key: EstimateStatusKey) => ESTIMATE_STATUS_LABELS[key] ?? "Requiere revisión";
export const questionCategoryLabel = (key: string) => QUESTION_CATEGORY_LABELS[key as EstimateQuestionCategoryKey] ?? "Requiere revisión";
export const itemTypeLabel = (key: string) => ITEM_TYPE_LABELS[key as EstimateItemTypeKey] ?? "Otro";

const OBSERVED_FIELD_LABELS: Record<string, string> = {
  client_observed: "Cliente observado",
  address_observed: "Dirección observada",
  notes: "Notas observadas",
  title: "Título observado",
  charge_amount: "Precio observado",
  division: "División observada",
  business_area: "Área de negocio observada",
};

/** Convierte las notas internas ("client_observed: X") en texto legible en español. */
export function formatObservedNotes(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/);
      if (!match) return line.trim();
      const [, key, value] = match;
      const label = OBSERVED_FIELD_LABELS[key];
      if (!label) return line.trim();
      const text = value.trim();
      return text ? `${label}: ${text}` : `${label}: sin información`;
    })
    .filter(Boolean)
    .join("\n");
}


/** Strings técnicos en inglés que nunca deben renderizarse en el flujo interno. */
export const FORBIDDEN_INTERNAL_UI_STRINGS = [
  "Confirmed",
  "Uncertain",
  "Unreadable",
  "missing_cost",
  "missing_scope",
  "price_opportunity",
  "human_corrected",
  "Save review",
  "Review required",
  "Needs answers",
  "Human corrected",
  "Missing cost",
  "Missing scope",
  "Price opportunity",
];
