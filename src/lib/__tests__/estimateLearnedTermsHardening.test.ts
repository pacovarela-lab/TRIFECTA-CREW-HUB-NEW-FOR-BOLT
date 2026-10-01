import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySuggestionConfirmedFields,
  buildLearnedSuggestion,
  canPrefill,
  collectLearnableCorrections,
  isLearnableValue,
  learnedEventIdentity,
  learnedSuggestionHeadline,
  saveReviewThenLearn,
  type LearnedTermInput,
  type LearnedTermRow,
} from "@/lib/estimateLearnedTerms";

/**
 * Espejo determinista en TS de `record_estimate_learned_terms` (ver
 * scripts/estimate-learned-terms-hardening.pending.sql): la identidad del evento humano
 * es (company, actor, estimate, objetivo, campo, observado→corregido) y solo un evento NUEVO
 * puede mover el contador.
 */
type Ctx = { company: string; user: string; estimate: string };
class LearnedStore {
  events = new Map<string, { slot: string; corrected: string; active: boolean }>();
  terms = new Map<string, { corrected: string; confirmations: number }>();
  record(ctx: Ctx, terms: LearnedTermInput[]) {
    for (const term of terms) {
      const eventKey = `${ctx.company}::${ctx.user}::${ctx.estimate}::${learnedEventIdentity(term)}`;
      if (this.events.get(eventKey)?.active) continue;
      const slot = `${ctx.company}::${ctx.user}::${ctx.estimate}::${term.target_id}::${term.term_type}::${term.observed_term.toLowerCase()}`;
      for (const event of this.events.values()) if (event.slot === slot) event.active = false;
      this.events.set(eventKey, { slot, corrected: term.corrected_term.toLowerCase(), active: true });
      this.recount(ctx.company, ctx.user, term.term_type, term.observed_term);
    }
  }
  recount(company: string, user: string, type: string, observed: string) {
    const prefix = `${company}::${user}::${type}::${observed.toLowerCase()}::`;
    for (const key of [...this.terms.keys()]) if (key.startsWith(prefix)) this.terms.delete(key);
    for (const event of this.events.values()) if (event.active && event.slot.startsWith(`${company}::${user}::`) && event.slot.endsWith(`::${type}::${observed.toLowerCase()}`)) {
      const key = `${prefix}${event.corrected}`;
      this.terms.set(key, { corrected: event.corrected, confirmations: (this.terms.get(key)?.confirmations ?? 0) + 1 });
    }
  }
  count(company: string, user: string, type: string, observed: string) {
    return [...this.terms.entries()].filter(([key]) => key.startsWith(`${company}::${user}::${type}::${observed.toLowerCase()}::`))
      .reduce((sum, [, value]) => sum + value.confirmations, 0);
  }
}

const ctxA: Ctx = { company: "c1", user: "u1", estimate: "est-1" };
const correction = (over: Partial<LearnedTermInput> = {}): LearnedTermInput => ({
  observed_term: "demolsh", corrected_term: "demolition", term_type: "alias", target_id: "item-1", ...over,
});

describe("idempotencia real del aprendizaje", () => {
  it("A. el mismo save dos veces cuenta una sola confirmación", () => {
    const store = new LearnedStore();
    store.record(ctxA, [correction()]);
    store.record(ctxA, [correction()]);
    expect(store.count("c1", "u1", "alias", "demolsh")).toBe(1);
  });

  it("B. un retry del RPC (misma carga) no infla el contador", () => {
    const store = new LearnedStore();
    for (let attempt = 0; attempt < 5; attempt += 1) store.record(ctxA, [correction()]);
    expect(store.count("c1", "u1", "alias", "demolsh")).toBe(1);
  });

  it("C. reload + save del mismo estimate sigue en 1", () => {
    const store = new LearnedStore();
    store.record(ctxA, [correction()]);
    // Tras recargar, la baseline ya trae el valor corregido: el cliente no envía nada…
    store.record(ctxA, collectLearnableCorrections(
      { title: null, items: { "item-1": { description: "demolition", unit: null } } },
      { id: "est-1", title: null, items: [{ id: "item-1", description_normalized: "demolition", unit: null, human_confirmed_fields: ["description"] }] },
    ));
    // …y aunque un cliente modificado reenviara la misma evidencia, el servidor la ignora.
    store.record(ctxA, [correction()]);
    expect(store.count("c1", "u1", "alias", "demolsh")).toBe(1);
  });

  it("D. la misma corrección en OTRO estimate sí suma una confirmación", () => {
    const store = new LearnedStore();
    store.record(ctxA, [correction()]);
    store.record({ ...ctxA, estimate: "est-2" }, [correction({ target_id: "item-9" })]);
    expect(store.count("c1", "u1", "alias", "demolsh")).toBe(2);
  });

  it("E. otra partida del mismo estimate es otro evento humano y suma", () => {
    const store = new LearnedStore();
    store.record(ctxA, [correction(), correction({ target_id: "item-2" })]);
    expect(store.count("c1", "u1", "alias", "demolsh")).toBe(2);
    store.record(ctxA, [correction(), correction({ target_id: "item-2" })]);
    expect(store.count("c1", "u1", "alias", "demolsh")).toBe(2);
  });

  it("F. cambiar A→B por A→C reemplaza la asociación y no infla B", () => {
    const store = new LearnedStore();
    store.record(ctxA, [correction()]);
    store.record(ctxA, [correction({ corrected_term: "demolition and haul" })]);
    expect(store.count("c1", "u1", "alias", "demolsh")).toBe(1);
    expect([...store.terms.values()]).toEqual([{ corrected: "demolition and haul", confirmations: 1 }]);
  });

  it("la identidad del evento distingue objetivo, campo y par observado/corregido", () => {
    const base = correction();
    expect(learnedEventIdentity(base)).toBe(learnedEventIdentity({ ...base, observed_term: " DEMOLSH " }));
    expect(learnedEventIdentity(base)).not.toBe(learnedEventIdentity({ ...base, target_id: "item-2" }));
    expect(learnedEventIdentity(base)).not.toBe(learnedEventIdentity({ ...base, corrected_term: "demo" }));
  });
});

describe("una sugerencia aprendida nunca se aplica sola", () => {
  const suggestionWith = (confirmations: number) =>
    buildLearnedSuggestion("demolsh", "description", "item-1", [{
      id: "t1", observed_term: "demolsh", normalized_term: "demolition", term_type: "alias", confirmations, is_active: true,
    } satisfies LearnedTermRow])!;

  it("ni con 1, ni con 2, ni con 10 confirmaciones se pre-rellena", () => {
    for (const confirmations of [1, 2, 10, 100]) expect(canPrefill(suggestionWith(confirmations))).toBe(false);
  });

  it("las confirmaciones solo cambian el texto mostrado", () => {
    expect(learnedSuggestionHeadline(suggestionWith(1))).toContain("Sugerencia aprendida");
    expect(learnedSuggestionHeadline(suggestionWith(4))).toContain("Sugerencia frecuente");
  });

  it("guardar sin pulsar “Usar sugerencia” deja intacto el valor original", () => {
    const baseline = { title: null, items: { "item-1": { description: "demolsh", unit: "sq ft" } } };
    const learned = collectLearnableCorrections(baseline, {
      id: "est-1", title: null,
      items: [{ id: "item-1", description_normalized: "demolsh", unit: "sq ft", human_confirmed_fields: ["description"] }],
    });
    expect(learned).toEqual([]); // el valor canónico no cambió: no hay evidencia humana
  });

  it("aplicar la sugerencia cambia solo ese campo y no lo deja human-confirmed", () => {
    const suggestion = suggestionWith(7);
    const item = { id: "item-1", description_normalized: "demolsh", unit: "sq ft", human_confirmed_fields: ["description", "unit"] };
    const applied = { ...item, description_normalized: suggestion.suggested!, human_confirmed_fields: applySuggestionConfirmedFields(item.human_confirmed_fields, "description") };
    expect(applied.description_normalized).toBe("demolition");
    expect(applied.unit).toBe("sq ft"); // campo hermano intacto
    expect(applied.human_confirmed_fields).toEqual(["unit"]);
  });
});

describe("conflictos: solo entre evidencias activas distintas", () => {
  // Correcciones distintas pueden permanecer activas cuando proceden de evidencias humanas
  // vigentes distintas; cambiar el mismo slot supersede la anterior.
  const rowsSameUser: LearnedTermRow[] = [
    { id: "a", observed_term: "demo", normalized_term: "demonstration", term_type: "alias", confirmations: 1, is_active: true },
  ];
  const rowsTwoUsers: LearnedTermRow[] = [
    { id: "a", observed_term: "demo", normalized_term: "demolition", term_type: "alias", confirmations: 3, is_active: true },
    { id: "b", observed_term: "demo", normalized_term: "demonstration", term_type: "alias", confirmations: 1, is_active: true },
  ];

  it("una sola alternativa activa no genera conflicto", () => {
    const suggestion = buildLearnedSuggestion("demo", "description", "i", rowsSameUser)!;
    expect(suggestion.conflict).toBe(false);
    expect(suggestion.suggested).toBe("demonstration");
  });

  it("dos usuarios de la misma empresa sí generan conflicto y no se auto-aplica", () => {
    const suggestion = buildLearnedSuggestion("demo", "description", "i", rowsTwoUsers)!;
    expect(suggestion.conflict).toBe(true);
    expect(suggestion.suggested).toBeNull();
    expect(canPrefill(suggestion)).toBe(false);
    expect(suggestion.options.sort()).toEqual(["demolition", "demonstration"]);
  });

  it("un término desactivado deja de participar en el conflicto", () => {
    const suggestion = buildLearnedSuggestion("demo", "description", "i", rowsTwoUsers.map((row) => row.id === "b" ? { ...row, is_active: false } : row))!;
    expect(suggestion.conflict).toBe(false);
    expect(suggestion.suggested).toBe("demolition");
  });
});

describe("PII y valores financieros quedan fuera, también en el servidor", () => {
  it("el cliente descarta email, teléfono, IDs largos y dinero", () => {
    for (const value of ["cliente@ejemplo.com", "808-555-1234", "1234567", "$6,785.00", "6785", "1 200.00"]) {
      expect(isLearnableValue(value)).toBe(false);
    }
    expect(isLearnableValue("demolition")).toBe(true);
  });

  it("la migración pendiente replica el rechazo server-side y el menor privilegio", () => {
    const sql = readFileSync("supabase/migrations/20260904140000_estimate_learned_corrections_hardening.sql", "utf8");
    expect(sql).toContain("estimate_learned_term_events_identity_uniq");
    expect(sql).toContain("revoke all privileges on public.estimate_learned_terms from authenticated, anon");
    expect(sql).toContain("grant select on public.estimate_learned_terms to authenticated");
    expect(sql).toContain("drop function if exists public.touch_estimate_learned_term(uuid)");
    expect(sql).toContain("estimate_learned_term_events_active_slot_uniq");
    expect(sql).toContain("estimate_learned_terms_correction_uniq");
    expect(sql).toContain("i.estimate_id = _estimate.id");
    expect(sql).toContain("revoke all on public.estimate_learned_term_events from authenticated, anon");
    expect(sql).toMatch(/@\[\[:alnum:\]\.-\]\+/); // email
    expect(sql).toContain("[0-9]{5,}"); // IDs y números largos
    expect(sql).toContain("(https?://|www\\.)");
    expect(sql).toContain("_type not in ('alias','unit')");
    expect(sql).toContain("'manager'::app_role"); // administrar términos: manager/admin
    expect(sql).toContain("and e.corrected_key = lower(_corrected) and e.is_active"); // no-op exacto
  });
});

describe("el aprendizaje es secundario al guardado humano", () => {
  it("conserva el review cuando learning falla y no reejecuta el save", async () => {
    let persisted = "antes";
    let reviewCalls = 0;
    let learningCalls = 0;
    const result = await saveReviewThenLearn(
      async () => { reviewCalls += 1; persisted = "corregido"; return {}; },
      async () => { learningCalls += 1; return { error: new Error("learning unavailable") }; },
    );
    expect(result.learningFailed).toBe(true);
    expect(persisted).toBe("corregido");
    expect(reviewCalls).toBe(1);
    expect(learningCalls).toBe(1);
  });

  it("si el review falla no intenta learning", async () => {
    let learningCalls = 0;
    await expect(saveReviewThenLearn(
      async () => ({ error: new Error("review rejected") }),
      async () => { learningCalls += 1; return {}; },
    )).rejects.toThrow("review rejected");
    expect(learningCalls).toBe(0);
  });
});
