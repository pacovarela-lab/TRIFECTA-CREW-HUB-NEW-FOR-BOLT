import type { TaskStatus } from "@/lib/enums";

export type KanbanColumn = {
  id: TaskStatus;
  label: string;
  statuses: TaskStatus[];
};

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "pending", label: "Pendiente", statuses: ["pending", "overdue"] },
  { id: "in_progress", label: "En proceso", statuses: ["in_progress", "blocked"] },
  { id: "completed", label: "Completado", statuses: ["completed", "cancelled"] },
];

export function columnForStatus(status: string): string {
  for (const col of KANBAN_COLUMNS) {
    if (col.statuses.includes(status as TaskStatus)) return col.id;
  }
  return "pending";
}

export function canMoveTo(targetColumn: string, currentStatus: string): boolean {
  const col = columnForStatus(currentStatus);
  return col !== targetColumn;
}

export function statusForColumn(columnId: string): TaskStatus {
  if (columnId === "pending") return "pending";
  if (columnId === "in_progress") return "in_progress";
  return "completed";
}
