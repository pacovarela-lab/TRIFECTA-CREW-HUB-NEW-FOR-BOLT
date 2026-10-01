import { describe, expect, it } from "vitest";
import {
  UNREADABLE,
  compareMoney,
  compareText,
  evaluateCase,
  normalizeBenchmarkText,
  runBenchmark,
  evaluateBenchmarkGate,
  formatBenchmarkReport,
  toBaselineSnapshot,
  compareWithBaseline,
  type BenchmarkCase,
} from "../estimateAiBenchmark";
import { ESTIMATE_AI_GOLDEN_DATASET } from "../estimateAiBenchmarkFixtures";

function baseCase(overrides: Partial<BenchmarkCase> = {}): BenchmarkCase {
  return {
    id: "case",
    label: "case",
    tags: [],
    golden: {
      title: "Job TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [{ key: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    ai: {
      title: "Job TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [{ goldenKey: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    human_review: { high: 0, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 7000, totalMs: 10000 },
    ...overrides,
  };
}

describe("text matching", () => {
  it("normalizes trim, case, whitespace and punctuation", () => {
    expect(normalizeBenchmarkText("  Dry Wall. ")).toBe("dry wall");
    expect(compareText("Dry Wall", "dry   wall")).toBe("normalized");
  });

  it("reports exact match", () => {
    expect(compareText("Cabinets", "Cabinets")).toBe("exact");
  });

  it("never uses fuzzy matching to declare correct", () => {
    expect(compareText("drywall repair", "wall repair")).toBe("wrong");
  });

  it("separates missing from unreadable", () => {
    expect(compareText("Paint", null)).toBe("missing");
    expect(compareText("Paint", UNREADABLE)).toBe("unreadable");
  });
});

describe("monetary comparison", () => {
  it("marks exact monetary match", () => {
    expect(compareMoney(6785, 6785)).toBe("exact");
  });

  it("never converts unknown money into zero", () => {
    expect(compareMoney(600, null)).toBe("missing");
    expect(compareMoney(600, UNREADABLE)).toBe("unreadable");
    expect(compareMoney(600, 0)).toBe("wrong");
  });

  it("flags a wrong amount", () => {
    expect(compareMoney(6785, 6485)).toBe("wrong");
  });
});

describe("case evaluation", () => {
  it("keeps global total and item price independent", () => {
    const result = evaluateCase(baseCase());
    expect(result.total.verdict).toBe("exact");
    expect(result.fields.client_price.exact).toBe(1);
  });

  it("does not silently correct conflicting totals", () => {
    const detected = evaluateCase(baseCase({ expect_conflict: true, ai: { ...baseCase().ai, charge_amount: null, conflict_detected: true } }));
    expect(detected.total.verdict).toBe("conflict_detected");
    expect(detected.total.correct).toBe(true);

    const missed = evaluateCase(baseCase({ expect_conflict: true, ai: { ...baseCase().ai, charge_amount: 6785 } }));
    expect(missed.total.verdict).toBe("conflict_missed");
    expect(missed.total.correct).toBe(false);
  });

  it("counts a missing item", () => {
    const item = baseCase();
    item.golden.items.push({ key: "b", description: "Paint", quantity: 1, unit: null, client_price: 300, planned_cost: null, item_type: "scope" });
    const result = evaluateCase(item);
    expect(result.items.missing).toBe(1);
    expect(result.items.hallucinated).toBe(0);
  });

  it("counts a hallucinated item without hiding it behind matching", () => {
    const item = baseCase();
    item.ai.items.push({ goldenKey: null, description: "Permit fee", quantity: 1, unit: null, client_price: 250, planned_cost: null, item_type: "material" });
    const result = evaluateCase(item);
    expect(result.items.hallucinated).toBe(1);
    expect(result.items.matched).toBe(1);
  });

  it("keeps learned corrections out of AI accuracy", () => {
    const item = baseCase();
    item.golden.items[0].description = "Demolition premium";
    item.learned = [{ aiText: "Demolition", suggestion: "Demolition premium", outcome: "accepted", exactHit: true }];
    const result = evaluateCase(item);
    expect(result.fields.description.wrong).toBe(1);
    expect(result.fields.description.exact).toBe(0);
    expect(result.learned).toEqual({ available: 1, accepted: 1, rejected: 0, conflict: 0, exact_hits: 1 });
  });
});

describe("aggregation", () => {
  it("aggregates latency by average and median", () => {
    const summary = runBenchmark([
      baseCase({ id: "a", latency: { geminiCalls: 1, attempts: 1, aiMs: 6000, totalMs: 9000 } }),
      baseCase({ id: "b", latency: { geminiCalls: 2, attempts: 2, aiMs: 10000, totalMs: 13000 } }),
    ]);
    expect(summary.latency.gemini_calls).toBe(3);
    expect(summary.latency.attempts).toBe(3);
    expect(summary.latency.ai_ms.average).toBe(8000);
    expect(summary.latency.ai_ms.median).toBe(8000);
  });

  it("handles an empty dataset without NaN", () => {
    const summary = runBenchmark([]);
    expect(summary.cases).toBe(0);
    expect(summary.total_accuracy.pct).toBe(0);
    expect(summary.overall_extraction_accuracy_pct).toBe(0);
    expect(summary.latency.ai_ms.median).toBeNull();
    expect(formatBenchmarkReport(summary)).toContain("Empty dataset");
  });

  it("shows the money error even when the overall score is high", () => {
    const wrongTotal = baseCase({ id: "wrong", ai: { ...baseCase().ai, charge_amount: 6485 } });
    const summary = runBenchmark([baseCase({ id: "ok" }), wrongTotal]);
    expect(summary.total_accuracy.pct).toBe(50);
    expect(summary.overall_extraction_accuracy_pct).toBeGreaterThan(80);
    expect(formatBenchmarkReport(summary)).toContain("Total (charge_amount) accuracy");
  });

  it("compares against a previous baseline without gating", () => {
    const summary = runBenchmark([baseCase()]);
    const rows = compareWithBaseline({ ...toBaselineSnapshot(summary), total_accuracy_pct: 80 }, toBaselineSnapshot(summary));
    expect(rows.join("\n")).toContain("total_accuracy_pct");
  });
});

describe("golden dataset", () => {
  it("runs the shipped fixtures", () => {
    const summary = runBenchmark(ESTIMATE_AI_GOLDEN_DATASET);
    expect(summary.cases).toBeGreaterThanOrEqual(5);
    expect(summary.cases).toBeLessThanOrEqual(20);
    expect(summary.item_completeness.expected).toBeGreaterThan(0);
    expect(summary.item_completeness.hallucinated).toBeGreaterThan(0);
    expect(summary.item_completeness.missing).toBeGreaterThan(0);
    expect(summary.total_accuracy.conflicts_expected).toBe(1);
  });

  it("contains no PII", () => {
    const serialized = JSON.stringify(ESTIMATE_AI_GOLDEN_DATASET);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(serialized).not.toMatch(/\+?\d[\d\s().-]{8,}\d/);
    expect(serialized).not.toMatch(/\b\d+\s+(street|st|ave|avenue|road|rd|calle|blvd)\b/i);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe("ambiguous item matching", () => {
  it("never lets one AI row satisfy two golden rows", () => {
    const item = baseCase();
    item.golden.items = [
      { key: "a", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: null, item_type: "scope" },
      { key: "b", description: "Paint ceiling", quantity: 1, unit: null, client_price: 200, planned_cost: null, item_type: "scope" },
    ];
    item.ai.items = [
      { goldenKey: "a", description: "Paint", quantity: 1, unit: null, client_price: 300, planned_cost: null, item_type: "scope" },
    ];
    const result = evaluateCase(item);
    expect(result.items.matched).toBe(1);
    expect(result.items.missing).toBe(1);
    expect(result.fields.description.wrong).toBe(1);
  });

  it("counts a duplicated claim on the same golden row as a hallucination", () => {
    const item = baseCase();
    item.ai.items.push({ goldenKey: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" });
    const result = evaluateCase(item);
    expect(result.items.matched).toBe(1);
    expect(result.items.hallucinated).toBe(1);
    expect(result.items.missing).toBe(0);
  });

  it("flags an extra real-looking row as hallucinated, not as a match", () => {
    const item = baseCase();
    item.golden.items.push({ key: "b", description: "Drywall", quantity: 1, unit: null, client_price: 400, planned_cost: null, item_type: "scope" });
    item.ai.items.push({ goldenKey: "b", description: "Drywall", quantity: 1, unit: null, client_price: 400, planned_cost: null, item_type: "scope" });
    item.ai.items.push({ goldenKey: null, description: "Paint", quantity: 1, unit: null, client_price: 100, planned_cost: null, item_type: "scope" });
    const result = evaluateCase(item);
    expect(result.items.matched).toBe(2);
    expect(result.items.hallucinated).toBe(1);
    expect(result.items.missing).toBe(0);
  });

  it("keeps a wrong value visible instead of scoring it as exact", () => {
    const item = baseCase();
    item.ai.items[0].client_price = 650;
    const result = evaluateCase(item);
    expect(result.items.matched).toBe(1);
    expect(result.fields.client_price.wrong).toBe(1);
    expect(result.fields.client_price.exact).toBe(0);
  });
});

describe("determinism", () => {
  it("produces byte-identical results on a rerun", () => {
    const first = JSON.stringify(runBenchmark(ESTIMATE_AI_GOLDEN_DATASET));
    const second = JSON.stringify(runBenchmark(ESTIMATE_AI_GOLDEN_DATASET));
    expect(second).toBe(first);
    expect(first).not.toMatch(/generated_at|timestamp/);
  });

  it("includes a printed planned_cost category with at least one real photo case", () => {
    const cost = ESTIMATE_AI_GOLDEN_DATASET.filter((c) => c.tags.includes("printed-planned-cost"));
    expect(cost.length).toBeGreaterThanOrEqual(3);
    expect(cost.some((c) => c.tags.includes("real-photo"))).toBe(true);
    for (const c of cost) {
      // sintético o real, pero siempre etiquetado
      expect(c.tags.includes("synthetic-pending-real-photo") || c.tags.includes("real-photo")).toBe(true);
      // cada caso debe traer al menos un costo interno impreso en el golden
      expect(c.golden.items.some((i) => typeof i.planned_cost === "number")).toBe(true);
    }

    // nunca convertir un costo ausente/ilegible en 0
    for (const c of cost) {
      for (const i of c.ai.items) expect(i.planned_cost).not.toBe(0);
    }
  });

  it("CI gate fails when total accuracy drops or hallucinations increase", () => {
    const base = toBaselineSnapshot(runBenchmark(ESTIMATE_AI_GOLDEN_DATASET));
    expect(evaluateBenchmarkGate(base, base)).toEqual([]);
    const worseTotal = { ...base, total_accuracy_pct: (base.total_accuracy_pct ?? 0) - 5 };
    expect(evaluateBenchmarkGate(base, worseTotal).map((v) => v.metric)).toEqual(["total_accuracy_pct"]);
    const moreHallucinations = { ...base, hallucinated_items: (base.hallucinated_items ?? 0) + 1 };
    expect(evaluateBenchmarkGate(base, moreHallucinations).map((v) => v.metric)).toEqual(["hallucinated_items"]);
    const better = {
      ...base,
      total_accuracy_pct: base.total_accuracy_pct,
      hallucinated_items: Math.max(0, (base.hallucinated_items ?? 0) - 1),
      monetary_accuracy_pct: 10,
    };
    expect(evaluateBenchmarkGate(base, better)).toEqual([]);
  });
});
