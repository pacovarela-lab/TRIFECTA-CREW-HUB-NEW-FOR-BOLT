import { describe, it, expect } from "vitest";
import {
  aggregateProject,
  aggregateCompany,
  type LedgerEntry,
} from "@/lib/financialLedger";
import { computeOverheadAllocation, computeOverheadByProject, scopeOverheadToProjects } from "@/lib/overhead";

const mk = (e: Partial<LedgerEntry>): LedgerEntry => ({
  company_id: "co",
  project_id: null,
  source_type: "expense",
  source_id: Math.random().toString(36).slice(2),
  expense_id: null,
  date: "2026-06-15",
  amount: 0,
  direction: "expense",
  status: "confirmed",
  confidence_score: null,
  description: null,
  category: null,
  vendor: null,
  client: null,
  source_note: null,
  division_id: null,
  ...e,
});

describe("financialLedger.aggregateProject", () => {
  it("sums a direct expense to the correct project only", () => {
    const entries = [
      mk({ project_id: "A", amount: 100 }),
      mk({ project_id: "B", amount: 999 }),
    ];
    const a = aggregateProject(entries, "A");
    expect(a.confirmedExpenses).toBe(100);
    expect(a.directExpenses).toBe(100);
    const b = aggregateProject(entries, "B");
    expect(b.confirmedExpenses).toBe(999);
  });

  it("distributes an expense split to each receiving project", () => {
    const entries = [
      mk({ project_id: "A", source_type: "expense_split", amount: 30 }),
      mk({ project_id: "B", source_type: "expense_split", amount: 70 }),
    ];
    expect(aggregateProject(entries, "A").confirmedExpenses).toBe(30);
    expect(aggregateProject(entries, "A").splitExpenses).toBe(30);
    expect(aggregateProject(entries, "B").confirmedExpenses).toBe(70);
  });

  it("adds prorated overhead and counts confirmed payments as revenue", () => {
    const entries = [
      mk({ project_id: "A", direction: "income", source_type: "payment", amount: 1000 }),
      mk({ project_id: "A", amount: 200 }),
    ];
    const a = aggregateProject(entries, "A", 50);
    expect(a.confirmedRevenue).toBe(1000);
    expect(a.confirmedExpenses).toBe(250); // 200 direct + 50 overhead
    expect(a.overhead).toBe(50);
    expect(a.confirmedProfit).toBe(750);
    expect(a.margin).toBeCloseTo(0.75, 5);
  });

  it("never mixes needs_review into confirmed profit", () => {
    const entries = [
      mk({ project_id: "A", direction: "income", source_type: "payment", amount: 500 }),
      mk({ project_id: "A", amount: 100 }), // confirmed
      mk({ project_id: "A", amount: 9999, status: "needs_review" }),
    ];
    const a = aggregateProject(entries, "A");
    expect(a.confirmedExpenses).toBe(100);
    expect(a.confirmedProfit).toBe(400);
    expect(a.needsReviewExpenses).toBe(9999);
    expect(a.needsReviewCount).toBe(1);
  });

  it("reconciled rows count as confirmed", () => {
    const entries = [
      mk({ project_id: "A", amount: 42, status: "reconciled" }),
    ];
    expect(aggregateProject(entries, "A").confirmedExpenses).toBe(42);
  });
});

describe("financialLedger.aggregateCompany ↔ aggregateProject", () => {
  it("Dashboard and ProjectDetail return identical totals for the same project", () => {
    const entries: LedgerEntry[] = [
      mk({ project_id: "A", amount: 120 }),
      mk({ project_id: "A", source_type: "expense_split", amount: 30 }),
      mk({ project_id: "A", direction: "income", source_type: "payment", amount: 500 }),
      mk({ project_id: "B", amount: 50 }),
      mk({ project_id: null, amount: 17 }),
      mk({ project_id: "A", amount: 1000, status: "needs_review" }),
    ];
    const overhead = new Map([["A", 25], ["B", 5]]);
    const company = aggregateCompany(entries, overhead);
    const direct = aggregateProject(entries, "A", overhead.get("A") ?? 0);
    const fromCompany = company.byProject.get("A")!;
    expect(fromCompany.confirmedRevenue).toBe(direct.confirmedRevenue);
    expect(fromCompany.confirmedExpenses).toBe(direct.confirmedExpenses);
    expect(fromCompany.confirmedProfit).toBe(direct.confirmedProfit);
    expect(fromCompany.needsReviewExpenses).toBe(direct.needsReviewExpenses);
  });

  it("counts unassigned confirmed expenses and payments", () => {
    const entries: LedgerEntry[] = [
      mk({ project_id: null, amount: 10 }),
      mk({ project_id: null, amount: 20 }),
      mk({ project_id: null, direction: "income", source_type: "payment", amount: 80 }),
    ];
    const summary = aggregateCompany(entries, new Map());
    expect(summary.unassignedExpenses).toBe(2);
    expect(summary.unassignedPayments).toBe(1);
  });

  it("excludes sandbox projects from rollups", () => {
    const entries: LedgerEntry[] = [
      mk({ project_id: "REAL", amount: 100 }),
      mk({ project_id: "SANDBOX", amount: 9999 }),
    ];
    const summary = aggregateCompany(entries, new Map(), {
      excludeProjectIds: new Set(["SANDBOX"]),
    });
    expect(summary.confirmedExpenses).toBe(100);
    expect(summary.byProject.has("SANDBOX")).toBe(false);
  });
});

describe("overhead proration", () => {
  it("distributes overhead proportionally to monthly direct activity", () => {
    // June 2026: project A spent 300, B spent 100 direct. Overhead pool 80.
    // Share: A = 80 * 300/400 = 60, B = 80 * 100/400 = 20.
    const result = computeOverheadByProject(
      [
        { project_id: "A", amount: 300, spent_on: "2026-06-10", is_overhead: false },
        { project_id: "B", amount: 100, spent_on: "2026-06-20", is_overhead: false },
        { project_id: null, amount: 80, spent_on: "2026-06-15", is_overhead: true },
      ],
      [
        { id: "A" },
        { id: "B" },
      ],
    );
    expect(result.get("A")).toBeCloseTo(60, 5);
    expect(result.get("B")).toBeCloseTo(20, 5);
  });

  it("skips excluded and sandbox projects from overhead allocation", () => {
    const result = computeOverheadByProject(
      [
        { project_id: "A", amount: 100, spent_on: "2026-06-10", is_overhead: false },
        { project_id: "SBX", amount: 100, spent_on: "2026-06-10", is_overhead: false },
        { project_id: null, amount: 50, spent_on: "2026-06-15", is_overhead: true },
      ],
      [
        { id: "A" },
        { id: "SBX", is_sandbox: true },
      ],
    );
    expect(result.get("A")).toBeCloseTo(50, 5);
    expect(result.get("SBX")).toBeUndefined();
  });
});

describe("Business Area profitability scope", () => {
  const entries = [
    mk({ project_id: "E1", direction: "income", amount: 10_000 }),
    mk({ project_id: "E1", direction: "expense", amount: 4_000 }),
    mk({ project_id: "P1", direction: "income", amount: 8_000 }),
    mk({ project_id: "P1", direction: "expense", amount: 3_000 }),
    mk({ project_id: "B1", direction: "expense", amount: 99_999 }),
  ];
  const overheadRows = [
    { project_id: "E1", amount: 500, spent_on: "2026-08-05", is_overhead: true },
    { project_id: "P1", amount: 300, spent_on: "2026-08-06", is_overhead: true },
    { project_id: null, amount: 1_000, spent_on: "2026-08-07", is_overhead: true },
    { project_id: "E1", amount: 4_000, spent_on: "2026-08-05", is_overhead: false },
    { project_id: "P1", amount: 3_000, spent_on: "2026-08-06", is_overhead: false },
  ];
  const projects = [{ id: "E1" }, { id: "P1" }, { id: "B1" }];

  it("keeps company overhead in All Areas", () => {
    const allocation = computeOverheadAllocation(overheadRows, projects);
    const summary = aggregateCompany(entries.filter((row) => row.project_id !== "B1"), allocation.totalByProject);
    expect(summary.confirmedRevenue).toBe(18_000);
    expect(summary.confirmedExpenses).toBe(8_800);
    expect(summary.confirmedProfit).toBe(9_200);
  });

  it("scopes Electrical revenue, project cost and directly assigned overhead", () => {
    const allocation = computeOverheadAllocation(overheadRows, projects);
    const ids = new Set(["E1"]);
    const summary = aggregateCompany(
      entries.filter((row) => row.project_id && ids.has(row.project_id)),
      scopeOverheadToProjects(allocation.directlyAssignedByProject, ids),
    );
    expect(summary.confirmedRevenue).toBe(10_000);
    expect(summary.confirmedExpenses).toBe(4_500);
    expect(summary.confirmedProfit).toBe(5_500);
  });

  it("scopes Plumbing without Electrical or company overhead", () => {
    const allocation = computeOverheadAllocation(overheadRows, projects);
    const ids = new Set(["P1"]);
    const summary = aggregateCompany(
      entries.filter((row) => row.project_id && ids.has(row.project_id)),
      scopeOverheadToProjects(allocation.directlyAssignedByProject, ids),
    );
    expect(summary.confirmedRevenue).toBe(8_000);
    expect(summary.confirmedExpenses).toBe(3_300);
    expect(summary.confirmedProfit).toBe(4_700);
  });

  it("keeps archived area projects and another tenant outside the selected scope", () => {
    const allocation = computeOverheadAllocation(overheadRows, projects);
    const archivedAreaIds = new Set(["E1"]);
    const scoped = entries.filter((row) => row.project_id && archivedAreaIds.has(row.project_id));
    const summary = aggregateCompany(scoped, scopeOverheadToProjects(allocation.directlyAssignedByProject, archivedAreaIds));
    expect(summary.confirmedRevenue).toBe(10_000);
    expect(summary.confirmedExpenses).toBe(4_500);
  });
});
