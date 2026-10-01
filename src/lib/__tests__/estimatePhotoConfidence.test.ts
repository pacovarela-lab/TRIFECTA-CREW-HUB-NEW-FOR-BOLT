import { describe, expect, it } from "vitest";
import { approvalErrorMessage, buildEstimateConfidenceSummary } from "@/lib/estimatePhotoConfidence";
import type { ReviewEstimate, ReviewItem } from "@/lib/estimatePhotoReview";

const estimate = (patch: Partial<ReviewEstimate> = {}): ReviewEstimate => ({ id: "e", title: "Pintura", charge_amount: 200, status: "reviewed", human_confirmed_fields: ["charge_amount"], ...patch });
const item = (patch: Partial<ReviewItem> = {}): ReviewItem => ({ id: "i", description_original: "Paint", description_normalized: "Pintar", quantity: 1, unit: "job", client_price: 200, planned_cost: 100, item_type: "labor", confidence: .9, extraction_status: "confirmed", human_confirmed_fields: ["planned_cost"], ...patch });
const answered = [{ answer: "Sí" }, { answer: "Incluido" }, { answer: "Mantener" }];

describe("resumen canónico de confianza", () => {
  it("muestra charge_amount pendiente", () => expect(buildEstimateConfidenceSummary(estimate({ charge_amount: null, human_confirmed_fields: [] }), [item()], answered).lines[0]).toContain("pendiente"));
  it("muestra charge_amount confirmado", () => expect(buildEstimateConfidenceSummary(estimate(), [item()], answered).lines[0]).toContain("confirmado"));
  it("traduce el blocker de planned_cost", () => expect(buildEstimateConfidenceSummary(estimate(), [item({ planned_cost: null })], answered).blockers).toContain("Falta confirmar el costo planeado de 1 partida."));
  it("traduce un conflicto de totales", () => expect(buildEstimateConfidenceSummary(estimate({ human_confirmed_fields: [] }), [item()], answered, ["conflicting_total_candidates: 100 | 200"]).blockers[0]).toContain("dos totales distintos"));
  it("muestra una partida incierta", () => expect(buildEstimateConfidenceSummary(estimate(), [item({ extraction_status: "uncertain" })], answered).blockers).toContain("1 partida sigue incierta."));
  it("muestra una partida no legible", () => expect(buildEstimateConfidenceSummary(estimate(), [item({ extraction_status: "unreadable" })], answered).blockers).toContain("1 partida no se pudo leer."));
  it("bloquea cuando faltan las tres respuestas", () => expect(buildEstimateConfidenceSummary(estimate({ status: "needs_answers" }), [item()], [{ answer: null }, { answer: "" }, { answer: " " }]).blockers).toContain("Falta responder 3 de las 3 preguntas de revisión."));
  it("muestra Todo listo para aprobar para el estado limpio", () => {
    const summary = buildEstimateConfidenceSummary(estimate(), [item()], answered);
    expect(summary.ready).toBe(true);
    expect(summary.lines).toContain("0 conflictos");
    expect(summary.lines).toContain("3 de 3 preguntas respondidas");
  });
  it("traduce blockers del backend sin mostrar enums técnicos", () => {
    expect(approvalErrorMessage(new Error("material_monetary_uncertainty_unresolved"))).toContain("partidas inciertas");
    expect(approvalErrorMessage(new Error("estimate_requires_reviewed_status"))).toContain("tres preguntas");
    expect(approvalErrorMessage(new Error("estimate_approval_forbidden"))).toContain("permiso");
  });
});
