import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dryRunV10, V10_FILES, type V10FileName } from "../src/lib/v10Import.ts";

const packageDirectory = process.argv[2];
const synthetic = packageDirectory === "--synthetic";
if (!packageDirectory) {
  console.error("Uso real: npm run v10:dry-run:real -- <carpeta-con-csv>");
  process.exit(1);
}

const transactionHeader = "Date,Bank Row,Project / Client,Vendor / Worker,Category,Type,Income,Cost,Source,Review Flag,Description,User Notes / Preserved Notes,Original Project / Client,Original Category,Traceability Status,Correction Reason";
const syntheticFiles: Record<V10FileName, string> = {
  "LOVABLE_TRANSACTIONS_V10.csv": `${transactionHeader}\n2026-07-01,1,GENERAL / OVERHEAD,Proveedor,Materials,GASTO,0,100,BANK_TAGGED,OK,Control sintético,,,,GENERAL_OVERHEAD_ALLOCATED,`,
  "PROJECT_SUMMARY_V10.csv": "Project / Client,Income,Labor,Materials,Other Direct,Overhead,Total Cost,Gross Profit,Margin %\nGENERAL / OVERHEAD,0,0,0,0,100,100,-100,0",
  "PENDING_REVIEW_V10.csv": transactionHeader,
  "CORRECTIONS_APPLIED_V10.csv": "Reporting Row,Bank Row,Date,Old Project,New Project,Old Category,New Category,User Note,Reason",
  "HANDOFF_ADJUSTMENTS_V10.csv": "Project / Client,Handoff Labor Budget,Actual Labor Before Handoff Adj,Labor Adjustment,Handoff Materials Budget,Actual Materials Before Handoff Adj,Materials Adjustment,Rule",
  "BANK_RECON_CONTROL_V10.csv": "Control,Value,Expected/Notes\nCredits Difference,0,Should be 0.00\nDebits Difference,0,Should be 0.00",
};

const files = synthetic
  ? syntheticFiles
  : Object.fromEntries(V10_FILES.map((name) => [
    name,
    readFileSync(resolve(packageDirectory, name), "utf8"),
  ])) as Record<V10FileName, string>;

const result = dryRunV10({
  files,
  companyId: "dry-run-local-sin-supabase",
  catalogs: { projects: [], categories: [] },
});
const cents = (value: number) => Number(value.toFixed(2));

const output = {
  mode: synthetic ? "fixture-sintético-seguro" : "paquete-financiero-real-local",
  transactions: result.totalRows,
  correctionsApplied: result.correctionsApplied,
  needsProjectReview: result.needsProjectReview,
  pendingBankConfirmation: result.pendingBank,
  pendingTotal: result.pendingTotal,
  handoffAdjustments: result.handoffAdjustments,
  projectSummaries: result.projectSummaryRows,
  reviewQueue: result.reviewQueue,
  bankLedgerRows: result.bankLedgerRows,
  bankLedgerMovements: result.bankLedgerMovements,
  profitabilityRows: result.profitabilityRows,
  ownerRows: result.ownerRows,
  zeroEffectRows: result.zeroEffectRows,
  invalidDates: result.invalidDates,
  invalidAmounts: result.invalidAmounts,

  missingBankRows: result.missingBankRows,
  totalIncome: cents(result.totalIncome),
  totalCost: cents(result.totalCost),
  pendingBankCost: cents(result.pendingBankCost),
  confirmedCost: cents(result.confirmedCost),
  duplicateCandidateRows: result.duplicateCandidateRows,
  splitGroups: result.splitGroups,
  unverifiableSplitGroups: result.unverifiableSplitGroups,
  summaryIncomeDifference: result.summaryIncomeDifference,
  summaryCostDifference: result.summaryCostDifference,
  bankIncomeDifference: result.bankIncomeDifference,
  bankCostDifference: result.bankCostDifference,
  damagedCategories: result.damagedCategories,
  blockingErrors: result.blockingErrors,
  warnings: result.warnings,
};

console.log(JSON.stringify(output, null, 2));
if (result.blockingErrors.length) process.exitCode = 1;
