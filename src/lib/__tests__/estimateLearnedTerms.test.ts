import { describe, expect, it } from "vitest";
import {
  LEARNABLE_FIELDS,
  NON_LEARNABLE_FIELDS,
  applySuggestionConfirmedFields,
  buildLearnedSuggestion,
  canPrefill,
  learnedEventIdentity,
  learnedSuggestionHeadline,
  cleanTermValue,
  collectLearnableCorrections,
  buildManualLearnedCorrection,
  isLearnableField,
  isLearnableValue,
  learnedSuggestionTrace,
  normalizeTermKey,
  suggestionStrength,
  type LearnedBaseline,
  type LearnedTermRow,
} from "@/lib/estimateLearnedTerms";

const baseline: LearnedBaseline = {
  title: "bathrm remodel",
  items: { "item-1": { description: "demolsh", unit: "sq ft" } },
};
const current = (over: Partial<{ id: string; title: string; description: string; unit: string; itemConfirmed: string[]; estimateConfirmed: string[] }> = {}) => ({
  id: over.id ?? "est-1",
  title: over.title ?? "bathrm remodel",
  human_confirmed_fields: over.estimateConfirmed ?? [],
  items: [{
    id: "item-1",
    description_normalized: over.description ?? "demolsh",
    unit: over.unit ?? "sq ft",
    human_confirmed_fields: over.itemConfirmed ?? [],
  }],
});

const term = (over: Partial<LearnedTermRow> = {}): LearnedTermRow => ({
  id: "t1", observed_term: "demolsh", normalized_term: "demolition", term_type: "alias", confirmations: 1, is_active: true, ...over,
});

describe("aprendizaje de correcciones humanas — captura", () => {
  it("solo aprende tras corrección + confirmación explícita", () => {
    const learned = collectLearnableCorrections(baseline, current({ description: "demolition", itemConfirmed: ["description"] }));
    expect(learned).toEqual([{ observed_term: "demolsh", corrected_term: "demolition", term_type: "alias", target_id: "item-1" }]);
  });

  it("editar sin confirmar no aprende", () => {
    expect(collectLearnableCorrections(baseline, current({ description: "demolition" }))).toEqual([]);
  });

  it("valor solo-AI sin corrección no aprende aunque esté confirmado", () => {
    expect(collectLearnableCorrections(baseline, current({ itemConfirmed: ["description"], estimateConfirmed: ["title"] }))).toEqual([]);
  });

  it("aprende unidad pero nunca título, aunque ambos se confirmen", () => {
    const learned = collectLearnableCorrections(baseline, current({
      title: "bathroom remodel", estimateConfirmed: ["title"],
      unit: "pie2", itemConfirmed: ["unit"],
    }));
    expect(learned).toEqual([{ observed_term: "sq ft", corrected_term: "pie2", term_type: "unit", target_id: "item-1" }]);
  });

  it("normaliza espacios y mayúsculas: 'Dry Wall' y ' dry   wall ' comparten clave", () => {
    expect(normalizeTermKey(" dry   wall ")).toBe("dry wall");
    expect(normalizeTermKey("Dry Wall")).toBe("dry wall");
    expect(cleanTermValue("  Dry   Wall ")).toBe("Dry Wall");
    const learned = collectLearnableCorrections(
      { title: null, items: { "item-1": { description: "Dry Wall", unit: null } } },
      current({ description: " dry   wall ", itemConfirmed: ["description"] }),
    );
    expect(learned).toEqual([]);
  });

  it("nunca aprende valores financieros ni numéricos", () => {
    expect(isLearnableValue("$6,785.00")).toBe(false);
    expect(isLearnableValue("12")).toBe(false);
    const learned = collectLearnableCorrections(
      { title: null, items: { "item-1": { description: "600", unit: null } } },
      current({ description: "6785", itemConfirmed: ["description"] }),
    );
    expect(learned).toEqual([]);
    for (const field of ["charge_amount", "planned_cost", "client_price", "quantity", "currency_code"]) {
      expect(isLearnableField(field)).toBe(false);
    }
  });

  it("campos de cliente/PII quedan fuera del catálogo aprendible", () => {
    for (const field of ["client_name", "address", "phone", "email"]) {
      expect(NON_LEARNABLE_FIELDS).toContain(field);
      expect(isLearnableField(field)).toBe(false);
    }
    expect([...LEARNABLE_FIELDS]).toEqual(["description", "unit"]);
    expect(isLearnableField("title")).toBe(false);
  });
});

describe("aprendizaje de correcciones humanas — aplicación", () => {
  it("propone la corrección aprendida con procedencia auditable", () => {
    const suggestion = buildLearnedSuggestion("Demolsh", "description", "item-9", [term()]);
    expect(suggestion).toMatchObject({ suggested: "demolition", provenance: "learned_term", conflict: false, confirmations: 1, strength: "suggested" });
    expect(learnedSuggestionTrace(suggestion!)).toContain("1 confirmación");
  });

  it("umbral determinista: 1 confirmación sugiere, 2+ recomienda, nunca aprueba", () => {
    expect(suggestionStrength(1)).toBe("suggested");
    expect(suggestionStrength(2)).toBe("recommended");
    expect(suggestionStrength(9)).toBe("recommended");
    expect(canPrefill(buildLearnedSuggestion("demolsh", "description", "i", [term()])!)).toBe(false);
    expect(canPrefill(buildLearnedSuggestion("demolsh", "description", "i", [term({ confirmations: 3 })])!)).toBe(false);
  });

  it("no hace fuzzy matching: 'paint' no recibe la corrección de 'painter'", () => {
    const terms = [term({ observed_term: "painter", normalized_term: "pintor" })];
    expect(buildLearnedSuggestion("paint", "description", "i", terms)).toBeNull();
    expect(buildLearnedSuggestion("painter", "description", "i", terms)).not.toBeNull();
  });

  it("ignora términos desactivados y tipos distintos", () => {
    expect(buildLearnedSuggestion("demolsh", "description", "i", [term({ is_active: false })])).toBeNull();
    expect(buildLearnedSuggestion("demolsh", "unit", "i", [term()])).toBeNull();
  });

  it("dos correcciones distintas del mismo término marcan conflicto y no auto-aplican", () => {
    const suggestion = buildLearnedSuggestion("demo", "description", "i", [
      term({ id: "a", observed_term: "demo", normalized_term: "demolition", confirmations: 3 }),
      term({ id: "b", observed_term: "demo", normalized_term: "demonstration", confirmations: 1 }),
    ])!;
    expect(suggestion.conflict).toBe(true);
    expect(suggestion.suggested).toBeNull();
    expect(suggestion.termId).toBeNull();
    expect(suggestion.options.sort()).toEqual(["demolition", "demonstration"]);
    expect(canPrefill(suggestion)).toBe(false);
  });

  it("aplicar una sugerencia nunca deja el campo como human-confirmed", () => {
    expect(applySuggestionConfirmedFields(["description", "quantity"], "description")).toEqual(["quantity"]);
    expect(applySuggestionConfirmedFields(undefined, "unit")).toEqual([]);
  });
});

describe("aislamiento entre empresas", () => {
  const companyATerms: (LearnedTermRow & { company_id: string })[] = [{ ...term({ id: "a1" }), company_id: "company-a" }];
  const companyBTerms: (LearnedTermRow & { company_id: string })[] = [];

  it("los términos de la empresa A no influyen en la empresa B", () => {
    expect(buildLearnedSuggestion("demolsh", "description", "i", companyATerms)?.suggested).toBe("demolition");
    expect(buildLearnedSuggestion("demolsh", "description", "i", companyBTerms)).toBeNull();
  });

  it("una corrección se registra siempre contra el presupuesto y la empresa que la originó", () => {
    const learned = collectLearnableCorrections(baseline, current({ description: "demolition", itemConfirmed: ["description"] }));
    expect(learned).toHaveLength(1);
    // El company_id lo asigna el servidor desde el estimate; el cliente nunca lo envía.
    expect(Object.keys(learned[0])).toEqual(["observed_term", "corrected_term", "term_type", "target_id"]);
  });
});

describe("aprendizaje manual explícito", () => {
  it("aprende sin confirmación cuando hay una corrección real de texto", () => {
    expect(buildManualLearnedCorrection("demolition", "Demolición", "description", "item-1")).toEqual({
      observed_term: "demolition", corrected_term: "Demolición", term_type: "alias", target_id: "item-1",
    });
  });
  it("no aprende sin cambio real", () => expect(buildManualLearnedCorrection("pintura", " Pintura ", "description", "item-1")).toBeNull());
  it("no aprende valores vacíos, numéricos o PII", () => {
    expect(buildManualLearnedCorrection("", "algo", "description", "item-1")).toBeNull();
    expect(buildManualLearnedCorrection("1200", "1300", "description", "item-1")).toBeNull();
    expect(buildManualLearnedCorrection("juan", "juan@mail.com", "description", "item-1")).toBeNull();
  });
  it("aprende unidades como term_type unit", () => expect(buildManualLearnedCorrection("sqft", "pie2", "unit", "item-2")?.term_type).toBe("unit"));
  it("es idempotente por identidad de evento", () => {
    const a = buildManualLearnedCorrection("demolition", "Demolición", "description", "item-1")!;
    const b = buildManualLearnedCorrection(" DEMOLITION ", "demolición", "description", "item-1")!;
    expect(learnedEventIdentity(a)).toBe(learnedEventIdentity(b));
  });
});

describe("mejora #3 — coincidencia normalizada (sin fuzzy, sin auto-aplicar)", () => {
  const row = (observed: string, corrected: string, confirmations = 1): LearnedTermRow => ({
    id: `t-${observed}`, observed_term: observed, normalized_term: corrected,
    term_type: "alias", confirmations, is_active: true,
  });

  it("acentos y puntuación no rompen la coincidencia", () => {
    const suggestion = buildLearnedSuggestion("Dry-Wall.", "description", "i", [row("dry wall", "Drywall repair")]);
    expect(suggestion?.suggested).toBe("Drywall repair");
    expect(suggestion?.matchType).toBe("normalized");
    expect(learnedSuggestionTrace(suggestion!)).toContain("coincidencia normalizada");
  });

  it("la coincidencia exacta sigue marcándose como exacta", () => {
    const suggestion = buildLearnedSuggestion(" dry   wall ", "description", "i", [row("Dry Wall", "Drywall repair")]);
    expect(suggestion?.matchType).toBe("exact");
    expect(learnedSuggestionTrace(suggestion!)).not.toContain("coincidencia normalizada");
  });

  it("no hay fuzzy ni semántica: 'drywall repair' no coincide con 'wall repair'", () => {
    expect(buildLearnedSuggestion("wall repair", "description", "i", [row("drywall repair", "Drywall")])).toBeNull();
    expect(buildLearnedSuggestion("painter", "description", "i", [row("paint", "Pintura")])).toBeNull();
  });

  it("no sugiere un cambio que solo difiere en puntuación/acentos", () => {
    expect(buildLearnedSuggestion("Pintura interior", "description", "i", [row("pintura interior", "Pintura, interior")])).toBeNull();
  });

  it("la sugerencia normalizada nunca se aplica sola", () => {
    const suggestion = buildLearnedSuggestion("Dry-Wall.", "description", "i", [row("dry wall", "Drywall repair", 5)])!;
    expect(canPrefill(suggestion)).toBe(false);
  });
});
