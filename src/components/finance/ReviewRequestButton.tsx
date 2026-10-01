/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UserCheck, CheckCircle2 } from "lucide-react";
import {
  useCompanyMembers, useCreateReviewRequest, useResolveReviewRequest, useReviewRequestsFor,
  type ReviewEntityType,
} from "@/hooks/useReviewRequests";
import { toast } from "sonner";

interface Props {
  entityType: ReviewEntityType;
  entityId?: string | null;
  /** Short text describing the record, included in the notification. */
  summary?: string | null;
}

export function ReviewRequestButton({ entityType, entityId, summary }: Props) {
  const [open, setOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [note, setNote] = useState("");
  const { data: members = [] } = useCompanyMembers();
  const { data: requests = [] } = useReviewRequestsFor(entityType, entityId);
  const create = useCreateReviewRequest();
  const resolve = useResolveReviewRequest();

  if (!entityId) return null;

  const openRequests = requests.filter((r: any) => r.status === "open");

  const submit = async () => {
    if (!assignedTo) { toast.error("Elige a quién le pides la revisión"); return; }
    await create.mutateAsync({ entityType, entityId, assignedTo, note, summary });
    setNote("");
    setAssignedTo("");
    setOpen(false);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Pedir revisión a…</p>
          <p className="text-xs text-muted-foreground">Le llega como tarea sencilla con aviso.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-9 shrink-0">
              <UserCheck className="mr-1 h-4 w-4" /> Asignar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pedir revisión</DialogTitle>
              <DialogDescription>La persona verá este pendiente y recibirá un aviso.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Persona *</Label>
                <SearchableSelect
                  options={members.map((m: any) => ({
                    value: m.id,
                    label: m.full_name || m.email || "Sin nombre",
                    hint: m.full_name ? m.email : undefined,
                  }))}
                  value={assignedTo}
                  onChange={setAssignedTo}
                  placeholder="Selecciona a quién"
                  searchPlaceholder="Buscar persona…"
                  emptyText="Nadie coincide"
                />
              </div>
              <div>
                <Label>Nota (opcional)</Label>
                <Textarea
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="¿De qué trabajo es este gasto?"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={submit} disabled={create.isPending}>
                {create.isPending ? "Asignando…" : "Asignar revisión"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {openRequests.length > 0 && (
        <div className="space-y-1">
          {openRequests.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
              <p className="min-w-0 truncate text-xs">
                Revisión pendiente{r.note ? `: ${r.note}` : ""}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 text-xs"
                onClick={() => resolve.mutate(r.id)}
                disabled={resolve.isPending}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> Resuelta
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
