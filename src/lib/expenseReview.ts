/* eslint-disable @typescript-eslint/no-explicit-any, no-useless-escape */
export type ExpenseIssueKind = "future_date" | "labor_no_worker" | "unknown_labor" | "unassigned" | "pending_evidence" | "no_category";

export const isLaborExpense = (expense: any) =>
  /labor/i.test(expense?.categories?.name ?? "") || /^\s*labor[:\s\-]/i.test(expense?.description ?? "");

export const isProratedOverheadExpense = (expense: any) =>
  !expense?.project_id && !!expense?.is_overhead;

export const expenseEditStartsUnassigned = (expense: any) =>
  !expense?.project_id && !!expense?.is_overhead;

const hasIdentifiedPayee = (expense: any) => {
  const vendorName = (expense?.vendors?.name ?? "").trim();
  if (vendorName) return true;

  const description = expense?.description ?? "";
  return /labor\s*[:\-]\s*([^—\-|·,\n]+)/i.test(description) || /zelle payment to\s+([^";\n]+)/i.test(description);
};

export const getExpenseIssueKinds = (expense: any, today = new Date().toISOString().slice(0, 10)): ExpenseIssueKind[] => {
  const issues: ExpenseIssueKind[] = [];

  if (expense?.spent_on && expense.spent_on > today) issues.push("future_date");

  if (!expense?.is_overhead && isLaborExpense(expense) && !expense?.worker_id && !hasIdentifiedPayee(expense)) {
    const hasNameHint = /labor\s*[:\-]\s*([^—\-|·,\n]+)/i.test(expense?.description ?? "");
    issues.push(hasNameHint ? "unknown_labor" : "labor_no_worker");
  }

  if (/\[PENDIENTE/i.test(expense?.description ?? "")) issues.push("pending_evidence");

  // A prorated general expense is intentionally not attached to one project.
  // It is allocated into project financials through monthly overhead proration.
  if (!expense?.project_id && !expense?.is_overhead) issues.push("unassigned");

  // Missing category keeps the expense pending even when everything else was fixed.
  if (!expense?.category_id && !(expense?.categories?.name ?? "").trim()) issues.push("no_category");

  return issues;
};

export type ExpenseReviewSaveAction = "stay_open" | "prompt_learning" | "close";

export const getExpenseReviewSaveAction = (
  expense: any,
  hasLearningDraft: boolean,
  today?: string,
): { issues: ExpenseIssueKind[]; action: ExpenseReviewSaveAction } => {
  const issues = getExpenseIssueKinds(expense, today);
  if (issues.length > 0) return { issues, action: "stay_open" };
  return { issues, action: hasLearningDraft ? "prompt_learning" : "close" };
};

export const formatIssueKind = (kind: ExpenseIssueKind) => {
  switch (kind) {
    case "future_date":
      return "Fecha futura";
    case "labor_no_worker":
      return "Labor sin worker";
    case "unknown_labor":
      return "Labor por identificar";
    case "unassigned":
      return "Sin proyecto";
    case "pending_evidence":
      return "Pendiente evidencia";
    case "no_category":
      return "Sin categoría";
    default:
      return "Necesita revisión";
  }
};