import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildEstimateConfidenceSummary } from "@/lib/estimatePhotoConfidence";
import {
  applyReviewOrder,
  buildEstimateReviewPriorities,
  countReviewPriorities,
  getNextReviewIssue,
  mapConfidenceIssueToPriority,
  reviewOrderIsStale,
  sortReviewItemsByPriority,
} from "@/lib/estimatePhotoReviewPriority";
import type { ReviewEstimate, ReviewItem } from "@/lib/estimatePhotoReview";

const estimate = (patch: Partial<ReviewEstimate> = {}): ReviewEstimate => ({
  id: "e",
  title: "Pintura interior",
  charge_amount: 200,
  status: "reviewed",
  human_confirmed_fields: ["charge_amount"],
  ...patch,
});

const item = (patch: Partial<ReviewItem> = {}): ReviewItem => ({
  id: "i",
  description_original: "Paint walls",
  description_normalized: "Pintar paredes",
  quantity: 1,
  unit: "trabajo",
  client_price: 200,
  planned_cost: 100,
  item_type: "labor",
  confidence: 0.9,
  extraction_status: "confirmed",
  human_confirmed_fields: ["description", "quantity", "unit", "client_price", "planned_cost"],
  ...patch,
});

const questions = [
  { id: "q1", category: "scope" as const, answer: "Sí" },
  { id: "q2", category: "hidden_cost" as const, answer: "No" },
  { id: "q3", category: "profitability" as const, answer: "Correcta" },
];
const reviewSource = readFileSync("src/components/estimates/EstimatePhotoReview.tsx", "utf8");

describe("prioridad estructural de Foto de presupuesto AI", () => {
  it("no salta una ALTA aunque se solicite siguiente repetidamente", () => {
    const issues = buildEstimateReviewPriorities(
      estimate({ charge_amount: null, human_confirmed_fields: [] }),
      [item()],
      [{ ...questions[0], answer: null }, questions[1], questions[2]],
      [],
      ["Nota"],
    );
    expect([getNextReviewIssue(issues)?.id, getNextReviewIssue(issues)?.id, getNextReviewIssue(issues)?.id]).toEqual([
      "estimate:charge_amount",
      "estimate:charge_amount",
      "estimate:charge_amount",
    ]);
  });

  it("no hace loop: al resolver ALTA, MEDIA y BAJA termina en null", () => {
    const high = buildEstimateReviewPriorities(estimate({ charge_amount: null, human_confirmed_fields: [] }), [item()], [{ ...questions[0], answer: null }, questions[1], questions[2]], [], ["Nota"]);
    const medium = buildEstimateReviewPriorities(estimate(), [item()], [{ ...questions[0], answer: null }, questions[1], questions[2]], [], ["Nota"]);
    const low = buildEstimateReviewPriorities(estimate(), [item()], questions, [], ["Nota"]);
    const done = buildEstimateReviewPriorities(estimate(), [item()], questions);
    expect(getNextReviewIssue(high)?.priority).toBe("high");
    expect(getNextReviewIssue(medium)?.priority).toBe("medium");
    expect(getNextReviewIssue(low)?.priority).toBe("low");
    expect(getNextReviewIssue(done)).toBeNull();
  });

  it("mantiene client_price ALTA al confirmar solo planned_cost", () => {
    const uncertain = item({ extraction_status: "uncertain", human_confirmed_fields: [] });
    const initial = buildEstimateReviewPriorities(estimate(), [uncertain], questions);
    expect(initial).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "item:i:planned_cost", priority: "high" }),
      expect.objectContaining({ id: "item:i:client_price", priority: "high" }),
    ]));

    const after = buildEstimateReviewPriorities(estimate(), [{ ...uncertain, human_confirmed_fields: ["planned_cost"] }], questions);
    expect(after.some(({ id }) => id === "item:i:planned_cost")).toBe(false);
    expect(after).toContainEqual(expect.objectContaining({ id: "item:i:client_price", priority: "high" }));
  });

  it("confirmar client_price no resuelve descripción, cantidad ni unidad", () => {
    const issues = buildEstimateReviewPriorities(estimate(), [item({ extraction_status: "uncertain", human_confirmed_fields: ["client_price", "planned_cost"] })], questions);
    expect(issues.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "item:i:description",
      "item:i:quantity",
      "item:i:unit",
    ]));
  });

  it("no crea issue para un título válido aunque no esté confirmado", () => {
    const issues = buildEstimateReviewPriorities(estimate({ human_confirmed_fields: ["charge_amount"] }), [item()], questions);
    expect(issues.some(({ id }) => id === "estimate:title")).toBe(false);
  });

  it("si confidence está listo no produce issues bloqueantes", () => {
    const confidence = buildEstimateConfidenceSummary(estimate(), [item()], questions);
    const issues = buildEstimateReviewPriorities(estimate(), [item()], questions);
    expect(confidence.ready).toBe(true);
    expect(confidence.blockers).toHaveLength(0);
    expect(issues.filter(({ blocking }) => blocking)).toHaveLength(0);
  });

  it("un blocker desconocido nunca desaparece silenciosamente", () => {
    const issue = mapConfidenceIssueToPriority({ code: "future_approval_blocker", id: "approval:future", blocking: true }, []);
    expect(issue).toMatchObject({ priority: "high", label: "Hay un asunto pendiente antes de aprobar", targetId: "review-summary" });
  });

  it("respeta el ranking charge, conflicto, costo, precio de partida, scope y notas", () => {
    const issues = buildEstimateReviewPriorities(
      estimate({ charge_amount: null, human_confirmed_fields: [] }),
      [item({ planned_cost: null, extraction_status: "uncertain", human_confirmed_fields: ["quantity", "unit"] })],
      questions,
      ["conflicting_total_candidates: 100 | 200"],
      ["Nota"],
    );
    expect(issues.slice(0, 5).map(({ id }) => id)).toEqual([
      "estimate:charge_amount",
      "warning:conflicting_total",
      "item:i:planned_cost",
      "item:i:client_price",
      "item:i:description",
    ]);
    expect(issues[5]).toMatchObject({ priority: "low", id: expect.stringMatching(/^observation:/) });
  });

  it("ordena visualmente sin mutar el orden persistido de partidas", () => {
    const clean = item({ id: "clean" });
    const critical = item({ id: "critical", planned_cost: null });
    const source = [clean, critical];
    const issues = buildEstimateReviewPriorities(estimate(), source, questions);
    expect(sortReviewItemsByPriority(source, issues).map(({ id }) => id)).toEqual(["critical", "clean"]);
    expect(source.map(({ id }) => id)).toEqual(["clean", "critical"]);
  });

  it("mantiene la posición visual durante una edición de múltiples caracteres", () => {
    const clean = item({ id: "a" });
    const editing = item({ id: "b", planned_cost: null, human_confirmed_fields: [] });
    const persistedItems = [clean, editing];
    const loadedIssues = buildEstimateReviewPriorities(estimate(), persistedItems, questions);
    const capturedOrder = sortReviewItemsByPriority(persistedItems, loadedIssues).map(({ id }) => id);

    for (const plannedCost of [1, 10, 100, 1000]) {
      const currentItems = persistedItems.map((current) => current.id === "b" ? { ...current, planned_cost: plannedCost } : current);
      expect(applyReviewOrder(currentItems, capturedOrder).map(({ id }) => id)).toEqual(["b", "a"]);
    }
    expect(persistedItems.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("conserva identidad de inputs y siblings al aplicar el orden capturado", () => {
    const sibling = item({ id: "a" });
    const edited = item({ id: "b", planned_cost: 1000 });
    const visual = applyReviewOrder([sibling, edited], ["b", "a"]);
    expect(visual[0]).toBe(edited);
    expect(visual[1]).toBe(sibling);
  });

  it("recalcula el ranking al recargar sin persistir el orden visual", () => {
    const first = item({ id: "a", planned_cost: null, human_confirmed_fields: [] });
    const second = item({ id: "b" });
    const persistedItems = [first, second];
    const initial = sortReviewItemsByPriority(persistedItems, buildEstimateReviewPriorities(estimate(), persistedItems, questions));
    const reloadedItems = [item({ id: "a" }), item({ id: "b", client_price: null, human_confirmed_fields: [] })];
    const reloaded = sortReviewItemsByPriority(reloadedItems, buildEstimateReviewPriorities(estimate(), reloadedItems, questions));
    expect(initial.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(reloaded.map(({ id }) => id)).toEqual(["b", "a"]);
    expect(persistedItems.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("activeIssueId no participa en la elección del siguiente asunto", () => {
    const issues = buildEstimateReviewPriorities(estimate({ charge_amount: null, human_confirmed_fields: [] }), [item()], questions);
    const activeIssueId = "item:i:description";
    expect(activeIssueId).not.toBe(getNextReviewIssue(issues)?.id);
    expect(getNextReviewIssue(issues)?.id).toBe("estimate:charge_amount");
  });

  it("la UI siempre calcula siguiente desde issues actuales y no confirma el item completo", () => {
    expect(reviewSource).toContain("focusIssue(getNextReviewIssue(priorityIssues))");
    expect(reviewSource).not.toContain("getNextReviewIssue(priorityIssues, activeIssueId");
    expect(reviewSource).not.toContain('extraction_status: confirmedField ? "confirmed"');
    expect(reviewSource).toContain("priorityIssues.slice(0, 3)");
  });

  it("representa preguntas canónicas faltantes en lugar de perder el blocker", () => {
    const confidence = buildEstimateConfidenceSummary(estimate(), [item()], []);
    const issues = buildEstimateReviewPriorities(estimate(), [item()], []);
    expect(confidence.ready).toBe(false);
    expect(confidence.reviewIssues.filter(({ code }) => code === "unanswered_question")).toHaveLength(3);
    expect(issues.filter(({ id }) => id.startsWith("question:missing:"))).toHaveLength(3);
  });

  it("mantiene identidades estables para observaciones sin usar índices visuales", () => {
    const first = buildEstimateReviewPriorities(estimate(), [item()], questions, [], ["Nota estable"]);
    const second = buildEstimateReviewPriorities(estimate(), [item()], questions, [], ["Otra", "Nota estable"]);
    expect(second.map(({ id }) => id)).toContain(first[0].id);
  });

  it("un estado limpio produce cero issues y navegación deshabilitable", () => {
    const issues = buildEstimateReviewPriorities(estimate(), [item()], questions);
    expect(countReviewPriorities(issues)).toEqual({ high: 0, medium: 0, low: 0 });
    expect(getNextReviewIssue(issues)).toBeNull();
  });
});

describe("orden visual congelado", () => {
  const item = (id: string) => ({ id, description_normalized: id, unit: null, quantity: null, planned_cost: null, client_price: null } as never);
  it("mantiene la posición aunque cambien las prioridades mientras se escribe", () => {
    const items = [item("a"), item("b")];
    const frozen = ["b", "a"];
    expect(reviewOrderIsStale(items, frozen)).toBe(false);
    expect(applyReviewOrder(items, frozen).map((row: { id: string }) => row.id)).toEqual(["b", "a"]);
  });
  it("recalcula cuando cambia el conjunto de partidas", () => {
    expect(reviewOrderIsStale([item("a"), item("c")], ["b", "a"])).toBe(true);
    expect(reviewOrderIsStale([item("a")], ["a", "b"])).toBe(true);
  });
  it("coloca al final las partidas sin posición conocida", () => {
    expect(applyReviewOrder([item("a"), item("z")], ["z"]).map((row: { id: string }) => row.id)).toEqual(["z", "a"]);
  });
});

describe("costo interno ausente en el documento", () => {
  const base = (over: Partial<ReviewItem> = {}): ReviewItem => ({
    id: "i", description_original: "Paint", description_normalized: "Pintar", quantity: 1, unit: "job",
    client_price: 200, planned_cost: null, item_type: "labor", confidence: 0.9, extraction_status: "confirmed",
    source_text: "Paint walls 200", human_confirmed_fields: ["description", "quantity", "unit", "client_price"], ...over,
  });
  const qs = [
    { id: "q1", category: "scope" as const, answer: "si" },
    { id: "q2", category: "hidden_cost" as const, answer: "si" },
    { id: "q3", category: "profitability" as const, answer: "si" },
  ];
  const est = { id: "e", title: "T", charge_amount: 1000, status: "reviewed", currency_code: "USD", human_confirmed_fields: ["charge_amount"] };

  it("baja a prioridad media cuando la partida se leyó bien y el costo no está en la foto", () => {
    const [issue] = buildEstimateReviewPriorities(est, [base()], qs);
    expect(issue).toMatchObject({ id: "item:i:planned_cost", priority: "medium", blocking: true });
    expect(issue.label).toContain("costo interno");
  });

  it("mantiene prioridad alta si la partida se leyó con incertidumbre", () => {
    const issues = buildEstimateReviewPriorities(est, [base({ extraction_status: "uncertain" })], qs);
    expect(issues.find((i) => i.id === "item:i:planned_cost")).toMatchObject({ priority: "high" });
  });

  it("mantiene prioridad alta si el documento sí menciona un costo", () => {
    const issues = buildEstimateReviewPriorities(est, [base({ source_text: "Paint walls cost 120" })], qs);
    expect(issues.find((i) => i.id === "item:i:planned_cost")).toMatchObject({ priority: "high" });
  });
});
