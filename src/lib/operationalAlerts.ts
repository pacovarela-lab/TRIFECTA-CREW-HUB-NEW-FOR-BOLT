export type ProjectAlertInput = {
  project_id: string;
  project_name: string;
  division_id: string | null;
  labor_real: number;
  labor_estimated: number;
  total_costs: number;
  total_collected: number;
  last_activity_date: string | null;
};

export type ComputedAlert = {
  kind: string;
  severity: "critical" | "warning" | "info";
  message: string;
  project_id: string;
  division_id: string | null;
};

const LABOR_OVERBUDGET = "labor_overbudget";
const TEMPORARY_DEFICIT = "temporary_deficit";
const PROJECT_INACTIVE = "project_inactive_14d";

const INACTIVITY_THRESHOLD_DAYS = 14;

export function computeProjectAlerts(
  input: ProjectAlertInput,
  today: string,
): ComputedAlert[] {
  const alerts: ComputedAlert[] = [];

  if (input.labor_estimated > 0 && input.labor_real > input.labor_estimated) {
    alerts.push({
      kind: LABOR_OVERBUDGET,
      severity: "warning",
      message: `⚠️ Los pagos de mano de obra ($${input.labor_real.toFixed(2)}) ya superaron el presupuesto estimado ($${input.labor_estimated.toFixed(2)}).`,
      project_id: input.project_id,
      division_id: input.division_id,
    });
  }

  if (input.total_costs > input.total_collected) {
    const deficit = input.total_costs - input.total_collected;
    alerts.push({
      kind: TEMPORARY_DEFICIT,
      severity: "warning",
      message: `🔴 Este trabajo presenta un déficit temporal de $${deficit.toFixed(2)}.`,
      project_id: input.project_id,
      division_id: input.division_id,
    });
  }

  if (input.last_activity_date) {
    const last = new Date(input.last_activity_date);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate.getTime() - last.getTime()) / 86400_000);
    if (diffDays > INACTIVITY_THRESHOLD_DAYS) {
      alerts.push({
        kind: PROJECT_INACTIVE,
        severity: "info",
        message: `🔵 Trabajo inactivo: sin movimientos durante los últimos ${diffDays} días.`,
        project_id: input.project_id,
        division_id: input.division_id,
      });
    }
  }

  return alerts;
}

export { LABOR_OVERBUDGET, TEMPORARY_DEFICIT, PROJECT_INACTIVE };
