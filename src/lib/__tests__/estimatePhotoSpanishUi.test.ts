import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_INTERNAL_UI_STRINGS,
  estimateStatusLabel,
  extractionStatusLabel,
  itemTypeLabel,
  questionCategoryLabel,
  recommendationCategoryLabel,
} from "@/lib/estimatePhotoI18n";
import { buildEstimateReviewQuestions, humanStatus, type ReviewEstimate, type ReviewItem } from "@/lib/estimatePhotoReview";
import { buildEstimateRecommendations } from "@/lib/estimatePhotoApproval";

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: "i1",
  description_original: "demo",
  description_normalized: "demo",
  quantity: 1,
  unit: "pza",
  client_price: 100,
  planned_cost: null,
  item_type: "material",
  confidence: 0.9,
  extraction_status: "uncertain",
  ...over,
});
const estimate: ReviewEstimate = { id: "e1", title: "Trabajo", charge_amount: 100, status: "needs_answers", currency_code: "USD" };

describe("traducción UI del flujo interno", () => {
  it("traduce estados de extracción, estados de presupuesto, categorías y tipos", () => {
    expect(extractionStatusLabel("confirmed")).toBe("Confirmado");
    expect(extractionStatusLabel("uncertain")).toBe("No estamos seguros");
    expect(extractionStatusLabel("unreadable")).toBe("No se pudo leer");
    expect(extractionStatusLabel("human_corrected")).toBe("Corregido por usuario");
    expect(humanStatus("confirmed")).toBe("Confirmado");
    expect(estimateStatusLabel("draft")).toBe("Borrador");
    expect(estimateStatusLabel("needs_answers")).toBe("Preguntas por responder");
    expect(estimateStatusLabel("reviewed")).toBe("Requiere revisión");
    expect(estimateStatusLabel("approved")).toBe("Aprobado");
    expect(recommendationCategoryLabel("missing_cost")).toBe("Falta costo");
    expect(recommendationCategoryLabel("missing_scope")).toBe("Falta alcance");
    expect(recommendationCategoryLabel("price_opportunity")).toBe("Oportunidad de precio");
    expect(questionCategoryLabel("hidden_cost")).toBe("Costo oculto");
    expect(itemTypeLabel("labor")).toBe("Mano de obra");
  });

  it("nunca devuelve enums técnicos como texto visible", () => {
    const visible = [
      ...["confirmed", "inferred", "uncertain", "unreadable", "human_corrected"].map(extractionStatusLabel),
      ...["draft", "needs_answers", "reviewed", "approved"].map(estimateStatusLabel),
      ...["missing_cost", "missing_scope", "price_opportunity"].map(recommendationCategoryLabel),
      ...buildEstimateRecommendations(estimate, [item()]).flatMap((r) => [recommendationCategoryLabel(r.category), r.title, r.explanation, r.suggestedAction]),
      ...buildEstimateReviewQuestions(estimate, [item()]).flatMap((q) => [q.question, q.reason]),
    ].join(" | ");
    for (const forbidden of FORBIDDEN_INTERNAL_UI_STRINGS) expect(visible).not.toContain(forbidden);
  });

  it("no deja strings técnicos en inglés en la UI interna (fuera del Client Estimate Preview)", () => {
    const sources = [
      "src/components/estimates/EstimatePhotoReview.tsx",
      "src/components/estimates/EstimatePhotoApproval.tsx",
      "src/pages/EstimatePhotoScan.tsx",
    ];
    for (const path of sources) {
      const jsxText = (readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => !line.includes("Client Estimate Preview"))
        .join("\n")
        .match(/>[^<>{}();=]+</g) ?? []).join(" | ");
      for (const forbidden of ["Confirmed", "Uncertain", "Unreadable", "Save review", "Review required", "Human corrected", "Missing cost", "Missing scope", "Price opportunity"]) {
        expect(jsxText, `${path} muestra "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});
