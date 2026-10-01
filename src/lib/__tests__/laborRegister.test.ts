import { describe, expect, it } from "vitest";
import { laborExpenseTotal } from "@/lib/labor";
import { buildLaborProjectGroups, checkinHours } from "@/lib/laborRegister";

const expenses = [
  { id: "e-a1", project_id: "A", worker_id: "w1", spent_on: "2026-08-01", amount: 300, projects: { name: "Trabajo A" }, workers: { name: "Ana" }, categories: { name: "Labor" }, is_overhead: false },
  { id: "e-a2", project_id: "A", worker_id: "w2", spent_on: "2026-08-02", amount: 200, projects: { name: "Trabajo A" }, workers: { name: "Luis" }, categories: { name: "Material" }, is_overhead: false },
  { id: "e-b1", project_id: "B", worker_id: "w2", spent_on: "2026-08-03", amount: 125, projects: { name: "Trabajo B" }, workers: { name: "Luis" }, categories: { name: "Mano de obra" }, is_overhead: false },
  { id: "e-material", project_id: "A", worker_id: null, spent_on: "2026-08-04", amount: 999, projects: { name: "Trabajo A" }, categories: { name: "Material" }, is_overhead: false },
];

const checkins = [
  { id: "c-a", project_id: "A", worker_id: "w1", checked_in_at: "2026-08-01T13:00:00Z", checked_out_at: "2026-08-01T17:00:00Z", projects: { name: "Trabajo A" }, workers: { name: "Ana" } },
  { id: "c-b", project_id: "B", worker_id: "w2", checked_in_at: "2026-08-03T13:00:00Z", checked_out_at: "2026-08-03T15:30:00Z", projects: { name: "Trabajo B" }, workers: { name: "Luis" } },
];

describe("labor register", () => {
  it("groups authorized labor costs and reliable hours by job", () => {
    const groups = buildLaborProjectGroups(expenses, checkins);
    expect(groups.map((group) => group.projectName)).toEqual(["Trabajo A", "Trabajo B"]);
    expect(groups.find((group) => group.projectId === "A")).toMatchObject({ totalCost: 500, totalHours: 4 });
    expect(groups.find((group) => group.projectId === "B")).toMatchObject({ totalCost: 125, totalHours: 2.5 });
  });

  it("does not leak labor from another job through a project filter", () => {
    const groups = buildLaborProjectGroups(expenses, checkins, { projectId: "A" });
    expect(groups).toHaveLength(1);
    expect(groups[0].expenses.every((row) => row.project_id === "A")).toBe(true);
    expect(groups[0].checkins.every((row) => row.project_id === "A")).toBe(true);
  });

  it("uses the same labor expense classification and total as Project Detail", () => {
    const projectExpenses = expenses.filter((row) => row.project_id === "A");
    const register = buildLaborProjectGroups(projectExpenses, []);
    expect(register[0].totalCost).toBe(laborExpenseTotal(projectExpenses));
  });

  it("keeps hours separate from paid cost and ignores open or invalid sessions", () => {
    expect(checkinHours(checkins[0])).toBe(4);
    expect(checkinHours({ ...checkins[0], checked_out_at: null })).toBe(0);
    const groups = buildLaborProjectGroups([], checkins);
    expect(groups[0].totalCost).toBe(0);
    expect(groups[0].totalHours).toBe(4);
  });

  it("returns no groups only when neither labor costs nor closed hours match", () => {
    expect(buildLaborProjectGroups([], [])).toEqual([]);
    expect(buildLaborProjectGroups(expenses, checkins, { from: "2027-01-01" })).toEqual([]);
  });
});
