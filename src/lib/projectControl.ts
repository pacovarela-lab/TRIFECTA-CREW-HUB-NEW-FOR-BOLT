/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlannedEstimateItem } from "@/lib/estimateFinancials";
import { plannedMaterials, plannedLabor, plannedOther } from "@/lib/estimateFinancials";

export type ControlArea = "materials" | "labor" | "other" | "collections" | "margin";

export type HealthStatus = "green" | "orange" | "red";

export type AreaActuals = {
  materials: number;
  labor: number;
  other: number;
  collections: number;
};

export type AreaBudgets = {
  materials: number;
  labor: number;
  other: number;
  collections: number;
};

export type ProjectControlInput = {
  estimateItems: ReadonlyArray<PlannedEstimateItem>;
  estimatedTotal: number;
  revisedBudget: AreaBudgets | null;
  actuals: AreaActuals;
  overhead: number;
};

export type AreaDeviation = {
  area: ControlArea;
  budget: number;
  actual: number;
  deviation: number;
  deviationPct: number;
  status: HealthStatus;
  message: string;
};

export type ProjectControlResult = {
  originalBudget: AreaBudgets;
  revisedBudget: AreaBudgets | null;
  actuals: AreaActuals;
  areas: AreaDeviation[];
  overallStatus: HealthStatus;
  margin: {
    budgeted: number;
    actual: number;
    deviation: number;
  };
  messages: string[];
};

const DEVIATION_WARN_PCT = 0.1;
const DEVIATION_CRITICAL_PCT = 0.25;
const LOSS_CRITICAL = 0;

export function computeProjectControl(input: ProjectControlInput): ProjectControlResult {
  const originalBudget: AreaBudgets = {
    materials: plannedMaterials(input.estimateItems),
    labor: plannedLabor(input.estimateItems),
    other: plannedOther(input.estimateItems),
    collections: input.estimatedTotal,
  };

  const budget = input.revisedBudget ?? originalBudget;
  const actuals = input.actuals;

  const areas: AreaDeviation[] = [];
  const messages: string[] = [];

  (["materials", "labor", "other"] as const).forEach((area) => {
    const b = budget[area];
    const a = actuals[area];
    const deviation = a - b;
    const deviationPct = b > 0 ? deviation / b : 0;
    let status: HealthStatus = "green";
    if (deviation > 0) {
      if (deviationPct >= DEVIATION_CRITICAL_PCT) status = "red";
      else if (deviationPct >= DEVIATION_WARN_PCT) status = "orange";
    }
    const msg = formatAreaMessage(area, deviation, status);
    areas.push({ area, budget: b, actual: a, deviation, deviationPct, status, message: msg });
    if (status !== "green") messages.push(msg);
  });

  // Collections: deviation is budget - actual (under-collection is bad)
  const collBudget = budget.collections;
  const collActual = actuals.collections;
  const collDeviation = collBudget - collActual;
  const collDeviationPct = collBudget > 0 ? collDeviation / collBudget : 0;
  let collStatus: HealthStatus = "green";
  if (collDeviation > 0) {
    if (collDeviationPct >= DEVIATION_CRITICAL_PCT) collStatus = "red";
    else if (collDeviationPct >= DEVIATION_WARN_PCT) collStatus = "orange";
  }
  const collMsg = collDeviation > 0
    ? `Te falta cobrar ${formatMoney(collDeviation)}`
    : "";
  areas.push({
    area: "collections",
    budget: collBudget,
    actual: collActual,
    deviation: collDeviation,
    deviationPct: collDeviationPct,
    status: collStatus,
    message: collMsg,
  });
  if (collStatus !== "green" && collMsg) messages.push(collMsg);

  // Margin
  const budgetedMargin = budget.collections - budget.materials - budget.labor - budget.other;
  const actualMargin = collActual - actuals.materials - actuals.labor - actuals.other - input.overhead;
  const marginDeviation = actualMargin - budgetedMargin;
  let marginStatus: HealthStatus = "green";
  if (actualMargin < LOSS_CRITICAL) marginStatus = "red";
  else if (marginDeviation < 0 && budgetedMargin > 0 && marginDeviation / budgetedMargin <= -DEVIATION_WARN_PCT) {
    marginStatus = "orange";
  }
  const marginMsg = marginStatus !== "green"
    ? "Este trabajo está dejando menos de lo esperado"
    : "";
  areas.push({
    area: "margin",
    budget: budgetedMargin,
    actual: actualMargin,
    deviation: marginDeviation,
    deviationPct: budgetedMargin > 0 ? marginDeviation / budgetedMargin : 0,
    status: marginStatus,
    message: marginMsg,
  });
  if (marginStatus !== "green" && marginMsg) messages.push(marginMsg);

  const overallStatus: HealthStatus = areas.some((a) => a.status === "red")
    ? "red"
    : areas.some((a) => a.status === "orange")
      ? "orange"
      : "green";

  return {
    originalBudget,
    revisedBudget: input.revisedBudget,
    actuals,
    areas,
    overallStatus,
    margin: { budgeted: budgetedMargin, actual: actualMargin, deviation: marginDeviation },
    messages,
  };
}

function formatAreaMessage(area: string, deviation: number, status: HealthStatus): string {
  if (status === "green" || deviation <= 0) return "";
  const label = areaLabel(area);
  const amount = formatMoney(deviation);
  if (status === "red") {
    return `${label} está ${amount} arriba del plan`;
  }
  return `${label} está ${amount} arriba del plan`;
}

function areaLabel(area: string): string {
  switch (area) {
    case "materials": return "Materiales";
    case "labor": return "Mano de obra";
    case "other": return "Otros";
    case "collections": return "Cobros";
    default: return area;
  }
}

function formatMoney(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

export type RecommendedAction = {
  type: "charge_more" | "reduce_expense" | "review_labor" | "collect_balance" | "reclassify";
  label: string;
};

export type AIRecommendation = {
  area: ControlArea;
  severity: HealthStatus;
  explanation: string;
  problem_area: string;
  margin_impact: number;
  recommended_actions: RecommendedAction[];
};

export function generateAIRecommendations(control: ProjectControlResult): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const area of control.areas) {
    if (area.status === "green" || area.area === "margin") continue;

    const actions: RecommendedAction[] = [];
    if (area.area === "collections") {
      actions.push({ type: "collect_balance", label: "Cobrar saldo pendiente" });
      actions.push({ type: "charge_more", label: "Subir precio / cobrar extra" });
    } else if (area.area === "labor") {
      actions.push({ type: "review_labor", label: "Revisar mano de obra" });
      actions.push({ type: "reduce_expense", label: "Reducir gasto" });
    } else {
      actions.push({ type: "reduce_expense", label: "Reducir gasto" });
      actions.push({ type: "reclassify", label: "Reclasificar gasto incorrecto" });
    }

    if (control.margin.deviation < 0) {
      actions.push({ type: "charge_more", label: "Cobrar extra / subir precio" });
    }

    recs.push({
      area: area.area,
      severity: area.status,
      explanation: `${areaLabel(area.area)} tiene una desviación de ${formatMoney(area.deviation)} (${Math.round(area.deviationPct * 100)}% sobre el plan).`,
      problem_area: area.message,
      margin_impact: area.deviation,
      recommended_actions: actions.slice(0, 3),
    });
  }

  if (control.overallStatus === "red" && control.margin.actual < 0) {
    recs.push({
      area: "margin",
      severity: "red",
      explanation: `El margen actual es ${formatMoney(control.margin.actual)}, por debajo de lo proyectado (${formatMoney(control.margin.budgeted)}).`,
      problem_area: "Este trabajo está dejando menos de lo esperado",
      margin_impact: control.margin.deviation,
      recommended_actions: [
        { type: "charge_more", label: "Cobrar extra / subir precio" },
        { type: "reduce_expense", label: "Reducir gasto" },
        { type: "collect_balance", label: "Cobrar saldo pendiente" },
      ],
    });
  }

  return recs;
}

export function healthLabel(status: HealthStatus): string {
  switch (status) {
    case "green": return "Sano";
    case "orange": return "Atención";
    case "red": return "Crítico";
  }
}

export function healthColor(status: HealthStatus): string {
  switch (status) {
    case "green": return "bg-success";
    case "orange": return "bg-warning";
    case "red": return "bg-destructive";
  }
}
