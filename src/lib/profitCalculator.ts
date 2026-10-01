import { projectedProfit, projectedMargin, type PlannedEstimateItem } from "@/lib/estimateFinancials";

export type ContingencyRate = 0.15 | 0.20 | 0.30;

export const CONTINGENCY_RATES: { value: ContingencyRate; label: string }[] = [
  { value: 0.15, label: "15%" },
  { value: 0.20, label: "20%" },
  { value: 0.30, label: "30%" },
];

export type ModeAInput = {
  chargeAmount: number;
  materials: number;
  labor: number;
  other: number;
};

export type ModeAResult = {
  totalCost: number;
  profit: number | null;
  margin: number | null;
  isLoss: boolean;
};

export function calculateModeA(input: ModeAInput): ModeAResult {
  const items: PlannedEstimateItem[] = [
    { itemType: "material", plannedCost: input.materials },
    { itemType: "labor", plannedCost: input.labor },
    { itemType: "other", plannedCost: input.other },
  ];
  const totalCost =
    (input.materials || 0) + (input.labor || 0) + (input.other || 0);
  const profit = projectedProfit(input.chargeAmount, totalCost);
  const margin = projectedMargin(input.chargeAmount, profit);
  return {
    totalCost,
    profit,
    margin,
    isLoss: profit !== null && profit < 0,
  };
}

export type ModeBInput = {
  materials: number;
  helperDays: number;
  helperDailyCost: number;
  ownerDays: number;
  ownerDailyRate: number;
  contingency: ContingencyRate;
};

export type ModeBResult = {
  laborCost: number;
  totalCost: number;
  suggestedPrice: number;
};

export function calculateModeB(input: ModeBInput): ModeBResult {
  const materials = input.materials || 0;
  const laborCost = (input.helperDays || 0) * (input.helperDailyCost || 0);
  const ownerIncome = (input.ownerDays || 0) * (input.ownerDailyRate || 0);
  const baseCost = materials + laborCost + ownerIncome;
  const suggestedPrice = baseCost * (1 + input.contingency);
  return {
    laborCost,
    totalCost: baseCost,
    suggestedPrice: Math.round(suggestedPrice * 100) / 100,
  };
}
