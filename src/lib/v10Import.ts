import { csvToObjects } from "./csv.ts";
import {
  distributeSplitComponents,
  isV10IncomeRow,
  isV10NonProjectCenter,
  isV10OwnerMovement,
  isV10ReviewFlagged,
  resolveV10ProjectKey,
  roundV10,
  v10LedgerKey,
} from "./v10Aliases.ts";


export const V10_FILES = [
  "LOVABLE_TRANSACTIONS_V10.csv",
  "PROJECT_SUMMARY_V10.csv",
  "PENDING_REVIEW_V10.csv",
  "CORRECTIONS_APPLIED_V10.csv",
  "HANDOFF_ADJUSTMENTS_V10.csv",
  "BANK_RECON_CONTROL_V10.csv",
] as const;

export type V10FileName = typeof V10_FILES[number];
export type TraceabilityStatus =
  | "CONFIRMED_BANK_MATCH"
  | "CONFIRMED_BY_USER_NOTE"
  | "GENERAL_OVERHEAD_ALLOCATED"
  | "HANDOFF_ADJUSTMENT"
  | "PENDING_BANK_CONFIRMATION"
  | "NEEDS_PROJECT_REVIEW";

export type V10Transaction = {
  date: string;
  bankRow: string;
  project: string;
  vendorWorker: string;
  category: string;
  type: string;
  income: number | null;
  cost: number | null;
  source: string;
  reviewFlag: string;
  description: string;
  userNote: string;
  originalProject: string;
  originalCategory: string;
  traceabilityStatus: TraceabilityStatus | null;
  correctionReason: string;
  stableKey: string;
  projectId: string | null;
  categoryId: string | null;
  duplicateClassification:
    | "unique"
    | "identical_duplicate"
    | "legitimate_split"
    | "correction_or_reclassification"
    | "existing_transaction"
    | "possible_duplicate";
  splitGroupId: string | null;
  componentIndex: number | null;
  componentCount: number | null;
  componentSum: number | null;
  originalBankAmount: number | null;
  splitValidation: "valid" | "mismatch" | "unverifiable" | null;
  reviewFlagged: boolean;
  affectsProfitability: boolean;
  isOwnerMovement: boolean;
  issues: string[];

};

export type V10Catalogs = {
  projects: Array<{ id: string; name: string; project_code?: string | null; clients?: { name?: string | null } | null }>;
  categories: Array<{ id: string; name: string }>;
  existingStableKeys?: string[];
};

export type V10DryRun = {
  totalRows: number;
  periodStart: string | null;
  periodEnd: string | null;
  validRows: number;
  internalDuplicates: number;
  existingRows: number;
  recognizedProjects: number;
  missingProjects: string[];
  unknownCategories: string[];
  invalidAmounts: number;
  invalidDates: number;
  missingBankRows: number;
  correctionsApplied: number;
  pendingTotal: number;
  projectSummaryRows: number;
  pendingBankCost: number;
  confirmedCost: number;
  duplicateCandidateRows: number;
  splitGroups: number;
  unverifiableSplitGroups: number;
  damagedCategories: Array<{
    original: string;
    detected: string;
    proposed: string;
    rows: number[];
  }>;
  confirmedMovements: number;
  pendingBank: number;
  needsProjectReview: number;
  handoffAdjustments: number;
  reviewQueue: number;
  bankLedgerRows: number;
  bankLedgerMovements: number;
  profitabilityRows: number;
  ownerRows: number;
  zeroEffectRows: number;

  totalIncome: number;
  totalCost: number;
  summaryIncomeDifference: number;
  summaryCostDifference: number;
  bankIncomeDifference: number | null;
  bankCostDifference: number | null;
  canImport: boolean;
  blockingErrors: string[];
  warnings: string[];
  rows: V10Transaction[];
};

const STATUSES = new Set<TraceabilityStatus>([
  "CONFIRMED_BANK_MATCH",
  "CONFIRMED_BY_USER_NOTE",
  "GENERAL_OVERHEAD_ALLOCATED",
  "HANDOFF_ADJUSTMENT",
  "PENDING_BANK_CONFIRMATION",
  "NEEDS_PROJECT_REVIEW",
]);

export const normalizeV10 = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const parseV10Money = (value: string): number | null => {
  const clean = value.replace(/[$,\s]/g, "");
  if (clean === "") return 0;
  if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return null;
  const number = Number(clean);
  return Number.isFinite(number) ? number : null;
};

export const isV10Date = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const stableV10Key = (companyId: string, row: {
  bankRow: string; date: string; income: number | null; cost: number | null;
  description: string; type: string; source: string; project: string; category: string;
}) => [
  companyId,
  row.bankRow,
  row.date,
  row.income?.toFixed(2) ?? "",
  row.cost?.toFixed(2) ?? "",
  normalizeV10(row.description),
  normalizeV10(row.type),
  normalizeV10(row.source),
  normalizeV10(row.project),
  normalizeV10(row.category),
].join("|");

export const duplicateCandidateKey = (row: {
  bankRow: string; date: string; income: number | null; cost: number | null; description: string;
}) => [
  row.bankRow,
  row.date,
  row.income?.toFixed(2) ?? "",
  row.cost?.toFixed(2) ?? "",
  normalizeV10(row.description),
].join("|");
export const splitCandidateKey = (row: {
  bankRow: string; date: string; description: string;
}) => [row.bankRow, row.date, normalizeV10(row.description)].join("|");

export const isSplitSource = (source: string) => normalizeV10(source).includes("split");
export const isDamagedEncoding = (value: string) => /\uFFFD|ï¿½/.test(value);

export function authorizeV10Import(input: {
  userId: string | null;
  profileCompanyId: string | null;
  expectedCompanyId: string | null;
  roles: string[];
}): "allowed" | "unauthorized" | "company_mismatch" | "forbidden" {
  if (!input.userId) return "unauthorized";
  if (!input.profileCompanyId || input.profileCompanyId !== input.expectedCompanyId) return "company_mismatch";
  return input.roles.some((role) => role === "admin" || role === "manager") ? "allowed" : "forbidden";
}

const get = (row: Record<string, string>, name: string) => row[name]?.trim() ?? "";

export function parseV10Transactions(
  csv: string,
  companyId: string,
  catalogs: V10Catalogs,
): V10Transaction[] {
  const projects = new Map<string, string>();
  catalogs.projects.forEach((project) => {
    [project.name, project.project_code ?? "", project.clients?.name ?? ""]
      .filter(Boolean)
      .forEach((label) => projects.set(normalizeV10(label), project.id));
  });
  const categories = new Map(catalogs.categories.map((category) => [normalizeV10(category.name), category.id]));

  const parsed = csvToObjects(csv).map((raw) => {
    const statusRaw = get(raw, "Traceability Status") as TraceabilityStatus;
    const income = parseV10Money(get(raw, "Income"));
    const cost = parseV10Money(get(raw, "Cost"));
    const project = get(raw, "Project / Client");
    const category = get(raw, "Category");
    const row = {
      date: get(raw, "Date"),
      bankRow: get(raw, "Bank Row"),
      project,
      vendorWorker: get(raw, "Vendor / Worker"),
      category,
      type: get(raw, "Type"),
      income,
      cost,
      source: get(raw, "Source"),
      reviewFlag: get(raw, "Review Flag"),
      description: get(raw, "Description"),
      userNote: get(raw, "User Notes / Preserved Notes"),
      originalProject: get(raw, "Original Project / Client"),
      originalCategory: get(raw, "Original Category"),
      traceabilityStatus: STATUSES.has(statusRaw) ? statusRaw : null,
      correctionReason: get(raw, "Correction Reason"),
    };
    const issues: string[] = [];
    if (!isV10Date(row.date)) issues.push("Fecha inválida");
    if (income == null || cost == null || (income === 0 && cost === 0 && normalizeV10(row.type) !== "retiro efectivo")) {
      issues.push("Monto inválido");
    }
    if (!row.bankRow) issues.push("Bank Row ausente");
    if (!row.traceabilityStatus) issues.push("Estado de trazabilidad inválido");
    const nonProjectCenter = isV10NonProjectCenter(project);
    const owner = isV10OwnerMovement(row.type, project);
    const incomeRow = isV10IncomeRow(income, cost);
    const projectId = nonProjectCenter ? null
      : projects.get(normalizeV10(project)) ?? projects.get(resolveV10ProjectKey(project)) ?? null;
    const categoryId = isDamagedEncoding(category)
      ? null
      : categories.get(normalizeV10(category)) ?? null;
    if (row.traceabilityStatus === "NEEDS_PROJECT_REVIEW") {
      // Deliberately never resolve this status automatically.
    } else if (!projectId && !nonProjectCenter) {
      issues.push("Proyecto no reconocido");
    }
    // Income never requires an expense category, and overhead/owner centers
    // never require a project. Only project-bearing cost rows need a category.
    if (!categoryId && !incomeRow && !owner) issues.push("Categoría no reconocida");
    const reviewFlagged = isV10ReviewFlagged(row.reviewFlag);
    return {
      ...row,
      projectId: row.traceabilityStatus === "NEEDS_PROJECT_REVIEW" ? null : projectId,
      categoryId,
      stableKey: stableV10Key(companyId, row),
      duplicateClassification: "unique" as const,
      splitGroupId: null,
      componentIndex: null,
      componentCount: null,
      componentSum: null,
      originalBankAmount: get(raw, "Original Bank Amount")
        ? parseV10Money(get(raw, "Original Bank Amount"))
        : null,
      splitValidation: null,
      reviewFlagged,
      isOwnerMovement: owner,
      // Mirrors import-v10-stage: income only counts with a safe project, so a
      // refund booked to overhead never becomes a payment without a project.
      affectsProfitability: !owner && !reviewFlagged &&
        row.traceabilityStatus !== "NEEDS_PROJECT_REVIEW" &&
        row.traceabilityStatus !== "PENDING_BANK_CONFIRMATION" &&
        row.traceabilityStatus !== "HANDOFF_ADJUSTMENT" &&
        (!isV10IncomeRow(row.income, row.cost) || projectId != null),

      issues,
    };
  });


  const groups = new Map<string, V10Transaction[]>();
  parsed.forEach((row) => {
    const key = isSplitSource(row.source)
      ? `split|${splitCandidateKey(row)}`
      : `duplicate|${duplicateCandidateKey(row)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  groups.forEach((group, candidateKey) => {
    if (group.length < 2) return;
    const split = group.every((row) => isSplitSource(row.source));
    const rawAmounts = group.map((row) => ((row.income ?? 0) > 0 ? row.income ?? 0 : row.cost ?? 0));
    const declaredAmounts = unique(group
      .map((row) => row.originalBankAmount == null ? "" : row.originalBankAmount.toFixed(2)));
    const originalBankAmount = declaredAmounts.length === 1 ? Number(declaredAmounts[0]) : null;
    // Splits are deterministic: components are rounded to 2 decimals and the
    // last one absorbs the difference so the group always sums to the bank.
    const componentAmounts = distributeSplitComponents(rawAmounts, originalBankAmount);
    const componentSum = roundV10(componentAmounts.reduce((total, value) => total + value, 0));
    const splitValidation = split
      ? originalBankAmount == null || Math.abs(componentSum - originalBankAmount) <= 0.005
        ? "valid"
        : "mismatch"
      : null;
    group.forEach((row, index) => {
      const exactDuplicate = group.every((candidate) =>
        stableV10Key(companyId, candidate) === stableV10Key(companyId, row));
      row.duplicateClassification = split ? "legitimate_split"
        : row.correctionReason ? "correction_or_reclassification"
        : exactDuplicate ? "identical_duplicate"
        : "possible_duplicate";
      if (split) {
        row.splitGroupId = `${companyId}|split|${candidateKey}`;
        row.componentIndex = index + 1;
        row.componentCount = group.length;
        row.componentSum = componentSum;
        row.originalBankAmount = originalBankAmount ?? componentSum;
        row.splitValidation = splitValidation;
        row.stableKey = `${row.stableKey}|component:${index + 1}`;
        if (splitValidation !== "valid") {
          row.issues.push("La suma del split no coincide con el monto bancario original");
        }
      } else {
        row.issues.push("Posible duplicado pendiente de revisión");
      }
    });
  });

  return parsed;
}

const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();

const controlValue = (rows: Record<string, string>[], name: string) => {
  const row = rows.find((item) => normalizeV10(get(item, "Control")) === normalizeV10(name));
  return row ? parseV10Money(get(row, "Value")) : null;
};

export function dryRunV10(input: {
  files: Partial<Record<V10FileName, string>>;
  companyId: string;
  catalogs: V10Catalogs;
}): V10DryRun {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  const missingFiles = V10_FILES.filter((name) => !input.files[name]);
  if (missingFiles.length) blockingErrors.push(`Faltan archivos: ${missingFiles.join(", ")}`);

  const rows = parseV10Transactions(
    input.files["LOVABLE_TRANSACTIONS_V10.csv"] ?? "",
    input.companyId,
    input.catalogs,
  );
  const summary = csvToObjects(input.files["PROJECT_SUMMARY_V10.csv"] ?? "");
  const handoff = csvToObjects(input.files["HANDOFF_ADJUSTMENTS_V10.csv"] ?? "");
  const controls = csvToObjects(input.files["BANK_RECON_CONTROL_V10.csv"] ?? "");
  const pendingFile = csvToObjects(input.files["PENDING_REVIEW_V10.csv"] ?? "");
  const corrections = csvToObjects(input.files["CORRECTIONS_APPLIED_V10.csv"] ?? "");
  const existing = new Set(input.catalogs.existingStableKeys ?? []);
  rows.forEach((row) => {
    if (existing.has(row.stableKey)) row.duplicateClassification = "existing_transaction";
  });
  const seen = new Set<string>();
  let internalDuplicates = 0;
  rows.forEach((row) => {
    if (seen.has(row.stableKey)) internalDuplicates += 1;
    seen.add(row.stableKey);
  });

  const totalIncome = sum(rows.map((row) => row.income));
  const totalCost = sum(rows.map((row) => row.cost));
  const summaryIncome = sum(summary.map((row) => parseV10Money(get(row, "Income"))));
  const summaryCost = sum(summary.map((row) => parseV10Money(get(row, "Total Cost"))));
  const incomeDifference = Number((totalIncome - summaryIncome).toFixed(2));
  const costDifference = Number((totalCost - summaryCost).toFixed(2));
  const bankIncomeDifference = controlValue(controls, "Credits Difference");
  const bankCostDifference = controlValue(controls, "Debits Difference");
  const pending = rows.filter((row) =>
    row.traceabilityStatus === "PENDING_BANK_CONFIRMATION" ||
    row.traceabilityStatus === "NEEDS_PROJECT_REVIEW");
  const duplicateGroups = new Map<string, V10Transaction[]>();
  rows.forEach((row) => {
    const key = duplicateCandidateKey(row);
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), row]);
  });
  const duplicateCandidateRows = [...duplicateGroups.values()]
    .filter((group) => group.length > 1)
    .reduce((total, group) => total + group.length - 1, 0);
  const splitGroups = new Set(rows.map((row) => row.splitGroupId).filter(Boolean));
  const unverifiableSplitGroups = new Set(rows
    .filter((row) => row.splitValidation === "unverifiable" || row.splitValidation === "mismatch")
    .map((row) => row.splitGroupId).filter(Boolean));
  internalDuplicates = duplicateCandidateRows;
  if (unverifiableSplitGroups.size) {
    warnings.push(`${unverifiableSplitGroups.size} grupos SPLIT quedan en revisión porque falta comprobar el monto bancario original.`);
  }

  if (incomeDifference !== 0) blockingErrors.push("El detalle no cuadra con los ingresos del resumen.");
  if (costDifference !== 0) blockingErrors.push("El detalle no cuadra con los costos del resumen.");
  if (bankIncomeDifference !== 0) blockingErrors.push("El control bancario de ingresos no es cero.");
  if (bankCostDifference !== 0) blockingErrors.push("El control bancario de egresos no es cero.");
  if (pendingFile.length !== pending.length) blockingErrors.push("La bandeja pendiente no coincide con el detalle.");
  if (internalDuplicates) warnings.push(`${internalDuplicates} coincidencias aparentes se conservarán clasificadas para revisión.`);

  const missingProjects = unique(rows
    .filter((row) => row.issues.includes("Proyecto no reconocido"))
    .map((row) => row.project));
  const unknownCategories = unique(rows
    .filter((row) => row.issues.includes("Categoría no reconocida"))
    .map((row) => row.category));
  if (missingProjects.length) warnings.push(`${missingProjects.length} proyectos requieren revisión.`);
  if (unknownCategories.length) warnings.push(`${unknownCategories.length} categorías no están reconocidas.`);

  const invalidDates = rows.filter((row) => row.issues.includes("Fecha inválida")).length;
  const invalidAmounts = rows.filter((row) => row.issues.includes("Monto inválido")).length;
  const missingBankRows = rows.filter((row) => row.issues.includes("Bank Row ausente")).length;
  if (invalidDates) blockingErrors.push(`${invalidDates} fechas son inválidas.`);
  if (invalidAmounts) blockingErrors.push(`${invalidAmounts} montos son inválidos.`);

  return {
    totalRows: rows.length,
    periodStart: rows.map((row) => row.date).filter(isV10Date).sort()[0] ?? null,
    periodEnd: rows.map((row) => row.date).filter(isV10Date).sort().at(-1) ?? null,
    validRows: rows.filter((row) => !row.issues.some((issue) => /Fecha|Monto|Bank Row|trazabilidad/.test(issue))).length,
    internalDuplicates,
    existingRows: rows.filter((row) => existing.has(row.stableKey)).length,
    recognizedProjects: rows.filter((row) => row.projectId != null).length,
    missingProjects,
    unknownCategories,
    invalidAmounts,
    invalidDates,
    missingBankRows,
    correctionsApplied: corrections.length,
    pendingTotal: pending.length,
    projectSummaryRows: summary.length,
    pendingBankCost: sum(rows
      .filter((row) => row.traceabilityStatus === "PENDING_BANK_CONFIRMATION")
      .map((row) => row.cost)),
    confirmedCost: sum(rows
      .filter((row) => row.traceabilityStatus !== "PENDING_BANK_CONFIRMATION")
      .map((row) => row.cost)),
    duplicateCandidateRows,
    splitGroups: splitGroups.size,
    unverifiableSplitGroups: unverifiableSplitGroups.size,
    damagedCategories: [...new Map(rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isDamagedEncoding(row.category))
      .map(({ row }) => [row.category, {
        original: row.category,
        detected: "carácter de reemplazo de codificación",
        proposed: row.category.replace(/\uFFFD|ï¿½/g, "").trim(),
        rows: rows.map((candidate, candidateIndex) =>
          candidate.category === row.category ? candidateIndex + 2 : 0).filter(Boolean),
      }])).values()],
    confirmedMovements: rows.filter((row) => [
      "CONFIRMED_BANK_MATCH", "CONFIRMED_BY_USER_NOTE", "GENERAL_OVERHEAD_ALLOCATED",
    ].includes(row.traceabilityStatus ?? "")).length,
    pendingBank: rows.filter((row) => row.traceabilityStatus === "PENDING_BANK_CONFIRMATION").length,
    needsProjectReview: rows.filter((row) => row.traceabilityStatus === "NEEDS_PROJECT_REVIEW").length,
    handoffAdjustments: handoff.length,
    // Real doubt tray: original reconciliation flags, excluding pending-bank rows.
    reviewQueue: rows.filter((row) => row.reviewFlagged).length,
    // Bank ledger: every non pending-bank, non handoff movement, even without ids.
    bankLedgerRows: rows.filter((row) =>
      row.traceabilityStatus !== "PENDING_BANK_CONFIRMATION" &&
      row.traceabilityStatus !== "HANDOFF_ADJUSTMENT").length,
    // Profitability: only safe assignments, never owner/partner movements.
    profitabilityRows: rows.filter((row) =>
      row.affectsProfitability && !row.reviewFlagged &&
      (row.projectId != null || isV10NonProjectCenter(row.project))).length,
    // Distinct bank movements: split components and shared Bank Rows collapse.
    bankLedgerMovements: new Set(rows
      .filter((row) =>
        row.traceabilityStatus !== "PENDING_BANK_CONFIRMATION" &&
        row.traceabilityStatus !== "HANDOFF_ADJUSTMENT" &&
        ((row.income ?? 0) !== 0 || (row.cost ?? 0) !== 0))
      .map((row) => v10LedgerKey(row.splitGroupId, row.bankRow, row.stableKey))
      .filter((key): key is string => key != null)).size,
    ownerRows: rows.filter((row) => row.isOwnerMovement).length,
    zeroEffectRows: rows.filter((row) => (row.income ?? 0) === 0 && (row.cost ?? 0) === 0).length,

    totalIncome,
    totalCost,
    summaryIncomeDifference: incomeDifference,
    summaryCostDifference: costDifference,
    bankIncomeDifference,
    bankCostDifference,
    canImport: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    rows,
  };
}
