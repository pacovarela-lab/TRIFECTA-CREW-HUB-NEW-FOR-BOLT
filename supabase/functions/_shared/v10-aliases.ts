// Shared V10 reconciliation helpers. Keep byte-identical with
// src/lib/v10Aliases.ts (asserted by tests).
export const normalizeV10Label = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const V10_PROJECT_ALIASES: Record<string, string> = {
  "patrick": "PATRICK VYSATA-PV-001",
  "pv 001": "PATRICK VYSATA-PV-001",
  "patrick v": "PATRICK VYSATA-PV-001",
  "patrick visata": "PATRICK VYSATA-PV-001",
  "patrick vysata": "PATRICK VYSATA-PV-001",
  "patrick vysata pv 001": "PATRICK VYSATA-PV-001",
  "jeki": "JEKI ABRAHAM-JA-002",
  "jeki abraham": "JEKI ABRAHAM-JA-002",
  "jeki abraham ja 002": "JEKI ABRAHAM-JA-002",
  "nick": "NICK MENZA-NM-001",
  "menza": "NICK MENZA-NM-001",
  "nick menza": "NICK MENZA-NM-001",
  "nick menza nm 001": "NICK MENZA-NM-001",
  "joel": "JOEL DOWLING-JD-001",
  "joel dowling": "JOEL DOWLING-JD-001",
  "joel dowling jd 001": "JOEL DOWLING-JD-001",
  "ramsey": "Bathroom Ramsey (Silaba)",
  "silaba": "Bathroom Ramsey (Silaba)",
  "ramsey silaba": "Bathroom Ramsey (Silaba)",
  "bathroom ramsey silaba": "Bathroom Ramsey (Silaba)",
};

export const canonicalV10Project = (label: unknown): string | null =>
  V10_PROJECT_ALIASES[normalizeV10Label(label)] ?? null;

export const resolveV10ProjectKey = (label: unknown): string => {
  const canonical = canonicalV10Project(label);
  return canonical ? normalizeV10Label(canonical) : normalizeV10Label(label);
};

export const isV10NonProjectCenter = (label: unknown) =>
  /^(general overhead|owner partner)/.test(normalizeV10Label(label));

export const isV10OwnerMovement = (type: unknown, label: unknown) =>
  normalizeV10Label(type) === "owner partner" ||
  /^owner partner/.test(normalizeV10Label(label));

export const isV10IncomeRow = (income: number | null, cost: number | null) =>
  (income ?? 0) > 0 && (cost ?? 0) <= 0;

// The real doubt tray comes from the original reconciliation flags, never from
// missing technical IDs. Pending-bank rows are tracked separately.
export const isV10ReviewFlagged = (flag: unknown) => {
  const value = normalizeV10Label(flag);
  if (!value || value === "ok" || value.includes("pending bank")) return false;
  return value.includes("falta informacion") || value.includes("revisado falta evidencia");
};

export const roundV10 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Deterministic split distribution: every component is rounded to 2 decimals and
// the last component absorbs the rounding difference so the group sums to bank.
export const distributeSplitComponents = (values: number[], bankTotal?: number | null) => {
  if (!values.length) return [];
  const rounded = values.map(roundV10);
  const naturalSum = roundV10(rounded.reduce((sum, value) => sum + value, 0));
  const total = roundV10(bankTotal ?? naturalSum);
  // Only rounding noise is absorbed; a real mismatch is preserved for review.
  if (Math.abs(total - naturalSum) > 0.01 * rounded.length) return rounded;
  const head = rounded.slice(0, -1);
  const last = roundV10(total - head.reduce((sum, value) => sum + value, 0));
  return [...head, last];
};

// One bank movement = one ledger key: split components share their group, rows
// that share a Bank Row (cash withdrawal + its expense) share that Bank Row.
export const v10LedgerKey = (
  splitGroupId: string | null | undefined,
  bankRow: string | null | undefined,
  stableKey: string | null | undefined,
): string | null => {
  if (splitGroupId) return `split:${splitGroupId}`;
  const row = String(bankRow ?? "").trim();
  if (row) return `bankrow:${row}`;
  return stableKey ? String(stableKey) : null;
};

// Ledger eligibility is independent from profitability: a review-tray row is a
// confirmed bank movement (ledger yes) with no safe project (profitability no).
export type V10EligibilityRow = {
  traceabilityStatus?: string | null;
  duplicateClassification?: string | null;
  splitValidation?: string | null;
  affectsProjectProfitability?: boolean | null;
  projectId?: string | null;
  amount?: number | null;
};

export const isV10LedgerEligible = (row: V10EligibilityRow): boolean => {
  if (row.traceabilityStatus === "PENDING_BANK_CONFIRMATION") return false;
  if (row.traceabilityStatus === "HANDOFF_ADJUSTMENT") return false;
  if (row.duplicateClassification === "possible_duplicate" ||
    row.duplicateClassification === "identical_duplicate") return false;
  if (row.duplicateClassification === "legitimate_split" && row.splitValidation !== "valid") return false;
  return Math.abs(Number(row.amount ?? 0)) > 0;
};

export const isV10ProfitabilityEligible = (row: V10EligibilityRow): boolean => {
  if (!isV10LedgerEligible(row)) return false;
  if (row.affectsProjectProfitability !== true) return false;
  if (row.traceabilityStatus === "GENERAL_OVERHEAD_ALLOCATED") return true;
  return row.projectId != null;
};
