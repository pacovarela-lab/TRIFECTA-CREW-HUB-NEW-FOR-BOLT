/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSearchParams } from "react-router-dom";
import { useTasks, useUpdateTask } from "@/hooks/useTrifectaData";
import { Badge } from "@/components/ui/badge";
import { statusColor, isOverdue } from "@/lib/format";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskEditSheet } from "@/components/tasks/TaskEditSheet";
import { TaskStatusControl } from "@/components/tasks/TaskStatusControl";
import { TASK_PHASES } from "@/lib/enums";
import { KANBAN_COLUMNS, columnForStatus, statusForColumn } from "@/lib/taskKanban";
import { LayoutList, Columns3, ChevronDown, ChevronRight, Clock } from "lucide-react";

const filters = ["all", "today", "overdue", "completed"] as const;
type Filter = typeof filters[number];
const filterLabels: Record<Filter, string> = {
  all: "Todas",
  today: "Hoy",
  overdue: "Atrasadas",
  completed: "Completadas",
};

type ViewMode = "list" | "kanban";

const phaseLabel = (phase: string | null): string => {
  if (!phase) return null as any;
  const found = TASK_PHASES.find((p) => p.value === phase);
  return found?.label ?? phase;
};

const statusText = (effective: string): string => {
  if (effective === "completed") return "Completado";
  if (effective === "in_progress") return "En proceso";
  if (effective === "overdue") return "Atrasada";
  if (effective === "blocked") return "Bloqueada";
  if (effective === "cancelled") return "Cancelada";
  return "Pendiente";
};

const statusDot = (effective: string): string => {
  if (effective === "completed") return "bg-success";
  if (effective === "in_progress") return "bg-warning";
  if (effective === "overdue" || effective === "blocked") return "bg-destructive";
  if (effective === "cancelled") return "bg-muted-foreground";
  return "bg-info";
};

const Tasks = () => {
  const [params] = useSearchParams();
  const projectId = params.get("project") || undefined;
  const { data, isLoading } = useTasks(projectId);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<any>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [timelineOpen, setTimelineOpen] = useState(false);
  const update = useUpdateTask();

  const list = useMemo(() => {
    if (!data) return [];
    const today = new Date().toISOString().slice(0, 10);
    return data.filter((t: any) => {
      const overdue = isOverdue(t.planned_end_date, t.status);
      if (filter === "overdue") return overdue;
      if (filter === "completed") return t.status === "completed";
      if (filter === "today") return t.planned_end_date === today || t.planned_start_date === today;
      return true;
    });
  }, [data, filter]);

  const kanbanGroups = useMemo(() => {
    const groups: Record<string, any[]> = { pending: [], in_progress: [], completed: [] };
    for (const t of list) {
      const col = columnForStatus(t.status);
      groups[col].push(t);
    }
    return groups;
  }, [list]);

  const moveTask = async (taskId: string, targetColumn: string, currentProjectId: string) => {
    const newStatus = statusForColumn(targetColumn);
    await update.mutateAsync({ id: taskId, projectId: currentProjectId, patch: { status: newStatus } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tareas{projectId ? " · Trabajo" : ""}</h1>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            onClick={() => setView("list")}
            className="h-8 gap-1.5"
          >
            <LayoutList className="h-4 w-4" /> Lista
          </Button>
          <Button
            size="sm"
            variant={view === "kanban" ? "default" : "ghost"}
            onClick={() => setView("kanban")}
            className="h-8 gap-1.5"
          >
            <Columns3 className="h-4 w-4" /> Kanban
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="h-11 rounded-lg px-4"
          >
            {filterLabels[f]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {KANBAN_COLUMNS.map((col) => (
            <div key={col.id} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold">{col.label}</p>
                <Badge variant="secondary" className="text-xs">{kanbanGroups[col.id]?.length ?? 0}</Badge>
              </div>
              <div className="space-y-2 rounded-lg bg-muted/40 p-2 min-h-[200px]">
                {(kanbanGroups[col.id] ?? []).map((t: any) => {
                  const overdue = isOverdue(t.planned_end_date, t.status);
                  const effective = overdue ? "overdue" : t.status;
                  return (
                    <div key={t.id} className="rounded-lg border bg-card p-3 cursor-pointer transition-colors hover:bg-accent/40">
                      <div onClick={() => setEditing(t)}>
                        <p className="truncate text-sm font-bold">{t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.workers?.name ?? "Sin asignar"} · <span className="money">{t.planned_end_date ?? "sin fecha"}</span>
                        </p>
                        {t.task_phase && (
                          <p className="mt-1 text-[10px] text-muted-foreground">{phaseLabel(t.task_phase)}</p>
                        )}
                      </div>
                      <div className="mt-2 flex gap-1">
                        {KANBAN_COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                          <Button
                            key={c.id}
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => moveTask(t.id, c.id, t.project_id)}
                          >
                            → {c.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {(kanbanGroups[col.id]?.length ?? 0) === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">Sin tareas</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Agrega algo que no quieres olvidar.</p>
      ) : (
        <>
          {/* Lista principal de tareas */}
          <div className="divide-y border rounded-lg bg-card">
            {list.map((t: any) => {
              const overdue = isOverdue(t.planned_end_date, t.status);
              const effective = overdue ? "overdue" : t.status;
              const secondary = [
                t.projects?.name,
                t.workers?.name ?? "Sin asignar",
                t.planned_end_date ?? null,
              ].filter(Boolean).join(" · ");
              return (
                <div
                  key={t.id}
                  role="button"
                  onClick={() => setEditing(t)}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/40"
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", statusDot(effective))} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {secondary || "Sin asignar · sin fecha"}
                    </p>
                  </div>
                  {overdue ? (
                    <span className="shrink-0 text-xs font-bold text-destructive">⚠ Atrasada</span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{statusText(effective)}</span>
                  )}
                  <TaskStatusControl task={t} />
                </div>
              );
            })}
          </div>

          {/* Cronología colapsada */}
          {data && data.length > 0 && (
            <div className="rounded-lg border bg-card">
              <button
                onClick={() => setTimelineOpen(!timelineOpen)}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
              >
                {timelineOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Clock className="h-4 w-4" />
                Ver cronología
              </button>
              {timelineOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  <div className="flex flex-wrap gap-1">
                    {data.map((t: any) => {
                      const overdue = isOverdue(t.planned_end_date, t.status);
                      const effective = overdue ? "overdue" : t.status;
                      return <span key={t.id} title={t.title} className={cn("h-3 w-6 rounded-sm", statusColor(effective))} />;
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <Legend swatch="bg-success" label="Completadas" />
                    <Legend swatch="bg-warning" label="En progreso" />
                    <Legend swatch="bg-destructive" label="Atrasadas" />
                    <Legend swatch="bg-info" label="Próximas" />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <TaskEditSheet open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </div>
  );
};


const Legend = ({ swatch, label }: { swatch: string; label: string }) => (
  <span className="inline-flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-sm", swatch)} />{label}</span>
);

export default Tasks;
