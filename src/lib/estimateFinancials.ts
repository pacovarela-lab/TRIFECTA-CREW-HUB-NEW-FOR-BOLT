export type EstimateItemType = "scope" | "material" | "labor" | "other";

export type PlannedEstimateItem = {
  itemType: EstimateItemType;
  plannedCost: number | null | undefined;
};

const validMoney = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const validNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const totalFor = (items: ReadonlyArray<PlannedEstimateItem>, type: EstimateItemType): number =>
  items.reduce((total, item) => {
    const value = item.itemType === type ? validMoney(item.plannedCost) : null;
    return total + (value ?? 0);
  }, 0);

export const plannedMaterials = (items: ReadonlyArray<PlannedEstimateItem>): number =>
  totalFor(items, "material");

export const plannedLabor = (items: ReadonlyArray<PlannedEstimateItem>): number =>
  totalFor(items, "labor");

export const plannedOther = (items: ReadonlyArray<PlannedEstimateItem>): number =>
  totalFor(items, "other");

export const plannedCost = (items: ReadonlyArray<PlannedEstimateItem>): number =>
  plannedMaterials(items) + plannedLabor(items) + plannedOther(items);

export const projectedProfit = (
  chargeAmount: number | null | undefined,
  cost: number | null | undefined,
): number | null => {
  const charge = validMoney(chargeAmount);
  const planned = validMoney(cost);
  if (charge === null || planned === null) return null;
  return charge - planned;
};

export const projectedMargin = (
  chargeAmount: number | null | undefined,
  profit: number | null | undefined,
): number | null => {
  const charge = validMoney(chargeAmount);
  const projected = validNumber(profit);
  if (charge === null || projected === null || charge <= 0) return null;
  return projected / charge;
};

export type EstimateRiskLevel = "low" | "review" | "high";

export type EstimateRiskInput = {
  projectedMargin: number | null;
  hasMajorMonetaryUncertainty: boolean;
  hasEssentialLabor: boolean;
  hasEssentialMaterials: boolean;
  hasContingency: boolean;
  hasRelevantScopeWarnings: boolean;
};

export type EstimateRiskThresholds = {
  highMarginBelow: number;
  reviewMarginAtOrBelow: number;
};

export type EstimateRiskResult = {
  level: EstimateRiskLevel;
  reasons: string[];
  disclosure: string;
};

export const DEFAULT_ESTIMATE_RISK_THRESHOLDS: EstimateRiskThresholds = {
  highMarginBelow: 0.1,
  reviewMarginAtOrBelow: 0.2,
};

export function evaluateEstimateRisk(
  input: EstimateRiskInput,
  thresholds: EstimateRiskThresholds = DEFAULT_ESTIMATE_RISK_THRESHOLDS,
): EstimateRiskResult {
  const highReasons: string[] = [];
  const reviewReasons: string[] = [];

  if (input.projectedMargin === null) reviewReasons.push("Falta un precio válido para calcular el margen.");
  else if (input.projectedMargin < thresholds.highMarginBelow) highReasons.push("El margen proyectado es menor al 10%.");
  else if (input.projectedMargin <= thresholds.reviewMarginAtOrBelow) reviewReasons.push("El margen proyectado está entre 10% y 20%.");

  if (input.hasMajorMonetaryUncertainty) highReasons.push("Existe una cifra monetaria importante sin confirmar.");
  if (!input.hasEssentialLabor) highReasons.push("No se identificó la mano de obra esencial.");
  if (!input.hasEssentialMaterials) highReasons.push("No se identificaron los materiales esenciales.");
  if (!input.hasContingency) reviewReasons.push("No se incluyó contingencia.");
  if (input.hasRelevantScopeWarnings) reviewReasons.push("Hay advertencias relevantes sobre el alcance.");

  const level: EstimateRiskLevel = highReasons.length > 0 ? "high" : reviewReasons.length > 0 ? "review" : "low";
  const reasons = level === "high" ? [...highReasons, ...reviewReasons] : reviewReasons;
  return {
    level,
    reasons: reasons.slice(0, 3),
    disclosure: "Basado en lo que ingresaste; revisa y confirma antes de aprobar.",
  };
}
