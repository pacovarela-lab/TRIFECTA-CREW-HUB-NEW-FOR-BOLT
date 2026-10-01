import { describe, expect, it } from "vitest";
import {
  evaluateEstimateRisk,
  plannedCost,
  plannedLabor,
  plannedMaterials,
  plannedOther,
  projectedMargin,
  projectedProfit,
} from "../estimateFinancials";

const items = [
  { itemType: "material" as const, plannedCost: 1200 },
  { itemType: "labor" as const, plannedCost: 800 },
  { itemType: "other" as const, plannedCost: 200 },
  { itemType: "scope" as const, plannedCost: 9999 },
  { itemType: "material" as const, plannedCost: null },
];

describe("estimate photo financial foundation", () => {
  it("derives materials, labor, other and planned cost without counting scope", () => {
    expect(plannedMaterials(items)).toBe(1200);
    expect(plannedLabor(items)).toBe(800);
    expect(plannedOther(items)).toBe(200);
    expect(plannedCost(items)).toBe(2200);
  });

  it("calculates projected profit and margin", () => {
    const profit = projectedProfit(4000, plannedCost(items));
    expect(profit).toBe(1800);
    expect(projectedMargin(4000, profit)).toBe(0.45);
  });

  it("preserves positive, zero and negative profit in the approved formulas", () => {
    expect(projectedProfit(100, 80)).toBe(20);
    expect(projectedProfit(100, 100)).toBe(0);
    expect(projectedProfit(100, 120)).toBe(-20);
    expect(projectedMargin(100, -20)).toBe(-0.2);
  });

  it("supports decimals and zero costs", () => {
    const profit = projectedProfit(100.5, 20.25);
    expect(profit).toBeCloseTo(80.25, 10);
    expect(projectedMargin(100.5, profit)).toBeCloseTo(80.25 / 100.5, 10);
    expect(projectedProfit(45.75, 0)).toBe(45.75);
    expect(projectedMargin(45.75, 45.75)).toBe(1);
  });

  it("returns null for missing or zero charge instead of inventing a margin", () => {
    expect(projectedProfit(null, 10)).toBeNull();
    expect(projectedMargin(null, 5)).toBeNull();
    expect(projectedMargin(0, -10)).toBeNull();
  });

  it("ignores invalid planned costs and refuses negative money inputs", () => {
    expect(plannedCost([{ itemType: "labor", plannedCost: undefined }])).toBe(0);
    expect(plannedCost([{ itemType: "labor", plannedCost: -20 }])).toBe(0);
    expect(projectedProfit(100, -20)).toBeNull();
    expect(projectedMargin(-100, -120)).toBeNull();
  });

  it("classifies low risk when principal costs exist and margin is above 20%", () => {
    expect(evaluateEstimateRisk({
      projectedMargin: 0.3,
      hasMajorMonetaryUncertainty: false,
      hasEssentialLabor: true,
      hasEssentialMaterials: true,
      hasContingency: true,
      hasRelevantScopeWarnings: false,
    }).level).toBe("low");
  });

  it("classifies review risk for a 10–20% margin or review warnings", () => {
    const result = evaluateEstimateRisk({
      projectedMargin: 0.15,
      hasMajorMonetaryUncertainty: false,
      hasEssentialLabor: true,
      hasEssentialMaterials: true,
      hasContingency: false,
      hasRelevantScopeWarnings: true,
    });
    expect(result.level).toBe("review");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("classifies high risk for low margin, monetary uncertainty, or missing essentials", () => {
    const result = evaluateEstimateRisk({
      projectedMargin: 0.05,
      hasMajorMonetaryUncertainty: true,
      hasEssentialLabor: false,
      hasEssentialMaterials: true,
      hasContingency: false,
      hasRelevantScopeWarnings: false,
    });
    expect(result.level).toBe("high");
    expect(result.disclosure).toMatch(/^Basado en lo que ingresaste/);
    expect(result.reasons).toHaveLength(3);
  });

  const baseRisk = {
    hasMajorMonetaryUncertainty: false,
    hasEssentialLabor: true,
    hasEssentialMaterials: true,
    hasContingency: true,
    hasRelevantScopeWarnings: false,
  };

  it.each([
    [0.0999, "high"],
    [0.1, "review"],
    [0.15, "review"],
    [0.2, "review"],
    [0.2001, "low"],
    [-0.2, "high"],
  ] as const)("classifies the exact margin boundary %s as %s", (margin, level) => {
    expect(evaluateEstimateRisk({ ...baseRisk, projectedMargin: margin }).level).toBe(level);
  });

  it.each([
    [{ hasMajorMonetaryUncertainty: true }, "high"],
    [{ hasEssentialMaterials: false }, "high"],
    [{ hasEssentialLabor: false }, "high"],
    [{ hasRelevantScopeWarnings: true }, "review"],
    [{ hasContingency: false }, "review"],
  ] as const)("applies factor precedence for %o", (override, level) => {
    expect(evaluateEstimateRisk({ ...baseRisk, projectedMargin: 0.3, ...override }).level).toBe(level);
  });

  it("lets any high reason win over review reasons and caps explanations at three", () => {
    const result = evaluateEstimateRisk({
      projectedMargin: 0.15,
      hasMajorMonetaryUncertainty: true,
      hasEssentialLabor: false,
      hasEssentialMaterials: false,
      hasContingency: false,
      hasRelevantScopeWarnings: true,
    });
    expect(result.level).toBe("high");
    expect(result.reasons).toHaveLength(3);
  });

  it("classifies a real loss as high risk", () => {
    const profit = projectedProfit(100, 120);
    const margin = projectedMargin(100, profit);
    expect(profit).toBe(-20);
    expect(margin).toBe(-0.2);
    expect(evaluateEstimateRisk({ ...baseRisk, projectedMargin: margin }).level).toBe("high");
  });
});
