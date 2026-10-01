/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDivisions, useClients, useUpdateProject, useDeleteProject, useProjectDependencyCounts } from "@/hooks/useTrifectaData";
import { PROJECT_TYPES, PROJECT_STATUSES, type ProjectType, type ProjectStatus } from "@/lib/enums";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useBusinessUnits } from "@/hooks/useBusinessUnits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: any;
}

export const ProjectEditDialog = ({ open, onOpenChange, project }: Props) => {
  const { data: divisions } = useDivisions();
  const { data: clients } = useClients();
  const { data: businessUnits = [] } = useBusinessUnits();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const { data: deps } = useProjectDependencyCounts(project?.id);
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (project) setForm({
      name: project.name ?? "",
      client_id: project.client_id ?? "__none",
      address: project.address ?? "",
      division_id: project.division_id ?? "",
      business_unit_id: project.business_unit_id ?? "__none",
      project_type: project.project_type ?? "other",
      status: project.status ?? "active",
      estimated_total: project.estimated_total ?? 0,
      start_date: project.start_date ?? "",
      end_date: project.end_date ?? "",
      notes: project.notes ?? "",
      exclude_from_overhead: !!project.exclude_from_overhead,
    });
  }, [project]);

  const submit = async () => {
    await update.mutateAsync({
      id: project.id,
      patch: {
        name: form.name.trim(),
        client_id: form.client_id === "__none" ? null : form.client_id,
        address: form.address || null,
        division_id: form.division_id,
        business_unit_id: form.business_unit_id === "__none" ? null : form.business_unit_id,
        project_type: form.project_type as ProjectType,
        status: form.status as ProjectStatus,
        estimated_total: Number(form.estimated_total) || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        notes: form.notes || null,
        exclude_from_overhead: !!form.exclude_from_overhead,
      },
    });
    onOpenChange(false);
  };

  const hasDeps = (deps?.tasks ?? 0) + (deps?.expenses ?? 0) + (deps?.payments ?? 0) > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar trabajo</DialogTitle>
            <DialogDescription>Actualiza los datos y guarda los cambios.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="Nombre *">
              <Input className="h-11" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Organización interna *">
                <Select value={form.division_id} onValueChange={(v) => setForm({ ...form, division_id: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{divisions?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Tipo de trabajo">
                <Select value={form.project_type} onValueChange={(v) => setForm({ ...form, project_type: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Estado">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Presupuesto ($)">
                <Input className="h-11" type="number" value={form.estimated_total ?? 0} onChange={(e) => setForm({ ...form, estimated_total: e.target.value })} />
              </Field>
              <Field label="Fecha de inicio">
                <Input className="h-11" type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Field>
              <Field label="Fecha de fin">
                <Input className="h-11" type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Área del negocio">
              <Select value={form.business_unit_id ?? "__none"} onValueChange={(v) => setForm({ ...form, business_unit_id: v })}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Sin área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin área</SelectItem>
                  {businessUnits.filter((unit) => unit.is_active || unit.id === project?.business_unit_id).map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.name}{unit.is_active ? "" : " (inactiva)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cliente">
              <Select value={form.client_id ?? "__none"} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Sin cliente —</SelectItem>
                  {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Dirección">
              <Input className="h-11" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Notas">
              <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={!!form.exclude_from_overhead}
                onChange={(e) => setForm({ ...form, exclude_from_overhead: e.target.checked })}
              />
              <span className="text-sm">
                Excluir de prorrateo de gastos generales
                <span className="block text-xs text-muted-foreground">
                  Este proyecto no recibirá su parte proporcional de gastos generales del mes.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="h-11">
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">Cancelar</Button>
              <Button onClick={submit} disabled={update.isPending || !form.name?.trim() || !form.division_id} className="h-11">
                {update.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este trabajo?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasDeps ? (
                <span>
                  Este trabajo tiene <b>{deps?.tasks ?? 0}</b> tareas,{" "}
                  <b>{deps?.expenses ?? 0}</b> gastos y <b>{deps?.payments ?? 0}</b> cobros.
                  Todos los registros vinculados también se eliminarán de forma permanente.
                </span>
              ) : (
                <span>Esta acción no se puede deshacer.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await del.mutateAsync(project.id);
                setConfirmDelete(false);
                onOpenChange(false);
                navigate("/projects", { replace: true });
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
