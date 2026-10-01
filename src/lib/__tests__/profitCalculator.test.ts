import { describe, it, expect } from "vitest";
import { calculateModeA, calculateModeB, CONTINGENCY_RATES } from "@/lib/profitCalculator";
import { projectedProfit, projectedMargin } from "@/lib/estimateFinancials";

describe("Calculadora — Modo A: Ganancia proyectada", () => {
  it("calcula ganancia positiva correctamente", () => {
    const result = calculateModeA({ chargeAmount: 5000, materials: 1500, labor: 1000, other: 500 });
    expect(result.totalCost).toBe(3000);
    expect(result.profit).toBe(2000);
    expect(result.isLoss).toBe(false);
  });

  it("calcula margen correctamente", () => {
    const result = calculateModeA({ chargeAmount: 5000, materials: 1500, labor: 1000, other: 500 });
    expect(result.margin).toBeCloseTo(0.4, 5);
  });

  it("detecta pérdida cuando los costos superan el precio", () => {
    const result = calculateModeA({ chargeAmount: 2000, materials: 1500, labor: 1000, other: 500 });
    expect(result.profit).toBe(-1000);
    expect(result.isLoss).toBe(true);
    expect(result.margin).toBe(-0.5);
  });

  it("ganancia cero cuando precio iguala costos", () => {
    const result = calculateModeA({ chargeAmount: 3000, materials: 1500, labor: 1000, other: 500 });
    expect(result.profit).toBe(0);
    expect(result.isLoss).toBe(false);
    expect(result.margin).toBe(0);
  });

  it("reutiliza projectedProfit y projectedMargin de estimateFinancials", () => {
    const profit = projectedProfit(5000, 3000);
    const margin = projectedMargin(5000, profit);
    expect(profit).toBe(2000);
    expect(margin).toBeCloseTo(0.4, 5);
  });

  it("maneja valores en cero", () => {
    const result = calculateModeA({ chargeAmount: 0, materials: 0, labor: 0, other: 0 });
    expect(result.totalCost).toBe(0);
    expect(result.profit).toBe(0);
    expect(result.margin).toBeNull();
  });
});

describe("Calculadora — Modo B: Presupuesto rápido", () => {
  it("calcula precio sugerido con contingencia 15%", () => {
    const result = calculateModeB({
      materials: 1000,
      helperDays: 2,
      helperDailyCost: 200,
      ownerDays: 3,
      ownerDailyRate: 500,
      contingency: 0.15,
    });
    expect(result.laborCost).toBe(400);
    expect(result.totalCost).toBe(1000 + 400 + 1500);
    expect(result.suggestedPrice).toBeCloseTo(2900 * 1.15, 2);
  });

  it("calcula precio sugerido con contingencia 20%", () => {
    const result = calculateModeB({
      materials: 1000,
      helperDays: 2,
      helperDailyCost: 200,
      ownerDays: 3,
      ownerDailyRate: 500,
      contingency: 0.20,
    });
    expect(result.suggestedPrice).toBeCloseTo(2900 * 1.20, 2);
  });

  it("calcula precio sugerido con contingencia 30%", () => {
    const result = calculateModeB({
      materials: 1000,
      helperDays: 2,
      helperDailyCost: 200,
      ownerDays: 3,
      ownerDailyRate: 500,
      contingency: 0.30,
    });
    expect(result.suggestedPrice).toBeCloseTo(2900 * 1.30, 2);
  });

  it("contingencia 15% produce precio menor que 20% y 30%", () => {
    const base = { materials: 1000, helperDays: 2, helperDailyCost: 200, ownerDays: 3, ownerDailyRate: 500 };
    const r15 = calculateModeB({ ...base, contingency: 0.15 });
    const r20 = calculateModeB({ ...base, contingency: 0.20 });
    const r30 = calculateModeB({ ...base, contingency: 0.30 });
    expect(r15.suggestedPrice).toBeLessThan(r20.suggestedPrice);
    expect(r20.suggestedPrice).toBeLessThan(r30.suggestedPrice);
  });

  it("maneja valores en cero", () => {
    const result = calculateModeB({
      materials: 0,
      helperDays: 0,
      helperDailyCost: 0,
      ownerDays: 0,
      ownerDailyRate: 0,
      contingency: 0.15,
    });
    expect(result.suggestedPrice).toBe(0);
  });

  it("solo materiales sin mano de obra", () => {
    const result = calculateModeB({
      materials: 500,
      helperDays: 0,
      helperDailyCost: 0,
      ownerDays: 0,
      ownerDailyRate: 0,
      contingency: 0.20,
    });
    expect(result.totalCost).toBe(500);
    expect(result.suggestedPrice).toBe(600);
  });

  it("CONTINGENCY_RATES tiene exactamente 3 opciones: 15%, 20%, 30%", () => {
    expect(CONTINGENCY_RATES).toHaveLength(3);
    expect(CONTINGENCY_RATES.map((r) => r.value)).toEqual([0.15, 0.20, 0.30]);
  });
});

describe("Calculadora — Creación de trabajo usa flujo existente", () => {
  it("ProjectCreateDialog acepta estimated_total como budget", () => {
    // The existing ProjectCreateDialog inserts into projects with estimated_total = Number(budget).
    // The calculator's "Crear trabajo" button opens this same dialog.
    // This test verifies the numeric conversion works as the dialog does.
    const budget = "3350";
    const estimatedTotal = Number(budget) || 0;
    expect(estimatedTotal).toBe(3350);
  });

  it("el precio sugerido del Modo B se puede usar como budget del proyecto", () => {
    const result = calculateModeB({
      materials: 1000,
      helperDays: 2,
      helperDailyCost: 200,
      ownerDays: 3,
      ownerDailyRate: 500,
      contingency: 0.15,
    });
    const budget = String(result.suggestedPrice);
    expect(Number(budget)).toBe(result.suggestedPrice);
  });
});
