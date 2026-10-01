import { describe, it, expect } from "vitest";
import { computeProjectAlerts, type ProjectAlertInput } from "@/lib/operationalAlerts";

const TODAY = "2026-09-12";
const RECENT = "2026-09-08";
const OLD = "2026-08-20";

const base: ProjectAlertInput = {
  project_id: "p1",
  project_name: "Proyecto A",
  division_id: "d1",
  labor_real: 0,
  labor_estimated: 0,
  total_costs: 0,
  total_collected: 0,
  last_activity_date: RECENT,
};

describe("computeProjectAlerts — mano de obra sobre presupuesto", () => {
  it("alerta cuando mano_obra_real > mano_obra_estimada", () => {
    const alerts = computeProjectAlerts(
      { ...base, labor_real: 5000, labor_estimated: 3000 },
      TODAY,
    );
    const laborAlert = alerts.find((a) => a.kind === "labor_overbudget");
    expect(laborAlert).toBeDefined();
    expect(laborAlert!.severity).toBe("warning");
    expect(laborAlert!.message).toContain("$5000.00");
    expect(laborAlert!.message).toContain("$3000.00");
    expect(laborAlert!.message).toContain("mano de obra");
  });

  it("no alerta cuando mano_obra_real <= mano_obra_estimada", () => {
    const alerts = computeProjectAlerts(
      { ...base, labor_real: 3000, labor_estimated: 3000 },
      TODAY,
    );
    expect(alerts.find((a) => a.kind === "labor_overbudget")).toBeUndefined();
  });

  it("no alerta cuando no hay estimación de mano de obra", () => {
    const alerts = computeProjectAlerts(
      { ...base, labor_real: 5000, labor_estimated: 0 },
      TODAY,
    );
    expect(alerts.find((a) => a.kind === "labor_overbudget")).toBeUndefined();
  });
});

describe("computeProjectAlerts — déficit temporal", () => {
  it("alerta cuando costos_totales > pagos_recibidos", () => {
    const alerts = computeProjectAlerts(
      { ...base, total_costs: 8000, total_collected: 5000 },
      TODAY,
    );
    const deficitAlert = alerts.find((a) => a.kind === "temporary_deficit");
    expect(deficitAlert).toBeDefined();
    expect(deficitAlert!.severity).toBe("warning");
    expect(deficitAlert!.message).toContain("$3000.00");
    expect(deficitAlert!.message).toContain("déficit temporal");
  });

  it("no alerta cuando costos_totales <= pagos_recibidos", () => {
    const alerts = computeProjectAlerts(
      { ...base, total_costs: 5000, total_collected: 5000 },
      TODAY,
    );
    expect(alerts.find((a) => a.kind === "temporary_deficit")).toBeUndefined();
  });

  it("no alerta cuando pagos > costos", () => {
    const alerts = computeProjectAlerts(
      { ...base, total_costs: 3000, total_collected: 8000 },
      TODAY,
    );
    expect(alerts.find((a) => a.kind === "temporary_deficit")).toBeUndefined();
  });
});

describe("computeProjectAlerts — inactividad >14 días", () => {
  it("alerta cuando la última actividad fue hace más de 14 días", () => {
    const alerts = computeProjectAlerts(
      { ...base, last_activity_date: OLD },
      TODAY,
    );
    const inactiveAlert = alerts.find((a) => a.kind === "project_inactive_14d");
    expect(inactiveAlert).toBeDefined();
    expect(inactiveAlert!.severity).toBe("info");
    expect(inactiveAlert!.message).toContain("Trabajo inactivo");
    expect(inactiveAlert!.message).toContain("días");
  });

  it("no alerta cuando la última actividad fue reciente", () => {
    const alerts = computeProjectAlerts(
      { ...base, last_activity_date: RECENT },
      TODAY,
    );
    expect(alerts.find((a) => a.kind === "project_inactive_14d")).toBeUndefined();
  });

  it("no alerta cuando no hay fecha de actividad (null)", () => {
    const alerts = computeProjectAlerts(
      { ...base, last_activity_date: null },
      TODAY,
    );
    expect(alerts.find((a) => a.kind === "project_inactive_14d")).toBeUndefined();
  });
});

describe("computeProjectAlerts — combinaciones", () => {
  it("puede emitir múltiples alertas simultáneamente", () => {
    const alerts = computeProjectAlerts(
      {
        ...base,
        labor_real: 6000,
        labor_estimated: 4000,
        total_costs: 10000,
        total_collected: 3000,
        last_activity_date: OLD,
      },
      TODAY,
    );
    expect(alerts).toHaveLength(3);
    expect(alerts.map((a) => a.kind).sort()).toEqual([
      "labor_overbudget",
      "project_inactive_14d",
      "temporary_deficit",
    ]);
  });

  it("no emite ninguna alerta cuando todo está sano", () => {
    const alerts = computeProjectAlerts(
      {
        ...base,
        labor_real: 2000,
        labor_estimated: 4000,
        total_costs: 3000,
        total_collected: 5000,
        last_activity_date: RECENT,
      },
      TODAY,
    );
    expect(alerts).toHaveLength(0);
  });
});
