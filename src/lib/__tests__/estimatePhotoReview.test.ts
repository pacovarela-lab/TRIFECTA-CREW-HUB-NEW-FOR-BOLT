import { describe, expect, it } from "vitest";
import { buildEstimateReviewQuestions, formatEstimateMoney, humanReviewErrorMessage, humanStatus, reviewFinancials, type ReviewItem } from "@/lib/estimatePhotoReview";

const estimate = { id: "e", title: "Pintura interior", charge_amount: 100, status: "needs_answers" };
const item = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({ id: "i", description_original: "Paint walls", description_normalized: "Pintar paredes", quantity: 1, unit: "job", client_price: 100, planned_cost: 80, item_type: "labor", confidence: .9, extraction_status: "confirmed", source_text: "Paint walls", ...overrides });

describe("deterministic three-question selector", () => {
  it("always returns exactly one question per required category", () => {
    const questions = buildEstimateReviewQuestions(estimate, [item()]);
    expect(questions).toHaveLength(3);
    expect(questions.map((q) => q.category)).toEqual(["scope", "hidden_cost", "profitability"]);
    expect(new Set(questions.map((q) => q.category)).size).toBe(3);
  });
  it("is deterministic", () => expect(buildEstimateReviewQuestions(estimate, [item()])).toEqual(buildEstimateReviewQuestions(estimate, [item()])));
  it("prioritizes unreadable scope", () => expect(buildEstimateReviewQuestions(estimate, [item({ extraction_status: "unreadable" })])[0].question).toContain("Paint walls"));
  it("prioritizes missing costs", () => expect(buildEstimateReviewQuestions(estimate, [item({ planned_cost: null })])[1].question).toContain("costo planeado"));
  it("uses a useful confirmation for a healthy estimate", () => expect(buildEstimateReviewQuestions(estimate, [item(), item({ id: "m", item_type: "material", planned_cost: 10 })])).toHaveLength(3));
  it("does not invent hidden-cost categories without evidence", () => expect(buildEstimateReviewQuestions(estimate, [item(), item({ id: "m", item_type: "material", planned_cost: 10 })])[1].question).toBe("¿Confirmas que el costo planeado incluye todos los costos de este trabajo?"));
});

describe("projected review financials", () => {
  it("supports negative profit and margin", () => {
    const value = reviewFinancials(estimate, [item({ planned_cost: 120 })]);
    expect(value.profit).toBe(-20);
    expect(value.margin).toBe(-0.2);
  });
  it("returns null margin for zero charge", () => expect(reviewFinancials({ ...estimate, charge_amount: 0 }, [item()]).margin).toBeNull());
  it("does not turn unreadable planned cost into zero", () => expect(reviewFinancials(estimate, [item({ planned_cost: null, extraction_status: "unreadable" })]).profit).toBeNull());
  it("formats USD with currency and cents", () => expect(formatEstimateMoney(6785, "USD")).toBe("$6,785.00"));
  it("formats non-USD with an explicit code and no conversion", () => expect(formatEstimateMoney(15000, "MXN")).toContain("MXN"));
  it("shows human-confirmed state without technical badges", () => expect(humanStatus("confirmed")).toBe("Confirmado"));
  it("maps RPC failures to actionable Spanish messages", () => {
    expect(humanReviewErrorMessage(new Error("invalid_review_item"))).toContain("partidas");
    expect(humanReviewErrorMessage(new Error("estimate_requires_exactly_three_answers"))).toContain("tres preguntas");
    expect(humanReviewErrorMessage(new Error("secret payload"))).toBe("No pudimos guardar la revisión.");
  });
  it("removes the old hidden-cost question after planned cost is supplied", () => {
    const before = buildEstimateReviewQuestions(estimate, [item({ planned_cost: null })])[1].question;
    const after = buildEstimateReviewQuestions(estimate, [item({ planned_cost: 80, extraction_status: "confirmed" })])[1].question;
    expect(before).toContain("costo planeado de");
    expect(after).not.toContain("costo planeado de");
  });
});
