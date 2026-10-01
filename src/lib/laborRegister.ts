import { isLaborExpense, type LaborExpenseRow } from "@/lib/labor";

export type LaborRegisterExpense = LaborExpenseRow & {
  id: string;
  project_id?: string | null;
  spent_on?: string | null;
  projects?: { name?: string | null } | null;
  workers?: { name?: string | null } | null;
};

export type LaborRegisterCheckin = {
  id: string;
  project_id?: string | null;
  worker_id?: string | null;
  checked_in_at: string;
  checked_out_at?: string | null;
  projects?: { name?: string | null } | null;
  workers?: { name?: string | null } | null;
};

export type LaborRegisterFilters = {
  projectId?: string | null;
  workerId?: string | null;
  from?: string | null;
  to?: string | null;
};

export type LaborProjectGroup = {
  projectId: string | null;
  projectName: string;
  expenses: LaborRegisterExpense[];
  checkins: LaborRegisterCheckin[];
  totalCost: number;
  totalHours: number;
};

const dateInRange = (date: string, filters: LaborRegisterFilters) =>
  (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);

export const checkinHours = (row: LaborRegisterCheckin): number => {
  if (!row.checked_out_at) return 0;
  const elapsed = new Date(row.checked_out_at).getTime() - new Date(row.checked_in_at).getTime();
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed / 3_600_000 : 0;
};

export const buildLaborProjectGroups = (
  expenses: ReadonlyArray<LaborRegisterExpense>,
  checkins: ReadonlyArray<LaborRegisterCheckin>,
  filters: LaborRegisterFilters = {},
): LaborProjectGroup[] => {
  const groups = new Map<string, LaborProjectGroup>();
  const getGroup = (projectId: string | null, projectName?: string | null) => {
    const key = projectId ?? "__unassigned";
    let group = groups.get(key);
    if (!group) {
      group = {
        projectId,
        projectName: projectName || "Sin trabajo asignado",
        expenses: [],
        checkins: [],
        totalCost: 0,
        totalHours: 0,
      };
      groups.set(key, group);
    }
    return group;
  };

  for (const expense of expenses) {
    const date = expense.spent_on ?? "";
    if (!isLaborExpense(expense) || !dateInRange(date, filters)) continue;
    if (filters.projectId && expense.project_id !== filters.projectId) continue;
    if (filters.workerId && expense.worker_id !== filters.workerId) continue;
    const group = getGroup(expense.project_id ?? null, expense.projects?.name);
    group.expenses.push(expense);
    group.totalCost += Number(expense.amount) || 0;
  }

  for (const checkin of checkins) {
    if (!checkin.checked_out_at) continue;
    const date = checkin.checked_in_at.slice(0, 10);
    if (!dateInRange(date, filters)) continue;
    if (filters.projectId && checkin.project_id !== filters.projectId) continue;
    if (filters.workerId && checkin.worker_id !== filters.workerId) continue;
    const group = getGroup(checkin.project_id ?? null, checkin.projects?.name);
    group.checkins.push(checkin);
    group.totalHours += checkinHours(checkin);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalCost: Math.round(group.totalCost * 100) / 100,
      totalHours: Math.round(group.totalHours * 10) / 10,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
};
