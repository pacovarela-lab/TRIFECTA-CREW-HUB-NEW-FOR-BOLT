/**
 * AI Scan quality benchmark — pure, deterministic scoring helpers.
 *
 * Scope: measures how well the photo-estimate AI extraction matches the human
 * confirmed (golden) state. It never calls the AI gateway, never touches the
 * database and never mutates financial data. Learned Corrections are reported
 * as a SEPARATE layer and never inflate AI accuracy.
 */

export const UNREADABLE = "__unreadable__" as const;
export type Unreadable = typeof UNREADABLE;

export type AiText = string | null | Unreadable;
export type AiMoney = number | null | Unreadable;
export type AiNumber = number | null | Unreadable;

export type FieldVerdict = "exact" | "normalized" | "wrong" | "missing" | "unreadable";
export type TotalVerdict = "exact" | "wrong" | "missing" | "unreadable" | "conflict_detected" | "conflict_missed";

export type BenchmarkField = "description" | "quantity" | "unit" | "client_price" | "planned_cost" | "item_type";

export const BENCHMARK_FIELDS: BenchmarkField[] = [
  "description",
  "quantity",
  "unit",
  "client_price",
  "planned_cost",
  "item_type",
];

const TEXT_FIELDS: BenchmarkField[] = ["description", "unit", "item_type"];
const MONEY_FIELDS: BenchmarkField[] = ["client_price", "planned_cost"];

export type ReviewPriority = "high" | "medium" | "low";
export type LearnedOutcome = "available" | "accepted" | "rejected" | "conflict";

export interface GoldenItem {
  key: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  client_price: number | null;
  planned_cost: number | null;
  item_type: string | null;
}

export interface AiItem {
  /** Golden item this AI row corresponds to; null = the AI invented the row. */
  goldenKey: string | null;
  description: AiText;
  quantity: AiNumber;
  unit: AiText;
  client_price: AiMoney;
  planned_cost: AiMoney;
  item_type: AiText;
}

export interface LearnedEvent {
  aiText: string;
  suggestion: string;
  outcome: LearnedOutcome;
  /** true when the learned term matched the AI reading exactly (normalized). */
  exactHit: boolean;
}

export interface CaseLatency {
  geminiCalls: number;
  attempts: number;
  aiMs: number | null;
  totalMs: number | null;
}

export interface BenchmarkCase {
  id: string;
  label: string;
  tags: string[];
  golden: {
    title: string | null;
    charge_amount: number | null;
    currency_code: string | null;
    items: GoldenItem[];
  };
  ai: {
    title: AiText;
    charge_amount: AiMoney;
    currency_code: AiText;
    /** The extraction flagged conflicting global total candidates. */
    conflict_detected?: boolean;
    items: AiItem[];
  };
  /** Golden truth says the document has two materially different totals. */
  expect_conflict?: boolean;
  human_review: Record<ReviewPriority, number>;
  learned: LearnedEvent[];
  latency: CaseLatency;
}

export interface VerdictCounts {
  exact: number;
  normalized: number;
  wrong: number;
  missing: number;
  unreadable: number;
  evaluated: number;
}

export interface CaseResult {
  id: string;
  label: string;
  tags: string[];
  total: {
    verdict: TotalVerdict;
    expected: number | null;
    correct: boolean;
  };
  currency: FieldVerdict;
  title: FieldVerdict;
  items: {
    expected: number;
    extracted: number;
    matched: number;
    missing: number;
    hallucinated: number;
  };
  fields: Record<BenchmarkField, VerdictCounts>;
  human_review: Record<ReviewPriority, number>;
  learned: { available: number; accepted: number; rejected: number; conflict: number; exact_hits: number };
  latency: CaseLatency;
}

export interface BenchmarkSummary {
  generated_fields: BenchmarkField[];
  cases: number;
  total_accuracy: { correct: number; evaluated: number; pct: number; wrong: number; missing: number; conflicts_expected: number; conflicts_detected: number };
  monetary_accuracy: {
    global_total: VerdictCounts;
    item_client_price: VerdictCounts;
    item_planned_cost: VerdictCounts;
    pct: number;
  };
  item_completeness: { expected: number; extracted: number; matched: number; missing: number; hallucinated: number; pct: number };
  text_accuracy: { counts: VerdictCounts; pct: number };
  field_accuracy: Record<BenchmarkField, VerdictCounts & { pct: number }>;
  overall_extraction_accuracy_pct: number;
  human_review_load: Record<ReviewPriority, number> & { total: number };
  learned_corrections: { available: number; accepted: number; rejected: number; conflict: number; exact_hits: number };
  latency: {
    gemini_calls: number;
    attempts: number;
    ai_ms: { average: number | null; median: number | null; samples: number };
    total_ms: { average: number | null; median: number | null; samples: number };
  };
  results: CaseResult[];
}

/** Trim, lowercase, collapse whitespace, drop decorative punctuation. No fuzzy matching. */
export function normalizeBenchmarkText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?"'`()[\]{}]/g, " ")
    .replace(/[-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyCounts(): VerdictCounts {
  return { exact: 0, normalized: 0, wrong: 0, missing: 0, unreadable: 0, evaluated: 0 };
}

function addVerdict(counts: VerdictCounts, verdict: FieldVerdict): void {
  counts[verdict] += 1;
  counts.evaluated += 1;
}

function mergeCounts(target: VerdictCounts, source: VerdictCounts): void {
  target.exact += source.exact;
  target.normalized += source.normalized;
  target.wrong += source.wrong;
  target.missing += source.missing;
  target.unreadable += source.unreadable;
  target.evaluated += source.evaluated;
}

export function compareText(golden: string | null, ai: AiText): FieldVerdict {
  if (ai === UNREADABLE) return "unreadable";
  if (golden === null || golden === "") return ai === null || ai === "" ? "exact" : "wrong";
  if (ai === null || ai === "") return "missing";
  if (ai === golden) return "exact";
  return normalizeBenchmarkText(ai) === normalizeBenchmarkText(golden) ? "normalized" : "wrong";
}

/** Money never collapses unknown to 0: null stays "missing", sentinel stays "unreadable". */
export function compareMoney(golden: number | null, ai: AiMoney): FieldVerdict {
  if (ai === UNREADABLE) return "unreadable";
  if (golden === null) return ai === null ? "exact" : "wrong";
  if (ai === null) return "missing";
  return Math.abs(ai - golden) < 0.005 ? "exact" : "wrong";
}

export function compareNumber(golden: number | null, ai: AiNumber): FieldVerdict {
  return compareMoney(golden, ai as AiMoney);
}

function compareField(field: BenchmarkField, golden: GoldenItem, ai: AiItem): FieldVerdict {
  if (TEXT_FIELDS.includes(field)) return compareText(golden[field] as string | null, ai[field] as AiText);
  if (field === "quantity") return compareNumber(golden.quantity, ai.quantity);
  return compareMoney(golden[field] as number | null, ai[field] as AiMoney);
}

function evaluateTotal(item: BenchmarkCase): CaseResult["total"] {
  const expected = item.golden.charge_amount;
  if (item.expect_conflict) {
    const detected = item.ai.conflict_detected === true;
    return { verdict: detected ? "conflict_detected" : "conflict_missed", expected, correct: detected };
  }
  const verdict = compareMoney(expected, item.ai.charge_amount) as Exclude<FieldVerdict, "normalized"> | "normalized";
  const narrowed: TotalVerdict = verdict === "normalized" ? "wrong" : verdict;
  return { verdict: narrowed, expected, correct: narrowed === "exact" };
}

export function evaluateCase(item: BenchmarkCase): CaseResult {
  const fields = Object.fromEntries(BENCHMARK_FIELDS.map((field) => [field, emptyCounts()])) as Record<BenchmarkField, VerdictCounts>;
  const goldenByKey = new Map(item.golden.items.map((golden) => [golden.key, golden]));
  const matchedKeys = new Set<string>();
  let hallucinated = 0;

  for (const aiItem of item.ai.items) {
    const golden = aiItem.goldenKey ? goldenByKey.get(aiItem.goldenKey) : undefined;
    if (!golden) {
      hallucinated += 1;
      continue;
    }
    if (matchedKeys.has(golden.key)) {
      // Two AI rows claiming the same golden row: the extra one is a hallucination.
      hallucinated += 1;
      continue;
    }
    matchedKeys.add(golden.key);
    for (const field of BENCHMARK_FIELDS) addVerdict(fields[field], compareField(field, golden, aiItem));
  }

  const learned = { available: 0, accepted: 0, rejected: 0, conflict: 0, exact_hits: 0 };
  for (const event of item.learned) {
    learned.available += 1;
    if (event.outcome === "accepted") learned.accepted += 1;
    if (event.outcome === "rejected") learned.rejected += 1;
    if (event.outcome === "conflict") learned.conflict += 1;
    if (event.exactHit) learned.exact_hits += 1;
  }

  return {
    id: item.id,
    label: item.label,
    tags: item.tags,
    total: evaluateTotal(item),
    currency: compareText(item.golden.currency_code, item.ai.currency_code),
    title: compareText(item.golden.title, item.ai.title),
    items: {
      expected: item.golden.items.length,
      extracted: item.ai.items.length,
      matched: matchedKeys.size,
      missing: item.golden.items.length - matchedKeys.size,
      hallucinated,
    },
    fields,
    human_review: { ...item.human_review },
    learned,
    latency: { ...item.latency },
  };
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function runBenchmark(cases: BenchmarkCase[]): BenchmarkSummary {
  const results = cases.map(evaluateCase);

  const globalTotal = emptyCounts();
  let totalsCorrect = 0;
  let conflictsExpected = 0;
  let conflictsDetected = 0;

  for (const [index, result] of results.entries()) {
    if (cases[index].expect_conflict) {
      conflictsExpected += 1;
      if (result.total.verdict === "conflict_detected") conflictsDetected += 1;
    } else {
      addVerdict(globalTotal, result.total.verdict as FieldVerdict);
    }
    if (result.total.correct) totalsCorrect += 1;
  }

  const fieldAccuracy = Object.fromEntries(
    BENCHMARK_FIELDS.map((field) => [field, emptyCounts()]),
  ) as Record<BenchmarkField, VerdictCounts>;
  const itemTotals = { expected: 0, extracted: 0, matched: 0, missing: 0, hallucinated: 0 };
  const humanReview = { high: 0, medium: 0, low: 0, total: 0 };
  const learned = { available: 0, accepted: 0, rejected: 0, conflict: 0, exact_hits: 0 };
  let geminiCalls = 0;
  let attempts = 0;
  const aiSamples: number[] = [];
  const totalSamples: number[] = [];

  for (const result of results) {
    for (const field of BENCHMARK_FIELDS) mergeCounts(fieldAccuracy[field], result.fields[field]);
    itemTotals.expected += result.items.expected;
    itemTotals.extracted += result.items.extracted;
    itemTotals.matched += result.items.matched;
    itemTotals.missing += result.items.missing;
    itemTotals.hallucinated += result.items.hallucinated;
    humanReview.high += result.human_review.high;
    humanReview.medium += result.human_review.medium;
    humanReview.low += result.human_review.low;
    learned.available += result.learned.available;
    learned.accepted += result.learned.accepted;
    learned.rejected += result.learned.rejected;
    learned.conflict += result.learned.conflict;
    learned.exact_hits += result.learned.exact_hits;
    geminiCalls += result.latency.geminiCalls;
    attempts += result.latency.attempts;
    if (result.latency.aiMs !== null) aiSamples.push(result.latency.aiMs);
    if (result.latency.totalMs !== null) totalSamples.push(result.latency.totalMs);
  }
  humanReview.total = humanReview.high + humanReview.medium + humanReview.low;

  const text = emptyCounts();
  for (const field of TEXT_FIELDS) mergeCounts(text, fieldAccuracy[field]);

  const money = emptyCounts();
  mergeCounts(money, globalTotal);
  for (const field of MONEY_FIELDS) mergeCounts(money, fieldAccuracy[field]);

  const all = emptyCounts();
  mergeCounts(all, money);
  for (const field of BENCHMARK_FIELDS) {
    if (MONEY_FIELDS.includes(field)) continue;
    mergeCounts(all, fieldAccuracy[field]);
  }

  return {
    generated_fields: BENCHMARK_FIELDS,
    cases: results.length,
    total_accuracy: {
      correct: totalsCorrect,
      evaluated: results.length,
      pct: pct(totalsCorrect, results.length),
      wrong: globalTotal.wrong + (conflictsExpected - conflictsDetected),
      missing: globalTotal.missing,
      conflicts_expected: conflictsExpected,
      conflicts_detected: conflictsDetected,
    },
    monetary_accuracy: {
      global_total: globalTotal,
      item_client_price: fieldAccuracy.client_price,
      item_planned_cost: fieldAccuracy.planned_cost,
      pct: pct(money.exact, money.evaluated),
    },
    item_completeness: { ...itemTotals, pct: pct(itemTotals.matched, itemTotals.expected) },
    text_accuracy: { counts: text, pct: pct(text.exact + text.normalized, text.evaluated) },
    field_accuracy: Object.fromEntries(
      BENCHMARK_FIELDS.map((field) => {
        const counts = fieldAccuracy[field];
        return [field, { ...counts, pct: pct(counts.exact + counts.normalized, counts.evaluated) }];
      }),
    ) as BenchmarkSummary["field_accuracy"],
    overall_extraction_accuracy_pct: pct(all.exact + all.normalized, all.evaluated),
    human_review_load: humanReview,
    learned_corrections: learned,
    latency: {
      gemini_calls: geminiCalls,
      attempts,
      ai_ms: { average: average(aiSamples), median: median(aiSamples), samples: aiSamples.length },
      total_ms: { average: average(totalSamples), median: median(totalSamples), samples: totalSamples.length },
    },
    results,
  };
}

function line(label: string, value: string): string {
  return `${label.padEnd(34, " ")} ${value}`;
}

export function formatBenchmarkReport(summary: BenchmarkSummary): string {
  const out: string[] = [];
  out.push("AI SCAN QUALITY BENCHMARK");
  out.push("=".repeat(56));
  out.push(line("Cases", String(summary.cases)));
  if (summary.cases === 0) {
    out.push("Empty dataset — no metrics computed.");
    return out.join("\n");
  }
  out.push("");
  out.push("HEADLINE (never hides money errors)");
  out.push(line("Overall extraction accuracy", `${summary.overall_extraction_accuracy_pct}%`));
  out.push(
    line(
      "Total (charge_amount) accuracy",
      `${summary.total_accuracy.pct}% (${summary.total_accuracy.correct}/${summary.total_accuracy.evaluated}) · wrong ${summary.total_accuracy.wrong} · missing ${summary.total_accuracy.missing}`,
    ),
  );
  out.push(line("Monetary field accuracy", `${summary.monetary_accuracy.pct}%`));
  out.push(
    line(
      "Item completeness",
      `${summary.item_completeness.pct}% (matched ${summary.item_completeness.matched}/${summary.item_completeness.expected}) · missing ${summary.item_completeness.missing} · hallucinated ${summary.item_completeness.hallucinated}`,
    ),
  );
  out.push(line("Text accuracy", `${summary.text_accuracy.pct}%`));
  out.push(
    line(
      "Conflicts (global total)",
      `${summary.total_accuracy.conflicts_detected}/${summary.total_accuracy.conflicts_expected} detected`,
    ),
  );
  out.push("");
  out.push("FIELD ACCURACY (exact / normalized / wrong / missing / unreadable)");
  for (const field of summary.generated_fields) {
    const counts = summary.field_accuracy[field];
    out.push(
      line(
        `  ${field}`,
        `${counts.pct}% — ${counts.exact} / ${counts.normalized} / ${counts.wrong} / ${counts.missing} / ${counts.unreadable} (n=${counts.evaluated})`,
      ),
    );
  }
  out.push("");
  out.push("HUMAN REVIEW LOAD");
  out.push(
    line(
      "  high / medium / low",
      `${summary.human_review_load.high} / ${summary.human_review_load.medium} / ${summary.human_review_load.low} (total ${summary.human_review_load.total})`,
    ),
  );
  out.push("");
  out.push("LEARNED CORRECTIONS (separate layer, not AI accuracy)");
  out.push(
    line(
      "  available / accepted / rejected",
      `${summary.learned_corrections.available} / ${summary.learned_corrections.accepted} / ${summary.learned_corrections.rejected}`,
    ),
  );
  out.push(line("  conflicts / exact hits", `${summary.learned_corrections.conflict} / ${summary.learned_corrections.exact_hits}`));
  out.push("");
  out.push("LATENCY");
  out.push(line("  Gemini calls / attempts", `${summary.latency.gemini_calls} / ${summary.latency.attempts}`));
  out.push(
    line("  AI ms avg / median", `${summary.latency.ai_ms.average ?? "n/a"} / ${summary.latency.ai_ms.median ?? "n/a"} (n=${summary.latency.ai_ms.samples})`),
  );
  out.push(
    line(
      "  Total ms avg / median",
      `${summary.latency.total_ms.average ?? "n/a"} / ${summary.latency.total_ms.median ?? "n/a"} (n=${summary.latency.total_ms.samples})`,
    ),
  );
  out.push("");
  out.push("PER CASE");
  for (const result of summary.results) {
    out.push(
      `  ${result.id.padEnd(26, " ")} total=${result.total.verdict.padEnd(17, " ")} items ${result.items.matched}/${result.items.expected} · missing ${result.items.missing} · hallucinated ${result.items.hallucinated}`,
    );
  }
  return out.join("\n");
}

export interface BaselineSnapshot {
  total_accuracy_pct: number;
  monetary_accuracy_pct: number;
  item_completeness_pct: number;
  text_accuracy_pct: number;
  overall_extraction_accuracy_pct: number;
  hallucinated_items: number;
  missing_items: number;
  median_ai_ms: number | null;
}

export function toBaselineSnapshot(summary: BenchmarkSummary): BaselineSnapshot {
  return {
    total_accuracy_pct: summary.total_accuracy.pct,
    monetary_accuracy_pct: summary.monetary_accuracy.pct,
    item_completeness_pct: summary.item_completeness.pct,
    text_accuracy_pct: summary.text_accuracy.pct,
    overall_extraction_accuracy_pct: summary.overall_extraction_accuracy_pct,
    hallucinated_items: summary.item_completeness.hallucinated,
    missing_items: summary.item_completeness.missing,
    median_ai_ms: summary.latency.ai_ms.median,
  };
}

export interface GateViolation {
  metric: string;
  baseline: number;
  current: number;
  message: string;
}

/**
 * CI gate: solo dos reglas duras, ambas financieras.
 * 1) La exactitud del total (charge_amount) nunca puede bajar.
 * 2) El número de partidas inventadas nunca puede subir.
 * El resto de métricas sigue siendo informativo.
 */
export function evaluateBenchmarkGate(
  previous: BaselineSnapshot,
  current: BaselineSnapshot,
): GateViolation[] {
  const violations: GateViolation[] = [];
  const baseTotal = previous.total_accuracy_pct ?? 0;
  const nowTotal = current.total_accuracy_pct ?? 0;
  if (nowTotal < baseTotal) {
    violations.push({
      metric: "total_accuracy_pct",
      baseline: baseTotal,
      current: nowTotal,
      message: `Total (charge_amount) accuracy bajó de ${baseTotal}% a ${nowTotal}%`,
    });
  }
  const baseHall = previous.hallucinated_items ?? 0;
  const nowHall = current.hallucinated_items ?? 0;
  if (nowHall > baseHall) {
    violations.push({
      metric: "hallucinated_items",
      baseline: baseHall,
      current: nowHall,
      message: `Partidas inventadas subieron de ${baseHall} a ${nowHall}`,
    });
  }
  return violations;
}

/** Informative only — never a CI blocker in this iteration. */
export function compareWithBaseline(previous: BaselineSnapshot, current: BaselineSnapshot): string[] {
  const keys = Object.keys(previous) as (keyof BaselineSnapshot)[];
  return keys.map((key) => {
    const before = previous[key];
    const after = current[key];
    const arrow = before === after ? "=" : "→";
    return `${String(key).padEnd(34, " ")} ${before ?? "n/a"} ${arrow} ${after ?? "n/a"}`;
  });
}
