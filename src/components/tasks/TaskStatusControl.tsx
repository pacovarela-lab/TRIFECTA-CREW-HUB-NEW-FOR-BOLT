import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { useUpdateTask } from "@/hooks/useTrifectaData";
import { statusColor, isOverdue } from "@/lib/format";
import type { TaskStatus } from "@/lib/enums";

const OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Sin empezar" },
  { value: "in_progress", label: "En proceso" },
  { value: "blocked", label: "Bloqueado" },
  { value: "completed", label: "Completado" },
];

interface Props {
  task: any;
}

export function TaskStatusControl({ task }: Props) {
  const update = useUpdateTask();
  const [open, setOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const overdue = isOverdue(task.planned_end_date, task.status);
  const effective = overdue ? "overdue" : task.status;
  const saving = update.isPending;

  const apply = (status: TaskStatus, extra: Record<string, any> = {}) => {
    const patch: any = { status, ...extra };
    if (status === "completed" && !task.actual_end_date) {
      patch.actual_end_date = new Date().toISOString().slice(0, 10);
    }
    update.mutate({ id: task.id, patch, projectId: task.project_id });
  };

  const handleSelect = (status: TaskStatus) => {
    setOpen(false);
    if (status === task.status) return;
    if (status === "blocked") {
      setBlockReason("");
      setBlockOpen(true);
      return;
    }
    apply(status);
  };

  const submitBlocked = () => {
    const trimmed = blockReason.trim();
    const notes = trimmed
      ? (task.notes ? `${task.notes}\n\nBloqueada: ${trimmed}` : `Bloqueada: ${trimmed}`)
      : task.notes;
    apply("blocked", notes !== task.notes ? { notes } : {});
    setBlockOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={saving}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 disabled:opacity-60"
            aria-label="Cambiar estado de la tarea"
          >
            <Badge className={`${statusColor(effective)} cursor-pointer gap-1`}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {effective.replace("_", " ")}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-48 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col">
            {OPTIONS.map((o) => {
              const selected = o.value === task.status;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className="flex items-center justify-between rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent"
                >
                  <span>{o.label}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>¿Por qué está bloqueada esta tarea?</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Razón breve opcional (ej. esperando materiales)"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            rows={4}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancelar</Button>
            <Button onClick={submitBlocked}>Marcar bloqueada</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
