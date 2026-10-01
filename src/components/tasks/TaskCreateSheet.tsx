/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTask, useTasks, useProjects } from "@/hooks/useTrifectaData";
import { TASK_PRIORITIES, TASK_PHASES, type TaskPhase } from "@/lib/enums";
import { WorkerPicker } from "@/components/workers/WorkerPicker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: any; // optional; if absent a project picker is shown
}

export const TaskCreateSheet = ({ open, onOpenChange, project: projectProp }: Props) => {
  const { data: projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectProp?.id ?? "");
  useEffect(() => {
    if (open && !projectProp && projects && projects.length > 0) {
      // Auto-pick the first project if none chosen yet or current selection no longer exists
      const stillExists = projects.some((p: any) => p.id === selectedProjectId);
      if (!selectedProjectId || !stillExists) setSelectedProjectId(projects[0].id);
    }
  }, [open, projectProp, selectedProjectId, projects]);
  const project = projectProp ?? (projects ?? []).find((p: any) => p.id === selectedProjectId);
  // Only fetch existing tasks when we have a project (avoid pulling ALL tasks)
  const { data: existing } = useTasks(project?.id ?? undefined);
  const create = useCreateTask();
  const [f, setF] = useState<any>({
    title: "", priority: "medium", assigned_worker_id: null,
    planned_start_date: "", due_time: "09:00", duration_minutes: 60, planned_end_date: "", estimated_duration_hours: "", description: "",
    task_type: "", task_phase: "",
  });

  const submit = async () => {
    if (!project) { toast.error("Selecciona un proyecto"); return; }
    if (!f.title.trim()) { toast.error("Escribe un título"); return; }
    if (!project.company_id || !project.division_id) {
      toast.error("El proyecto no tiene compañía/división válida");
      return;
    }
    const nextPos = Array.isArray(existing)
      ? existing.reduce((m: number, t: any) => Math.max(m, t.position ?? 0), -1) + 1
      : 0;
    try {
      await create.mutateAsync({
        company_id: project.company_id,
        division_id: project.division_id,
        project_id: project.id,
        project_type: project.project_type ?? "other",
        title: f.title.trim(),
        description: f.description || null,
        task_type: f.task_type || null,
        task_phase: (f.task_phase as TaskPhase) || null,
        assigned_worker_id: f.assigned_worker_id ?? null,
        status: "pending",
        priority: f.priority,
        planned_start_date: f.planned_start_date || null,
        due_time: f.due_time || "09:00",
        duration_minutes: Number(f.duration_minutes || 60),
        planned_end_date: f.planned_end_date || null,
        estimated_duration_hours: f.estimated_duration_hours === "" ? null : Number(f.estimated_duration_hours),
        position: nextPos,
      });
      setF({ title: "", priority: "medium", assigned_worker_id: null, planned_start_date: "", due_time: "09:00", duration_minutes: 60, planned_end_date: "", estimated_duration_hours: "", description: "", task_type: "", task_phase: "" });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? e?.details ?? "No se pudo crear la tarea");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Agregar tarea</SheetTitle>
          <SheetDescription>Agrega una tarea manual a este proyecto.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 py-3">
          {!projectProp && (
            <div className="space-y-1"><Label className="text-xs">Proyecto *</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona un proyecto" /></SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1"><Label className="text-xs">Título *</Label>
            <Input className="h-11" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2"><Label className="text-xs">Ayudante</Label>
              <WorkerPicker
                value={f.assigned_worker_id}
                onChange={(id) => setF({ ...f, assigned_worker_id: id })}
                divisionId={project?.division_id}
                projectType={project?.project_type}
                taskType={f.task_type || f.title}
              />
            </div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Tipo de tarea / oficio</Label>
              <Input className="h-11" placeholder="ej. plomería, demolición, pintura" value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Etapa del trabajo</Label>
              <Select value={f.task_phase} onValueChange={(v) => setF({ ...f, task_phase: v })}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Sin etapa" /></SelectTrigger>
                <SelectContent>
                  {TASK_PHASES.map((ph) => <SelectItem key={ph.value} value={ph.value}>{ph.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Prioridad</Label>
              <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Inicio planificado</Label>
              <Input className="h-11" type="date" value={f.planned_start_date} onChange={(e) => setF({ ...f, planned_start_date: e.target.value })} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Hora (zona de la empresa)</Label>
              <Input className="h-11" type="time" value={f.due_time} onChange={(e) => setF({ ...f, due_time: e.target.value })} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Duración (minutos)</Label>
              <Input className="h-11" type="number" min={5} max={1440} value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Fin planificado</Label>
              <Input className="h-11" type="date" value={f.planned_end_date} onChange={(e) => setF({ ...f, planned_end_date: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Horas est.</Label>
              <Input className="h-11" type="number" value={f.estimated_duration_hours} onChange={(e) => setF({ ...f, estimated_duration_hours: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Descripción</Label>
            <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending || !f.title.trim() || !project} className="h-11">
            {create.isPending ? "Agregando…" : "Agregar tarea"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
