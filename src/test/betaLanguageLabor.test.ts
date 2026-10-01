import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("beta language and labor visibility", () => {
  it("keeps the visible Reports experience in simple Spanish", () => {
    const reports = source("src/pages/Reports.tsx");
    for (const copy of ["Reportes financieros", "Desde", "Hasta", "Cobrado", "Gastado", "Ganancia", "Categorías", "Proveedores", "Divisiones", "No hay datos en este periodo."]) {
      expect(reports).toContain(copy);
    }
    for (const copy of [">Financial Reports<", ">Collected<", ">Spent<", ">Profit<", ">Categories<", ">Vendors<", ">Divisions<", "No data in range."]) {
      expect(reports).not.toContain(copy);
    }
  });

  it("uses Ayudantes consistently on external worker surfaces", () => {
    expect(source("src/pages/Workers.tsx")).toContain(">Ayudantes<");
    expect(source("src/components/workers/WorkerPicker.tsx")).toContain("Asignar ayudante");
    expect(source("src/components/tasks/TaskCreateSheet.tsx")).toContain(">Ayudante<");
    expect(source("src/components/tasks/TaskEditSheet.tsx")).toContain('label="Ayudante"');
    expect(source("src/pages/ExpenseDiscrepancies.tsx")).toContain("Sin ayudante");
  });

  it("loads check-ins without nonexistent PostgREST embeds and preserves RLS-scoped lookups", () => {
    const hook = source("src/hooks/useCheckins.ts");
    expect(hook).toContain('.from("worker_checkins")');
    expect(hook).toContain('.select("*")');
    expect(hook).not.toContain('workers(name, trade), projects(name), divisions(name)');
    expect(hook).not.toContain("service_role");
    const migration = source("supabase/migrations/20260502044138_26df46c3-e702-4046-9192-ea0aab2d7323.sql");
    expect(migration).toContain("USING (is_company_member(company_id))");
  });

  it("renders labor costs and hours as separate concepts grouped by job", () => {
    const page = source("src/pages/Checkins.tsx");
    expect(page).toContain("Resumen por trabajo");
    expect(page).toContain("Costos registrados");
    expect(page).toContain("Horas registradas");
    expect(page).toContain("Todos los trabajos");
    expect(page).toContain("Todavía no hay mano de obra registrada para este trabajo.");
  });

  it("shares labor classification with Project Detail financials without changing profit", () => {
    const hooks = source("src/hooks/useTrifectaData.ts");
    expect(hooks).toContain("const isLabor = isLaborExpense(r)");
    expect(hooks).toContain("const profit = fin.confirmedProfit");
    expect(hooks).toContain("const spent = fin.confirmedExpenses");
  });
});
