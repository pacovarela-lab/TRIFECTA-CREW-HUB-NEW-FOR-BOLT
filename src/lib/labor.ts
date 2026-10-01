export type LaborExpenseRow = {
  amount?: number | null;
  category_id?: string | null;
  description?: string | null;
  is_overhead?: boolean | null;
  worker_id?: string | null;
  categories?: { name?: string | null } | null;
};

/** Mirrors the labor classification used by Project Detail without changing profitability. */
export const isLaborExpense = (row: LaborExpenseRow): boolean => {
  if (row.is_overhead) return false;
  const category = (row.categories?.name ?? "").toLowerCase();
  const description = (row.description ?? "").toLowerCase();
  return !!row.worker_id || /labor|mano de obra/.test(category) || /^(labor|mano de obra)[:\s-]/.test(description);
};

export const laborExpenseTotal = (rows: ReadonlyArray<LaborExpenseRow>): number =>
  rows.filter(isLaborExpense).reduce((total, row) => total + (Number(row.amount) || 0), 0);
