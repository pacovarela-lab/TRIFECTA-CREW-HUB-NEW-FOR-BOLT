// Derived project status: On Track / At Risk / Delayed / Completed
export type DerivedStatus = "on_track" | "at_risk" | "delayed" | "completed";

export interface DeriveInput {
  storedStatus?: string | null;
  profit: number;
  collected: number;
  hasOverdueTasks: boolean;
  totalTasks: number;
  completedTasks: number;
}

export const deriveProjectStatus = (i: DeriveInput): DerivedStatus => {
  if (i.storedStatus === "completed") return "completed";
  if (i.totalTasks > 0 && i.completedTasks === i.totalTasks) return "completed";
  if (i.hasOverdueTasks) return "delayed";
  if (i.profit < 0) return "at_risk";
  // Close to negative: margin under 5% with meaningful collected revenue
  if (i.collected > 0 && i.profit / i.collected < 0.05) return "at_risk";
  return "on_track";
};

export const statusLabel = (s: DerivedStatus) =>
  ({ on_track: "En marcha", at_risk: "En riesgo", delayed: "Atrasado", completed: "Completado" }[s]);

export const statusBadgeClass = (s: DerivedStatus) =>
  ({
    on_track: "bg-success text-success-foreground",
    at_risk: "bg-warning text-warning-foreground",
    delayed: "bg-destructive text-destructive-foreground",
    completed: "bg-muted text-muted-foreground",
  }[s]);
