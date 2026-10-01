/**
 * Memoria estructurada de correcciones humanas para Foto de presupuesto AI.
 *
 * Reglas duras de V1 (deterministas, sin ML, sin embeddings, sin fuzzy matching):
 * - Solo se aprende de campos de TEXTO corregidos Y confirmados explícitamente por una persona.
 * - Nunca se aprende de valores financieros, numéricos ni de datos personales del cliente.
 * - Una sugerencia aprendida jamás marca un campo como human-confirmed ni sobrescribe en silencio.
 */

export type LearnableField = "description" | "unit";
export type LearnedTermType = "alias" | "name" | "unit";

/** Campos aprendibles en V1 (texto libre del documento). */
export const LEARNABLE_FIELDS: readonly LearnableField[] = ["description", "unit"] as const;

/** Campos explícitamente excluidos del aprendizaje: financieros, numéricos y PII. */
export const NON_LEARNABLE_FIELDS: readonly string[] = [
  "charge_amount", "planned_cost", "client_price", "quantity", "total", "currency", "currency_code",
  "client_name", "client", "address", "phone", "email", "item_type",
] as const;

export const TERM_TYPE_BY_FIELD: Record<LearnableField, LearnedTermType> = {
  description: "alias",
  unit: "unit",
};

export const isLearnableField = (field: string): field is LearnableField =>
  (LEARNABLE_FIELDS as readonly string[]).includes(field) && !NON_LEARNABLE_FIELDS.includes(field);

/** Valor de display: recorta y colapsa espacios, conserva mayúsculas originales. */
export const cleanTermValue = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** Clave de matching: espacios colapsados + minúsculas. Sin stemming ni similitud. */
export const normalizeTermKey = (value: string | null | undefined): string =>
  cleanTermValue(value).toLowerCase();

/**
 * Clave de matching TOLERANTE (solo cosmética): acentos y puntuación básica fuera.
 * Sigue siendo determinista: sin fuzzy, sin stemming, sin similitud ni semántica.
 * "Dry-Wall." === "dry wall"; "drywall repair" NUNCA === "wall repair".
 */
export const normalizeTermMatchKey = (value: string | null | undefined): string =>
  normalizeTermKey(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?'"“”‘’()[\]{}/\\|*_+~`^]/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();


const MONEY_OR_NUMBER = /^[$€£]?\s*-?[0-9][0-9,.\s]*$/;
const EMAIL_LIKE = /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i;
const PHONE_LIKE = /[0-9][0-9\-() .]{6,}[0-9]/;
const LONG_DIGITS = /[0-9]{5,}/;
const MAX_TERM_LENGTH = 200;

/** Un texto es aprendible si no está vacío, no es numérico/monetario ni parece PII (email, teléfono, IDs). */
export const isLearnableValue = (value: string | null | undefined): boolean => {
  const clean = cleanTermValue(value);
  return clean.length > 0 && clean.length <= MAX_TERM_LENGTH
    && !MONEY_OR_NUMBER.test(clean) && !EMAIL_LIKE.test(clean) && !PHONE_LIKE.test(clean) && !LONG_DIGITS.test(clean);
};

/**
 * Identidad determinista de una evidencia humana. El servidor la reconstruye con el mismo criterio
 * (empresa + actor + estimate + objetivo + campo + par observado/corregido) y la usa como clave única,
 * de modo que doble click, retry, reload+save o replay del RPC nunca cuentan dos veces.
 */
export const learnedEventIdentity = (
  input: { target_id: string; term_type: LearnedTermType; observed_term: string; corrected_term: string },
): string => [input.target_id, input.term_type, normalizeTermKey(input.observed_term), normalizeTermKey(input.corrected_term)].join("::");

export type LearnedTermInput = { observed_term: string; corrected_term: string; term_type: LearnedTermType; target_id: string };

/**
 * Aprendizaje MANUAL explícito ("Aprender esta corrección"): la persona pide guardar la corrección
 * sin necesidad de marcar el campo como confirmado. Mantiene todas las demás reglas duras
 * (solo texto aprendible, cambio real, sin datos financieros ni PII).
 */
export function buildManualLearnedCorrection(
  observed: string | null | undefined,
  corrected: string | null | undefined,
  field: LearnableField,
  targetId: string,
): LearnedTermInput | null {
  if (!isLearnableField(field) || !targetId) return null;
  if (!isLearnableValue(observed) || !isLearnableValue(corrected)) return null;
  if (normalizeTermKey(observed) === normalizeTermKey(corrected)) return null;
  return { observed_term: cleanTermValue(observed), corrected_term: cleanTermValue(corrected), term_type: TERM_TYPE_BY_FIELD[field], target_id: targetId };
}


export type LearnedBaseline = {
  title: string | null;
  items: Record<string, { description: string | null; unit: string | null }>;
};

export type LearnedCurrentItem = {
  id: string;
  description_normalized: string | null;
  unit: string | null;
  human_confirmed_fields?: string[] | null;
};

export type LearnedCurrentState = {
  /** Identidad del estimate: objetivo del evento para las correcciones de título. */
  id?: string;
  title: string | null;

  human_confirmed_fields?: string[] | null;
  items: LearnedCurrentItem[];
};

const candidate = (
  observed: string | null,
  corrected: string | null,
  field: LearnableField,
  confirmed: readonly string[],
  targetId: string,
): LearnedTermInput | null => {
  if (!confirmed.includes(field)) return null; // C. sin confirmación explícita no se aprende
  if (!isLearnableValue(observed) || !isLearnableValue(corrected)) return null; // A/E. valores seguros
  if (normalizeTermKey(observed) === normalizeTermKey(corrected)) return null; // D. debe ser un cambio real
  return { observed_term: cleanTermValue(observed), corrected_term: cleanTermValue(corrected), term_type: TERM_TYPE_BY_FIELD[field], target_id: targetId };
};

/**
 * Correcciones aprendibles = valor leído por la AI (baseline) + edición humana + confirmación explícita.
 * Editar sin confirmar, autosave, reordenar o navegar NO producen aprendizaje.
 * Cada corrección viaja con su objetivo (estimate o partida) para que el servidor identifique el evento humano.
 */
export function collectLearnableCorrections(baseline: LearnedBaseline, current: LearnedCurrentState): LearnedTermInput[] {
  const out: LearnedTermInput[] = [];
  const push = (value: LearnedTermInput | null) => { if (value) out.push(value); };
  for (const item of current.items) {
    const base = baseline.items[item.id];
    if (!base) continue;
    const confirmed = item.human_confirmed_fields ?? [];
    push(candidate(base.description, item.description_normalized, "description", confirmed, item.id));
    push(candidate(base.unit, item.unit, "unit", confirmed, item.id));
  }
  // Deduplica por identidad de evento (objetivo + tipo + par observado/corregido) conservando la primera aparición.
  const seen = new Set<string>();
  return out.filter((term) => {
    const key = learnedEventIdentity(term);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


export type LearnedTermRow = {
  id: string;
  observed_term: string;
  normalized_term: string;
  term_type: string;
  confirmations: number;
  is_active?: boolean | null;
};

export type LearnedSuggestion = {
  termId: string | null;
  field: LearnableField;
  targetId: string;
  observed: string;
  suggested: string | null;
  options: string[];
  confirmations: number;
  /** Solo afecta la PRESENTACIÓN: 1 confirmación => sugerencia; 2 o más => sugerencia frecuente. */
  strength: "suggested" | "recommended";
  conflict: boolean;
  /** "exact" = misma clave normalizada; "normalized" = solo difiere en acentos/puntuación. */
  matchType: "exact" | "normalized";
  provenance: "learned_term";
};


/** Umbral determinista de V1: cambia el texto mostrado, nunca el comportamiento. */
export const suggestionStrength = (confirmations: number): LearnedSuggestion["strength"] =>
  confirmations >= 2 ? "recommended" : "suggested";

/**
 * V1: NINGUNA sugerencia aprendida se aplica sola, tenga 1, 2 o 100 confirmaciones.
 * El valor canónico solo cambia tras pulsar “Usar sugerencia”.
 */
export const canPrefill = (_suggestion: LearnedSuggestion): boolean => false;

/** Encabezado según cuántas veces se confirmó históricamente. Solo texto. */
export const learnedSuggestionHeadline = (suggestion: LearnedSuggestion): string =>
  suggestion.strength === "recommended" ? "Sugerencia frecuente de correcciones anteriores" : LEARNED_SUGGESTION_LABEL;

/**
 * Matching determinista en dos pasos, sin fuzzy:
 * 1) clave normalizada exacta; 2) si no hay nada, clave tolerante (acentos/puntuación).
 * "paint" nunca se fusiona con "painter"; "Dry-Wall." sí coincide con "dry wall".
 */
export function buildLearnedSuggestion(
  observedValue: string | null | undefined,
  field: LearnableField,
  targetId: string,
  terms: readonly LearnedTermRow[],
): LearnedSuggestion | null {
  const key = normalizeTermKey(observedValue);
  if (!key || !isLearnableValue(observedValue)) return null;
  const type = TERM_TYPE_BY_FIELD[field];
  const active = terms.filter((term) => term.is_active !== false && term.term_type === type);
  let matchType: LearnedSuggestion["matchType"] = "exact";
  let matches = active.filter((term) => normalizeTermKey(term.observed_term) === key);
  if (matches.length === 0) {
    const looseKey = normalizeTermMatchKey(observedValue);
    matches = looseKey ? active.filter((term) => normalizeTermMatchKey(term.observed_term) === looseKey) : [];
    matchType = "normalized";
  }
  if (matches.length === 0) return null;


  const looseObserved = normalizeTermMatchKey(observedValue);
  const distinct = new Map<string, LearnedTermRow>();
  for (const match of matches) {
    const corrected = normalizeTermKey(match.normalized_term);
    // No se sugiere lo mismo que ya está escrito (ni con la clave tolerante).
    if (!corrected || corrected === key || normalizeTermMatchKey(match.normalized_term) === looseObserved) continue;
    const previous = distinct.get(corrected);
    if (!previous || match.confirmations > previous.confirmations) distinct.set(corrected, match);
  }
  if (distinct.size === 0) return null;

  const rows = [...distinct.values()];
  const conflict = rows.length > 1;
  const best = rows.reduce((a, b) => (b.confirmations > a.confirmations ? b : a));
  return {
    termId: conflict ? null : best.id,
    field,
    targetId,
    observed: cleanTermValue(observedValue),
    suggested: conflict ? null : cleanTermValue(best.normalized_term),
    options: rows.map((row) => cleanTermValue(row.normalized_term)),
    confirmations: conflict ? Math.max(...rows.map((row) => row.confirmations)) : best.confirmations,
    strength: conflict ? "suggested" : suggestionStrength(best.confirmations),
    conflict,
    matchType,
    provenance: "learned_term",
  };
}


/** Aplicar una sugerencia nunca confirma: el campo queda pendiente de confirmación humana. */
export const applySuggestionConfirmedFields = (
  confirmedFields: readonly string[] | null | undefined,
  field: LearnableField,
): string[] => (confirmedFields ?? []).filter((confirmed) => confirmed !== field);

/** Traza legible (sin PII) de por qué se propuso una sugerencia. */
export const learnedSuggestionTrace = (suggestion: LearnedSuggestion): string => {
  const loose = suggestion.matchType === "normalized" ? " · coincidencia normalizada (acentos/puntuación)" : "";
  return suggestion.conflict
    ? `Corrección aprendida en conflicto para “${suggestion.observed}” (${suggestion.options.length} versiones)${loose}`
    : `Corrección aprendida “${suggestion.observed}” → “${suggestion.suggested}” · ${suggestion.confirmations} ${suggestion.confirmations === 1 ? "confirmación" : "confirmaciones"}${loose}`;
};


export const LEARNED_SUGGESTION_LABEL = "Sugerencia aprendida de correcciones anteriores";

type RpcResult = { error?: unknown };

/**
 * Guarda primero la revisión canónica y ejecuta el aprendizaje como efecto secundario aislado.
 * Un fallo de review aborta antes de aprender; un fallo de learning nunca revierte el review.
 */
export async function saveReviewThenLearn(
  saveReview: () => Promise<RpcResult>,
  learn: (() => Promise<RpcResult>) | null,
): Promise<{ learningFailed: boolean }> {
  const review = await saveReview();
  if (review.error) throw review.error;
  if (!learn) return { learningFailed: false };
  try {
    const learned = await learn();
    return { learningFailed: Boolean(learned.error) };
  } catch {
    return { learningFailed: true };
  }
}
