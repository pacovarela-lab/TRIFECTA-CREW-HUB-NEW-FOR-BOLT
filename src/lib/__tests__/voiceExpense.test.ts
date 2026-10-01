import { describe, expect, it } from "vitest";
import {
  normalizeVoiceText,
  parseSpokenAmount,
  resolveVoiceExpense,
  voiceExpenseSchema,
  type VoiceExpense,
} from "@/lib/voiceExpense";

const base = (): VoiceExpense => ({
  transcript: "Home Depot one forty five para Patrick",
  language: "mixed",
  vendor: { raw: "home dépot", normalized: null, confidence: 0.99 },
  amount: { value: 145, currency: "USD", confidence: 0.99 },
  project: { raw: "Patrick", matched_id: null, matched_code: null, matched_name: null, confidence: 0.99, alternatives: [] },
  category: { raw: "Materials", matched_id: null, matched_name: null, confidence: 0.99 },
  subcategory: { raw: "drywall", matched_name: "drywall", confidence: 0.9 },
  paid_by: { raw: "Richard", matched_worker_id: null, matched_name: null, confidence: 0.99 },
  payment_method: { raw: "Amex Richard", matched_value: null, confidence: 0.99 },
  description: { value: "drywall materials", confidence: 0.99 },
  date: { value: null, confidence: 0 },
  needs_review: [],
  warnings: [],
});

const catalogs = {
  projects: [
    { id: "p1", name: "Patrick Vysata", project_code: "PV-001", address: "Main St", clients: { name: "Patrick" } },
    { id: "p2", name: "Patrick Wilson", project_code: "PW-002", clients: { name: "Patrick" } },
  ],
  workers: [{ id: "w1", name: "Richard", active: true }],
  vendors: [{ id: "v1", name: "Home Depot" }],
  categories: [{ id: "c1", name: "Materials" }],
  paymentMethods: [{ value: "card", label: "AMEX Richard" }],
};

describe("voice expense parsing and matching", () => {
  it("normalizes accents, punctuation and casing", () => {
    expect(normalizeVoiceText("  LOWE’S, Pintúra! ")).toBe("lowe s pintura");
  });

  it("parses spoken Spanish, English and Spanglish amounts", () => {
    expect(parseSpokenAmount("ciento treinta y ocho con cuarenta y cinco")).toBe(138.45);
    expect(parseSpokenAmount("one hundred forty five")).toBe(145);
    expect(parseSpokenAmount("sixty con fifty")).toBe(60.5);
  });

  it("matches canonical entities but leaves ambiguous projects for review", () => {
    const result = resolveVoiceExpense(base(), catalogs);
    expect(result.vendor.normalized).toBe("Home Depot");
    expect(result.paid_by.matched_worker_id).toBe("w1");
    expect(result.project.matched_id).toBeNull();
    expect(result.project.alternatives).toHaveLength(2);
    expect(result.needs_review).toContain("project");
  });

  it("matches a project by code and validates returned IDs against catalogs", () => {
    const input = base();
    input.project.raw = "PV cero cero uno";
    input.project.matched_id = "id-inventado";
    const result = resolveVoiceExpense(input, catalogs);
    expect(result.project.matched_id).toBe("p1");
  });

  it("marks incomplete low-confidence fields for review", () => {
    const input = base();
    input.amount = { value: null, currency: null, confidence: 0.8 };
    const result = resolveVoiceExpense(input, { ...catalogs, projects: [catalogs.projects[0]] });
    expect(result.needs_review).toContain("amount");
    expect(result.warnings).toContain("No se detectó un monto claro.");
  });

  it("rejects invalid structured responses", () => {
    expect(voiceExpenseSchema.safeParse({ transcript: "texto" }).success).toBe(false);
    const invalid: VoiceExpense = base();
    invalid.amount.confidence = 2;
    expect(voiceExpenseSchema.parse(invalid).amount.confidence).toBe(0);
  });
});
