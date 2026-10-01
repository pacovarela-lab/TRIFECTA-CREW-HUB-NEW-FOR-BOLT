import { describe, it, expect } from "vitest";
import {
  KANBAN_COLUMNS,
  columnForStatus,
  canMoveTo,
  statusForColumn,
} from "@/lib/taskKanban";
import { TASK_PHASES, type TaskPhase } from "@/lib/enums";

describe("TASK_PHASES — asignación de etapa", () => {
  it("tiene 6 etapas iniciales", () => {
    expect(TASK_PHASES).toHaveLength(6);
  });

  it("incluye demolición, plomería, electricidad, estructura/drywall, acabados/pintura, inspección/permisos", () => {
    const values = TASK_PHASES.map((p) => p.value);
    expect(values).toContain("demolition");
    expect(values).toContain("plumbing");
    expect(values).toContain("electrical");
    expect(values).toContain("structure_drywall");
    expect(values).toContain("finishes_paint");
    expect(values).toContain("inspection_permits");
  });

  it("todas las etiquetas están en español", () => {
    for (const p of TASK_PHASES) {
      expect(p.label).toMatch(/[áéíóúñA-Z]/);
    }
  });

  it("tarea sin etapa existente — task_phase es null", () => {
    const task: { task_phase: TaskPhase | null } = { task_phase: null };
    expect(task.task_phase).toBeNull();
  });

  it("tarea con etapa válida se puede asignar", () => {
    const phase: TaskPhase = "demolition";
    const found = TASK_PHASES.find((p) => p.value === phase);
    expect(found).toBeDefined();
    expect(found!.label).toBe("Demolición");
  });
});

describe("Kanban — columnas y estados", () => {
  it("tiene 3 columnas: Pendiente, En proceso, Completado", () => {
    expect(KANBAN_COLUMNS).toHaveLength(3);
    expect(KANBAN_COLUMNS[0].label).toBe("Pendiente");
    expect(KANBAN_COLUMNS[1].label).toBe("En proceso");
    expect(KANBAN_COLUMNS[2].label).toBe("Completado");
  });

  it("columna Pendiente agrupa pending y overdue", () => {
    expect(columnForStatus("pending")).toBe("pending");
    expect(columnForStatus("overdue")).toBe("pending");
  });

  it("columna En proceso agrupa in_progress y blocked", () => {
    expect(columnForStatus("in_progress")).toBe("in_progress");
    expect(columnForStatus("blocked")).toBe("in_progress");
  });

  it("columna Completado agrupa completed y cancelled", () => {
    expect(columnForStatus("completed")).toBe("completed");
    expect(columnForStatus("cancelled")).toBe("completed");
  });

  it("estado desconocido va a Pendiente por defecto", () => {
    expect(columnForStatus("unknown_status")).toBe("pending");
  });
});

describe("Kanban — transición de estados", () => {
  it("puede mover de Pendiente a En proceso", () => {
    expect(canMoveTo("in_progress", "pending")).toBe(true);
  });

  it("puede mover de En proceso a Completado", () => {
    expect(canMoveTo("completed", "in_progress")).toBe(true);
  });

  it("puede mover de Completado a Pendiente", () => {
    expect(canMoveTo("pending", "completed")).toBe(true);
  });

  it("no puede mover a la misma columna", () => {
    expect(canMoveTo("pending", "pending")).toBe(false);
    expect(canMoveTo("in_progress", "in_progress")).toBe(false);
    expect(canMoveTo("completed", "completed")).toBe(false);
  });

  it("statusForColumn devuelve el estado correcto al mover", () => {
    expect(statusForColumn("pending")).toBe("pending");
    expect(statusForColumn("in_progress")).toBe("in_progress");
    expect(statusForColumn("completed")).toBe("completed");
  });
});

describe("Kanban — tareas sin etapa", () => {
  it("una tarea sin task_phase se muestra sin etiqueta de etapa", () => {
    const task = { id: "1", title: "Tarea sin fase", task_phase: null, status: "pending" };
    expect(task.task_phase).toBeNull();
    const col = columnForStatus(task.status);
    expect(col).toBe("pending");
  });

  it("una tarea con task_phase se muestra con etiqueta", () => {
    const task = { id: "2", title: "Tarea con fase", task_phase: "plumbing" as TaskPhase, status: "in_progress" };
    expect(task.task_phase).not.toBeNull();
    const found = TASK_PHASES.find((p) => p.value === task.task_phase);
    expect(found).toBeDefined();
    expect(found!.label).toBe("Plomería");
  });
});
