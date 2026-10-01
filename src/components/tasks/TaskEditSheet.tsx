/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateTask, useDeleteTask } from "@/hooks/useTrifectaData";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PHASES, type TaskPhase } from "@/lib/enums";
import { WorkerPicker } from "@/components/workers/WorkerPicker";
import { Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: any;
}

export const TaskEditSheet = ({ open, onOpenChange, task }: Props) => {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [f, setF] = useState<any>({});

  useEffect(() => {
    if (task) setF({
      title: task.title ?? "",
      description: task.description ?? "",
      task_type: task.task_type ?? "",
      task_phase: task.task_phase ?? "",
      assigned_worker_id: task.assigned_worker_id ?? null,
      status: task.status ?? "pending",
      priority: task.priority ?? "medium",
      planned_start_date: task.planned_start_date ?? "",
      due_time: task.due_time?.slice(0,5) ?? "09:00",
      duration_minutes: task.duration_minutes ?? 60,
      planned_end_date: task.planned_end_date ?? "",
      actual_start_date: task.actual_start_date ?? "",
      actual_end_date: task.actual_end_date ?? "",
      estimated_duration_hours: task.estimated_duration_hours ?? "",
      notes: task.notes ?? "",
    });
  }, [task]);

  const submit = async () => {
    await update.mutateAsync({
      id: task.id,
      projectId: task.project_id,
      patch: {
        title: f.title.trim(),
        description: f.description || null,
        assigned_worker_id: f.assigned_worker_id ?? null,
        task_type: f.task_type || null,
        task_phase: (f.task_phase as TaskPhase) || null,
        status: f.status,
        priority: f.priority,
        planned_start_date: f.planned_start_date || null,
        due_time: f.due_time || "09:00",
        duration_minutes: Number(f.duration_minutes || 60),
        planned_end_date: f.planned_end_date || null,
        actual_start_date: f.actual_start_date || null,
        actual_end_date: f.actual_end_date || (f.status === "completed" && !task.actual_end_date ? new Date().toISOString().slice(0, 10) : null),
        estimated_duration_hours: f.estimated_duration_hours === "" ? null : Number(f.estimated_duration_hours),
        notes: f.notes || null,
      },
    });
    onOpenChange(false);
  };

  if (!task) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Editar tarea</SheetTitle>
            <SheetDescription>Todos los cambios se guardan en la base de datos.</SheetDescription>
          </SheetHeader>

          <div className="space-y-3 py-3">
            <Field label="Título *">
              <Input className="h-11" value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Descripción">
              <Textarea rows={2} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estado">
                <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Prioridad">
                <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Ayudante">
                <WorkerPicker
                  value={f.assigned_worker_id ?? null}
                  onChange={(id) => setF({ ...f, assigned_worker_id: id })}
                  divisionId={task?.division_id}
                  projectType={task?.project_type}
                  taskType={f.task_type || task?.task_type || f.title}
                />
              </Field>
              <Field label="Tipo de tarea / oficio">
                <Input className="h-11" placeholder="ej. plomería" value={f.task_type ?? ""} onChange={(e) => setF({ ...f, task_type: e.target.value })} />
              </Field>
              <Field label="Etapa del trabajo">
                <Select value={f.task_phase ?? ""} onValueChange={(v) => setF({ ...f, task_phase: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Sin etapa" /></SelectTrigger>
                  <SelectContent>
                    {TASK_PHASES.map((ph) => <SelectItem key={ph.value} value={ph.value}>{ph.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Horas est.">
                <Input className="h-11" type="number" value={f.estimated_duration_hours ?? ""} onChange={(e) => setF({ ...f, estimated_duration_hours: e.target.value })} />
              </Field>
              <Field label="Inicio planificado">
                <Input className="h-11" type="date" value={f.planned_start_date ?? ""} onChange={(e) => setF({ ...f, planned_start_date: e.target.value })} />
              </Field>
              <Field label="Fin planificado">
                <Input className="h-11" type="date" value={f.planned_end_date ?? ""} onChange={(e) => setF({ ...f, planned_end_date: e.target.value })} />
              </Field>
              <Field label="Inicio real">
                <Input className="h-11" type="date" value={f.actual_start_date ?? ""} onChange={(e) => setF({ ...f, actual_start_date: e.target.value })} />
              </Field>
              <Field label="Fin real">
                <Input className="h-11" type="date" value={f.actual_end_date ?? ""} onChange={(e) => setF({ ...f, actual_end_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Notas">
              <Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </Field>
          </div>

          <SheetFooter className="gap-2 sm:justify-between">
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="h-11">
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">Cancelar</Button>
              <Button onClick={submit} disabled={update.isPending || !f.title?.trim()} className="h-11">
                {update.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta tarea?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await del.mutateAsync({ id: task.id, projectId: task.project_id });
                setConfirmDelete(false);
                onOpenChange(false);
              }}
            >
              {del.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);
