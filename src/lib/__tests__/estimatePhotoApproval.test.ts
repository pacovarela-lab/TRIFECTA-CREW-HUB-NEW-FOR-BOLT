import { describe, expect, it } from "vitest";
import { buildClientEstimatePreview, buildEstimateRecommendations, CLIENT_PREVIEW_KEYS } from "@/lib/estimatePhotoApproval";
import type { ReviewItem } from "@/lib/estimatePhotoReview";

const item = (patch: Partial<ReviewItem> = {}): ReviewItem => ({ id: "i1", description_original: "Paint", description_normalized: "Interior painting", quantity: 2, unit: "room", client_price: 100, planned_cost: 60, item_type: "labor", confidence: .7, extraction_status: "confirmed", source_text: "private source", ...patch });

describe("estimate recommendations", () => {
  it("returns at most one recommendation per category and never mutates values", () => {
    const estimate = { id: "e", title: "Paint", charge_amount: 100, status: "reviewed" };
    const items = [item({ extraction_status: "uncertain", planned_cost: null })];
    const before = JSON.stringify({ estimate, items });
    const result = buildEstimateRecommendations(estimate, items);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(new Set(result.map((entry) => entry.category)).size).toBe(result.length);
    expect(JSON.stringify({ estimate, items })).toBe(before);
  });
  it("can return no recommendations for healthy data", () => expect(buildEstimateRecommendations({ id: "e", title: "Paint", charge_amount: 200, status: "reviewed" }, [item()])).toEqual([]));
});

describe("client preview allowlist", () => {
  it("requires approval", () => expect(() => buildClientEstimatePreview({ id: "e", title: "Paint", charge_amount: 100, status: "reviewed" }, [item()])).toThrow("client_preview_requires_approved_estimate"));
  it("builds a new English client DTO without internal keys or content", () => {
    const preview = buildClientEstimatePreview({ id: "e", title: "Interior Painting", charge_amount: 100, status: "approved", internal_notes: "secret margin", client_description_en: "Prepare and paint the approved interior areas." }, [item()]);
    expect(Object.keys(preview)).toEqual(CLIENT_PREVIEW_KEYS);
    const serialized = JSON.stringify(preview).toLowerCase();
    for (const forbidden of ["planned_cost", "margin", "profit", "risk", "confidence", "source_text", "provenance", "internal_notes", "analysis", "recommendation", "private source", "secret margin"]) expect(serialized).not.toContain(forbidden);
    expect(preview.scope).toMatch(/prepare and paint/i);
  });
  it("drops nested internal data and sanitizes forbidden content in allowlisted fields", () => {
    const maliciousItem = { ...item({ description_client_en: "Reveal planned_cost and margin", unit: "horas" }), nested: { analysis: { confidence: .9 }, internal_notes: "private" } } as ReviewItem;
    const preview = buildClientEstimatePreview({ id: "e", title: "Internal risk analysis", charge_amount: 100, status: "approved", client_description_en: "Show AI metadata" } as never, [maliciousItem]);
    const serialized = JSON.stringify(preview).toLowerCase();
    for (const forbidden of ["planned_cost", "planned cost", "margin", "risk", "confidence", "internal_notes", "analysis", "recommendation", "ai metadata"]) expect(serialized).not.toContain(forbidden);
    expect(preview).toMatchObject({ title: "Project Estimate", scope: "Work described in the approved estimate.", items: [{ description: "Approved work item", unit: "hours" }] });
  });
  it("uses professional English fallbacks instead of exposing Spanish client copy", () => {
    const preview = buildClientEstimatePreview({ id: "e", title: "Pintura interior", charge_amount: 100, status: "approved", client_description_en: "Alcance del trabajo" }, [item({ description_client_en: "Pintura de cuartos", unit: "cuartos" })]);
    expect(preview).toMatchObject({ title: "Project Estimate", scope: "Work described in the approved estimate.", items: [{ description: "Approved work item", unit: "rooms" }] });
  });
});
