/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkers, useCreateWorker, useUpdateWorker, useDivisions } from "@/hooks/useTrifectaData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { Plus, Pencil, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { findSimilar } from "@/lib/similarity";

const useCompanyAccounts = () =>
  useQuery({
    queryKey: ["company-accounts"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data: me } = await supabase.from("profiles").select("company_id").eq("id", auth.user.id).single();
      if (!me?.company_id) return [];
      const { data, error } = await supabase.from("profiles").select("id,full_name,email").eq("company_id", me.company_id);
      if (error) throw error;
      return data ?? [];
    },
  });

const empty = { name: "", phone: "", email: "", trade: "", worker_type: "worker", default_division_id: "__none", notes: "", active: true };

const Workers = () => {
  const { data, isLoading } = useWorkers();
  const { data: divisions } = useDivisions();
  const { data: accounts } = useCompanyAccounts();
  const create = useCreateWorker();
  const update = useUpdateWorker();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [q, setQ] = useState("");

  const [newW, setNewW] = useState<any>(empty);
  const [editW, setEditW] = useState<any>({});

  const filtered = useMemo(() => {
    const list = data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((w: any) =>
      w.name?.toLowerCase().includes(s) ||
      w.trade?.toLowerCase().includes(s) ||
      (w.phone ?? "").replace(/\D/g, "").includes(s.replace(/\D/g, "")),
    );
  }, [data, q]);

  const similar = useMemo(
    () => findSimilar((data ?? []).filter((w: any) => w.id !== editing?.id), { name: newW.name, phone: newW.phone, email: newW.email }),
    [data, newW, editing],
  );

  const submitNew = async (force = false) => {
    if (!newW.name.trim()) return;
    if (!force && similar.length > 0) return;
    await create.mutateAsync({
      name: newW.name.trim(),
      email: newW.email || null,
      phone: newW.phone || null,
      trade: newW.trade || null,
      worker_type: newW.worker_type as any,
      default_division_id: newW.default_division_id === "__none" ? null : newW.default_division_id,
      notes: newW.notes || null,
      active: true,
    } as any);
    setNewW(empty);
    setAdding(false);
  };

  const submitEdit = async () => {
    await update.mutateAsync({
      id: editing.id,
      patch: {
        name: editW.name?.trim() || editing.name,
        email: editW.email || null,
        phone: editW.phone || null,
        trade: editW.trade || null,
        worker_type: editW.worker_type as any,
        default_division_id: editW.default_division_id === "__none" ? null : editW.default_division_id,
        notes: editW.notes || null,
        active: !!editW.active,
        user_id: editW.user_id === "__none" ? null : editW.user_id,
      } as any,
    });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ayudantes</h1>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" /> Agregar</Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9" placeholder="Buscar por nombre, oficio o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : filtered.length === 0 ? (
        (data ?? []).length === 0 ? (
          <Card><CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-base font-semibold">Aún no hay ayudantes</p>
            <p className="text-sm text-muted-foreground">Agrega ayudantes y subcontratistas para asignarlos a tareas y gastos.</p>
            <Button onClick={() => setAdding(true)} className="h-11"><Plus className="mr-1 h-4 w-4" /> Agregar primero</Button>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Sin resultados para "{q}".</CardContent></Card>
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((w: any) => (
            <Card key={w.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{w.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {w.trade ?? (w.worker_type === "subcontractor" ? "Subcontratista" : "Ayudante")} · {w.phone ?? w.email ?? "Sin contacto"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{w.worker_type === "subcontractor" ? "Subcontratista" : "Ayudante"}</Badge>
                  {!w.user_id && <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">Sin calendario</Badge>}
                  <Badge variant={w.active ? "default" : "outline"} className={w.active ? "bg-success text-success-foreground" : ""}>
                    {w.active ? "Activo" : "Inactivo"}
                  </Badge>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(w); setEditW({ name: w.name, email: w.email ?? "", phone: w.phone ?? "", trade: w.trade ?? "", worker_type: w.worker_type ?? "worker", default_division_id: w.default_division_id ?? "__none", notes: w.notes ?? "", active: w.active, user_id: w.user_id ?? "__none" }); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add */}
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Agregar ayudante</SheetTitle>
            <SheetDescription>Quedará disponible para todos los trabajos de tu empresa.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <Field label="Nombre *"><Input className="h-11" value={newW.name} onChange={(e) => setNewW({ ...newW, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono"><Input className="h-11" value={newW.phone} onChange={(e) => setNewW({ ...newW, phone: e.target.value })} /></Field>
              <Field label="Email"><Input className="h-11" type="email" value={newW.email} onChange={(e) => setNewW({ ...newW, email: e.target.value })} /></Field>
              <Field label="Oficio / función"><Input className="h-11" placeholder="Ej. Plomería" value={newW.trade} onChange={(e) => setNewW({ ...newW, trade: e.target.value })} /></Field>
              <Field label="Tipo">
                <Select value={newW.worker_type} onValueChange={(v) => setNewW({ ...newW, worker_type: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Ayudante</SelectItem>
                    <SelectItem value="subcontractor">Subcontratista</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="División predeterminada">
                <Select value={newW.default_division_id} onValueChange={(v) => setNewW({ ...newW, default_division_id: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Ninguna —</SelectItem>
                    {divisions?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Notas"><Input className="h-11" value={newW.notes} onChange={(e) => setNewW({ ...newW, notes: e.target.value })} /></Field>
            {similar.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="mb-1 font-semibold">Este ayudante podría estar registrado:</p>
                <ul className="mb-2 space-y-0.5 text-xs text-muted-foreground">
                  {similar.map((m) => <li key={m.record.id}>{m.record.name} — {m.reasons.join(", ")}</li>)}
                </ul>
                <Button type="button" variant="outline" size="sm" onClick={() => submitNew(true)}>Crear de todos modos</Button>
              </div>
            )}
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setAdding(false)} className="h-11">Cancelar</Button>
            <Button onClick={() => submitNew(false)} disabled={create.isPending || !newW.name.trim() || similar.length > 0} className="h-11">
              {create.isPending ? "Agregando…" : "Agregar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit */}
      <Sheet open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Editar ayudante</SheetTitle>
            <SheetDescription>Desactívalo para ocultarlo al asignar tareas nuevas.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <Field label="Nombre"><Input className="h-11" value={editW.name ?? ""} onChange={(e) => setEditW({ ...editW, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono"><Input className="h-11" value={editW.phone ?? ""} onChange={(e) => setEditW({ ...editW, phone: e.target.value })} /></Field>
              <Field label="Email"><Input className="h-11" type="email" value={editW.email ?? ""} onChange={(e) => setEditW({ ...editW, email: e.target.value })} /></Field>
              <Field label="Oficio / función"><Input className="h-11" value={editW.trade ?? ""} onChange={(e) => setEditW({ ...editW, trade: e.target.value })} /></Field>
              <Field label="Tipo">
                <Select value={editW.worker_type ?? "worker"} onValueChange={(v) => setEditW({ ...editW, worker_type: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Ayudante</SelectItem>
                    <SelectItem value="subcontractor">Subcontratista</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="División predeterminada">
                <Select value={editW.default_division_id ?? "__none"} onValueChange={(v) => setEditW({ ...editW, default_division_id: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Ninguna —</SelectItem>
                    {divisions?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Cuenta de la app (para su Google Calendar)">
              <Select value={editW.user_id ?? "__none"} onValueChange={(v) => setEditW({ ...editW, user_id: v })}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Sin cuenta vinculada" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Sin cuenta vinculada —</SelectItem>
                  {(accounts ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <p className="-mt-2 text-xs text-muted-foreground">Sin cuenta vinculada, sus tareas no se sincronizan con Google Calendar ni envían recordatorios.</p>
            <Field label="Notas"><Input className="h-11" value={editW.notes ?? ""} onChange={(e) => setEditW({ ...editW, notes: e.target.value })} /></Field>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Activo</p>
                <p className="text-xs text-muted-foreground">Los ayudantes inactivos no se pueden asignar a tareas nuevas.</p>
              </div>
              <Switch checked={!!editW.active} onCheckedChange={(v) => setEditW({ ...editW, active: v })} />
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} className="h-11">Cancelar</Button>
            <Button onClick={submitEdit} disabled={update.isPending} className="h-11">
              {update.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>
);

export default Workers;
