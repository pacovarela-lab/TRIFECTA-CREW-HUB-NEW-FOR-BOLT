import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBusinessUnitMutations, useBusinessUnits } from "@/hooks/useBusinessUnits";
import { useUserRoles } from "@/hooks/useUserRoles";

const friendlyError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  if (code === "23505") return "Ya existe un área con ese nombre.";
  if (code === "23503") return "Esta área tiene proyectos históricos. Desactívala en lugar de eliminarla.";
  return (error as Error)?.message || "No se pudo guardar el área.";
};

export function BusinessUnitsSettings() {
  const { data: units = [], isLoading } = useBusinessUnits();
  const { isAdmin, isManager } = useUserRoles();
  const { create, update, remove } = useBusinessUnitMutations();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const canManage = isAdmin || isManager;

  const add = async () => {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name, description, sortOrder: (units.at(-1)?.sort_order ?? 0) + 10 });
      setName("");
      setDescription("");
      toast.success("Área creada");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const rename = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await update.mutateAsync({ id, patch: { name: editingName, description: editingDescription.trim() || null } });
      setEditingId(null);
      toast.success("Área actualizada");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (other < 0 || other >= units.length) return;
    try {
      await Promise.all([
        update.mutateAsync({ id: units[index].id, patch: { sort_order: units[other].sort_order } }),
        update.mutateAsync({ id: units[other].id, patch: { sort_order: units[index].sort_order } }),
      ]);
    } catch (error) {
      toast.error(friendlyError(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Empresa · Áreas del negocio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Clasifica proyectos por línea de negocio. Cada compañía administra su propia lista.
        </p>
        {canManage && (
          <div className="space-y-2">
            <Label htmlFor="new-business-unit">Nueva área</Label>
            <div className="flex gap-2">
              <Input
                id="new-business-unit"
                className="h-11"
                value={name}
                maxLength={80}
                placeholder="Ej. Remodelaciones"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void add(); }}
              />
              <Button className="h-11 shrink-0" onClick={() => void add()} disabled={!name.trim() || create.isPending}>
                <Plus className="mr-1 h-4 w-4" /> Agregar
              </Button>
            </div>
            <Input
              className="h-11"
              value={description}
              maxLength={240}
              placeholder="Descripción opcional"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        )}

        {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : units.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No hay áreas configuradas. Los proyectos pueden continuar sin esta clasificación.
          </p>
        ) : (
          <div className="space-y-2">
            {units.map((unit, index) => (
              <div key={unit.id} className="rounded-lg border p-3">
                {editingId === unit.id ? (
                  <div className="space-y-2">
                    <Input className="h-10" value={editingName} maxLength={80} onChange={(event) => setEditingName(event.target.value)} />
                    <Input className="h-10" value={editingDescription} maxLength={240} placeholder="Descripción opcional" onChange={(event) => setEditingDescription(event.target.value)} />
                    <Button className="h-10 w-full" onClick={() => void rename(unit.id)}>Guardar</Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{unit.name}</p>
                      {unit.description && <p className="line-clamp-2 text-xs text-muted-foreground">{unit.description}</p>}
                      <p className="text-xs text-muted-foreground">{unit.is_active ? "Activa" : "Inactiva · visible en proyectos históricos"}</p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" aria-label="Subir área" disabled={index === 0} onClick={() => void move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Bajar área" disabled={index === units.length - 1} onClick={() => void move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Editar área" onClick={() => { setEditingId(unit.id); setEditingName(unit.name); setEditingDescription(unit.description ?? ""); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={unit.is_active ? "Desactivar área" : "Reactivar área"} onClick={async () => {
                          try { await update.mutateAsync({ id: unit.id, patch: { is_active: !unit.is_active } }); }
                          catch (error) { toast.error(friendlyError(error)); }
                        }}><Power className="h-4 w-4" /></Button>
                        {!unit.is_active && <Button variant="ghost" size="icon" aria-label="Eliminar área" className="text-destructive" onClick={async () => {
                          try { await remove.mutateAsync(unit.id); toast.success("Área eliminada"); }
                          catch (error) { toast.error(friendlyError(error)); }
                        }}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!canManage && <p className="text-xs text-muted-foreground">Solo administradores y managers pueden modificar estas áreas.</p>}
      </CardContent>
    </Card>
  );
}
