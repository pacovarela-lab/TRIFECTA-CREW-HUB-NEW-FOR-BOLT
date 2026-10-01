// Single source of truth for project financials.
//
// Wraps the SQL view `project_financial_ledger` and layers prorated overhead
// (computed by `src/lib/overhead.ts`) on top. Every screen that displays
// per-project financial numbers — Dashboard, ProjectDetail, Reports, Bank
// Reconciliation export — should consume `getProjectFinancials()` or the
// pure helpers below so all UIs agree to the penny.
//
// Status taxonomy (derived from origin, no schema column):
//   - confirmed   : created directly by a user (no bank_transaction link)
//   - needs_review: created from a bank transaction but not reconciled yet
//   - reconciled  : marked reconciled (reconciled_at IS NOT NULL)
//   - suggested   : reserved for future receipt/AI suggestions (not in view yet)
//   - excluded    : reserved (sandbox filter is applied separately)
//
// Only `confirmed` and `reconciled` rows count toward Confirmed Profit.

import { supabase } from "@/integrations/supabase/client";
import {
  computeOverheadByProject,
  type OverheadExpenseRow,
  type OverheadProjectRow,
} from "@/lib/overhead";

export type LedgerStatus =
  | "suggested"
  | "needs_review"
  | "confirmed"
  | "reconciled"
  | "excluded";

export type LedgerDirection = "income" | "expense";

export type LedgerEntry = {
  company_id: string;
  project_id: string | null;
  source_type:
    | "expense"
    | "expense_split"
    | "payment"
    | "receipt"
    | "bank_transaction";
  source_id: string;
  expense_id: string | null;
  date: string; // ISO date
  amount: number;
  direction: LedgerDirection;
  status: LedgerStatus;
  confidence_score: number | null;
  description: string | null;
  category: string | null;
  vendor: string | null;
  client: string | null;
  source_note: string | null;
  division_id: string | null;
};

export type ProjectFinancials = {
  projectId: string | null;
  // Confirmed = status in (confirmed, reconciled)
  confirmedRevenue: number;
  confirmedExpenses: number; // includes overhead share
  confirmedProfit: number;
  // Needs-review (separate; never silently mixed)
  needsReviewRevenue: number;
  needsReviewExpenses: number;
  needsReviewCount: number;
  // Components for debugging / detail screens
  directExpenses: number; // confirmed direct (no overhead, no splits-as-receiver)
  splitExpenses: number; // confirmed share received via splits
  overhead: number; // prorated overhead share
  margin: number; // confirmedProfit / confirmedRevenue (0 if no revenue)
};

const CONFIRMED: ReadonlySet<LedgerStatus> = new Set(["confirmed", "reconciled"]);
const NEEDS_REVIEW: ReadonlySet<LedgerStatus> = new Set(["needs_review", "suggested"]);

// ---------- Pure aggregation (testable, no I/O) ----------

export function aggregateProject(
  entries: LedgerEntry[],
  projectId: string | null,
  overheadForProject = 0,
): ProjectFinancials {
  let confirmedRevenue = 0;
  let confirmedExpenses = 0;
  let needsReviewRevenue = 0;
  let needsReviewExpenses = 0;
  let needsReviewCount = 0;
  let directExpenses = 0;
  let splitExpenses = 0;

  for (const e of entries) {
    if (e.project_id !== projectId) continue;
    const amt = Number(e.amount) || 0;
    const isConfirmed = CONFIRMED.has(e.status);
    const isReview = NEEDS_REVIEW.has(e.status);
    if (e.direction === "income") {
      if (isConfirmed) confirmedRevenue += amt;
      else if (isReview) {
        needsReviewRevenue += amt;
        needsReviewCount += 1;
      }
    } else {
      if (isConfirmed) {
        confirmedExpenses += amt;
        if (e.source_type === "expense_split") splitExpenses += amt;
        else directExpenses += amt;
      } else if (isReview) {
        needsReviewExpenses += amt;
        needsReviewCount += 1;
      }
    }
  }
  confirmedExpenses += overheadForProject;
  const confirmedProfit = confirmedRevenue - confirmedExpenses;
  const margin = confirmedRevenue > 0 ? confirmedProfit / confirmedRevenue : 0;
  return {
    projectId,
    confirmedRevenue: round2(confirmedRevenue),
    confirmedExpenses: round2(confirmedExpenses),
    confirmedProfit: round2(confirmedProfit),
    needsReviewRevenue: round2(needsReviewRevenue),
    needsReviewExpenses: round2(needsReviewExpenses),
    needsReviewCount,
    directExpenses: round2(directExpenses),
    splitExpenses: round2(splitExpenses),
    overhead: round2(overheadForProject),
    margin,
  };
}

export type CompanyFinancialSummary = {
  confirmedRevenue: number;
  confirmedExpenses: number;
  confirmedProfit: number;
  needsReviewRevenue: number;
  needsReviewExpenses: number;
  needsReviewCount: number;
  unassignedExpenses: number; // count of confirmed expense rows with no project
  unassignedPayments: number; // count of confirmed payment rows with no project
  byProject: Map<string, ProjectFinancials>;
};

export function aggregateCompany(
  entries: LedgerEntry[],
  overheadByProject: Map<string, number>,
  options?: { excludeProjectIds?: Set<string> },
): CompanyFinancialSummary {
  const exclude = options?.excludeProjectIds ?? new Set<string>();
  const filtered = entries.filter(
    (e) => !(e.project_id && exclude.has(e.project_id)),
  );
  const projectIds = new Set<string>();
  for (const e of filtered) if (e.project_id) projectIds.add(e.project_id);

  let confirmedRevenue = 0;
  let confirmedExpenses = 0;
  let needsReviewRevenue = 0;
  let needsReviewExpenses = 0;
  let needsReviewCount = 0;
  let unassignedExpenses = 0;
  let unassignedPayments = 0;

  for (const e of filtered) {
    const amt = Number(e.amount) || 0;
    const isConfirmed = CONFIRMED.has(e.status);
    const isReview = NEEDS_REVIEW.has(e.status);
    if (e.direction === "income") {
      if (isConfirmed) {
        confirmedRevenue += amt;
        if (!e.project_id) unassignedPayments += 1;
      } else if (isReview) {
        needsReviewRevenue += amt;
        needsReviewCount += 1;
      }
    } else {
      if (isConfirmed) {
        confirmedExpenses += amt;
        if (!e.project_id) unassignedExpenses += 1;
      } else if (isReview) {
        needsReviewExpenses += amt;
        needsReviewCount += 1;
      }
    }
  }

  // Add the prorated overhead (excluded projects are skipped)
  for (const [pid, share] of overheadByProject) {
    if (exclude.has(pid)) continue;
    confirmedExpenses += share;
  }

  const byProject = new Map<string, ProjectFinancials>();
  for (const pid of projectIds) {
    byProject.set(pid, aggregateProject(filtered, pid, overheadByProject.get(pid) ?? 0));
  }

  return {
    confirmedRevenue: round2(confirmedRevenue),
    confirmedExpenses: round2(confirmedExpenses),
    confirmedProfit: round2(confirmedRevenue - confirmedExpenses),
    needsReviewRevenue: round2(needsReviewRevenue),
    needsReviewExpenses: round2(needsReviewExpenses),
    needsReviewCount,
    unassignedExpenses,
    unassignedPayments,
    byProject,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- I/O wrappers ----------

export async function fetchLedger(): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from("project_financial_ledger" as any)
    .select("*");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    amount: Number(r.amount),
    confidence_score: r.confidence_score == null ? null : Number(r.confidence_score),
  })) as LedgerEntry[];
}

async function fetchOverheadInputs(): Promise<{
  overheadExpenses: OverheadExpenseRow[];
  projects: OverheadProjectRow[];
}> {
  const [exp, proj] = await Promise.all([
    supabase.from("expenses").select("project_id, amount, spent_on, is_overhead"),
    supabase.from("projects").select("id, is_sandbox, exclude_from_overhead"),
  ]);
  if (exp.error) throw exp.error;
  if (proj.error) throw proj.error;
  return {
    overheadExpenses: (exp.data ?? []) as OverheadExpenseRow[],
    projects: (proj.data ?? []) as OverheadProjectRow[],
  };
}

/**
 * Reusable per-project financial calculation. Used by Dashboard,
 * ProjectDetail, Reports, Ledger and Bank Reconciliation exports.
 */
export async function getProjectFinancials(
  projectId: string,
): Promise<ProjectFinancials> {
  const [entries, oh] = await Promise.all([fetchLedger(), fetchOverheadInputs()]);
  const overhead = computeOverheadByProject(oh.overheadExpenses, oh.projects);
  return aggregateProject(entries, projectId, overhead.get(projectId) ?? 0);
}

export async function getCompanyFinancialSummary(options?: {
  excludeSandbox?: boolean;
}): Promise<CompanyFinancialSummary> {
  const [entries, oh] = await Promise.all([fetchLedger(), fetchOverheadInputs()]);
  const overhead = computeOverheadByProject(oh.overheadExpenses, oh.projects);
  const exclude = new Set<string>();
  if (options?.excludeSandbox !== false) {
    for (const p of oh.projects) if ((p as any).is_sandbox) exclude.add(p.id);
  }
  return aggregateCompany(entries, overhead, { excludeProjectIds: exclude });
}
