// Overhead proration: distribute "is_overhead" expenses across non-excluded
// projects, proportionally to each project's direct expense activity in the
// same calendar month (YYYY-MM by spent_on).
//
// Rules (per user spec):
// - Base: direct expenses (not payments).
// - Window: strict calendar month.
// - Eligible projects: not sandbox, not exclude_from_overhead.
// - If a month has overhead but no eligible activity → pool stays unassigned.

export type OverheadExpenseRow = {
  project_id: string | null;
  amount: number | string;
  spent_on: string;
  is_overhead: boolean | null;
};

export type OverheadProjectRow = {
  id: string;
  is_sandbox?: boolean | null;
  exclude_from_overhead?: boolean | null;
};

export type OverheadAllocation = {
  totalByProject: Map<string, number>;
  directlyAssignedByProject: Map<string, number>;
  companyAllocatedByProject: Map<string, number>;
};

export const ymKey = (d: string | null | undefined) =>
  d && typeof d === "string" && d.length >= 7 ? d.slice(0, 7) : "";

export function computeOverheadAllocation(
  expenses: OverheadExpenseRow[],
  projects: OverheadProjectRow[],
): OverheadAllocation {
  const eligible = new Set(
    projects
      .filter((p) => !p.is_sandbox && !p.exclude_from_overhead)
      .map((p) => p.id),
  );
  const byMonth = new Map<
    string,
    { pool: number; activity: Map<string, number> }
  >();
  const directlyAssignedByProject = new Map<string, number>();
  for (const e of expenses) {
    const ym = ymKey(e.spent_on);
    if (!ym) continue;
    let bucket = byMonth.get(ym);
    if (!bucket) {
      bucket = { pool: 0, activity: new Map() };
      byMonth.set(ym, bucket);
    }
    const amt = Number(e.amount) || 0;
    if (e.is_overhead && e.project_id && eligible.has(e.project_id)) {
      directlyAssignedByProject.set(
        e.project_id,
        (directlyAssignedByProject.get(e.project_id) ?? 0) + amt,
      );
    } else if (e.is_overhead) {
      bucket.pool += amt;
    } else if (e.project_id && eligible.has(e.project_id)) {
      bucket.activity.set(
        e.project_id,
        (bucket.activity.get(e.project_id) ?? 0) + amt,
      );
    }
  }
  const companyAllocatedByProject = new Map<string, number>();
  for (const { pool, activity } of byMonth.values()) {
    if (pool <= 0 || activity.size === 0) continue;
    const total = [...activity.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    for (const [pid, amt] of activity) {
      companyAllocatedByProject.set(
        pid,
        (companyAllocatedByProject.get(pid) ?? 0) + pool * (amt / total),
      );
    }
  }
  const totalByProject = new Map(directlyAssignedByProject);
  for (const [pid, amount] of companyAllocatedByProject) {
    totalByProject.set(pid, (totalByProject.get(pid) ?? 0) + amount);
  }
  return { totalByProject, directlyAssignedByProject, companyAllocatedByProject };
}

export function computeOverheadByProject(
  expenses: OverheadExpenseRow[],
  projects: OverheadProjectRow[],
): Map<string, number> {
  return computeOverheadAllocation(expenses, projects).totalByProject;
}

export function scopeOverheadToProjects(
  overhead: Map<string, number>,
  projectIds: ReadonlySet<string>,
): Map<string, number> {
  return new Map([...overhead].filter(([projectId]) => projectIds.has(projectId)));
}
