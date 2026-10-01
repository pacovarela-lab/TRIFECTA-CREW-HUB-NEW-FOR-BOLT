/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Plus, Search, Sparkles, AlertTriangle } from "lucide-react";
import { useDivisions, useWorkerSuggestions, useWorkers, useCreateWorker } from "@/hooks/useTrifectaData";
import { findSimilar } from "@/lib/similarity";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  value: string | null; // worker id or null
  onChange: (workerId: string | null) => void;
  divisionId?: string | null;
  projectType?: string | null;
  taskType?: string | null;
  className?: string;
}

export const WorkerPicker = ({ value, onChange, divisionId, projectType, taskType, className }: Props) => {
  const { data: workers } = useWorkers();
  const { data: suggestions } = useWorkerSuggestions({ divisionId, projectType, taskType });
  const { data: divisions } = useDivisions();
  const create = useCreateWorker();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  // New worker form
  const [n, setN] = useState<any>({
    name: "", phone: "", email: "", trade: "",
    worker_type: "worker", default_division_id: divisionId ?? "__none",
    notes: "", active: true,
  });

  const selected = workers?.find((w: any) => w.id === value);

  const filtered = useMemo(() => {
    const list = (workers ?? []).filter((w: any) => w.active !== false);
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((w: any) =>
      w.name?.toLowerCase().includes(s) ||
      w.trade?.toLowerCase().includes(s) ||
      (w.phone ?? "").replace(/\D/g, "").includes(s.replace(/\D/g, "")),
    );
  }, [workers, search]);

  const similar = useMemo(() => {
    if (!n.name && !n.phone && !n.email) return [];
    return findSimilar(workers ?? [], { name: n.name, phone: n.phone, email: n.email });
  }, [workers, n.name, n.phone, n.email]);

  const submitNew = async (force = false) => {
    if (!n.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (!force && similar.length > 0) {
      toast.warning("Ya existe un ayudante similar; confirma para crear otro");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Inicia sesión para continuar"); return; }
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) { toast.error("No se encontró tu empresa"); return; }
    const { data, error } = await supabase.from("workers").insert({
      company_id: profile.company_id,
      name: n.name.trim(),
      phone: n.phone || null,
      email: n.email || null,
      trade: n.trade || null,
      worker_type: n.worker_type,
      default_division_id: n.default_division_id === "__none" ? null : n.default_division_id,
      notes: n.notes || null,
      active: !!n.active,
    }).select("*").single();
    if (error) { toast.error(error.message); return; }
    toast.success("Ayudante agregado");
    onChange(data.id);
    setAdding(false);
    setOpen(false);
    setN({ name: "", phone: "", email: "", trade: "", worker_type: "worker", default_division_id: divisionId ?? "__none", notes: "", active: true });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`h-11 w-full justify-between font-normal ${className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">
          {selected ? selected.name : "Sin asignar"}
          {selected?.trade && <span className="ml-1 text-xs text-muted-foreground">· {selected.trade}</span>}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Asignar ayudante</SheetTitle>
            <SheetDescription>Elige a alguien de tu equipo o agrega un ayudante o subcontratista.</SheetDescription>
          </SheetHeader>

          {!adding ? (
            <div className="space-y-3 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 pl-9"
                  placeholder="Buscar por nombre, oficio o teléfono"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {(suggestions ?? []).length > 0 && !search && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                    <Sparkles className="h-3 w-3" /> Sugeridos
                  </p>
                  <div className="space-y-1">
                    {suggestions!.slice(0, 3).map((s: any) => (
                      <Card key={s.id} role="button" onClick={() => { onChange(s.workers.id); setOpen(false); }} className="cursor-pointer">
                        <CardContent className="flex items-center justify-between p-3">
                          <div>
                            <p className="text-sm font-medium">{s.workers.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.workers.trade ?? "—"} · asignado {s.times_assigned}×
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">Sugerido</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full justify-start"
                onClick={() => { onChange(null); setOpen(false); }}
              >
                <span className="text-muted-foreground">— Sin asignar —</span>
              </Button>

              <div className="space-y-1">
                {filtered.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">Sin resultados.</p>
                ) : filtered.map((w: any) => (
                  <Card key={w.id} role="button" onClick={() => { onChange(w.id); setOpen(false); }} className="cursor-pointer">
                    <CardContent className="flex items-center justify-between p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{w.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {w.trade ?? w.worker_type} · {w.phone ?? w.email ?? "—"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{w.worker_type === "subcontractor" ? "Subcontratista" : "Ayudante"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button type="button" className="h-11 w-full" onClick={() => setAdding(true)}>
                <Plus className="mr-1 h-4 w-4" /> Agregar ayudante o subcontratista
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-3">
              <Field label="Nombre *">
                <Input className="h-11" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono">
                  <Input className="h-11" value={n.phone} onChange={(e) => setN({ ...n, phone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input className="h-11" type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />
                </Field>
                <Field label="Oficio / función">
                  <Input className="h-11" placeholder="Ej. Plomería" value={n.trade} onChange={(e) => setN({ ...n, trade: e.target.value })} />
                </Field>
                <Field label="Tipo">
                  <Select value={n.worker_type} onValueChange={(v) => setN({ ...n, worker_type: v })}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">Ayudante</SelectItem>
                      <SelectItem value="subcontractor">Subcontratista</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="División predeterminada">
                  <Select value={n.default_division_id} onValueChange={(v) => setN({ ...n, default_division_id: v })}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Ninguna —</SelectItem>
                      {divisions?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Activo</Label>
                  <Switch checked={!!n.active} onCheckedChange={(v) => setN({ ...n, active: v })} />
                </div>
              </div>
              <Field label="Notas">
                <Input className="h-11" value={n.notes} onChange={(e) => setN({ ...n, notes: e.target.value })} />
              </Field>

              {similar.length > 0 && (
                <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                  <p className="flex items-center gap-1 text-sm font-semibold text-warning-foreground">
                    <AlertTriangle className="h-4 w-4" /> Este ayudante podría estar registrado
                  </p>
                  {similar.map((m) => (
                    <button
                      key={m.record.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded border border-border bg-background p-2 text-left"
                      onClick={() => { onChange(m.record.id); setOpen(false); setAdding(false); }}
                    >
                      <div>
                        <p className="text-sm font-medium">{m.record.name}</p>
                        <p className="text-xs text-muted-foreground">{m.reasons.join(" · ")}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">Usar existente</Badge>
                    </button>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => submitNew(true)} className="w-full">
                    Crear de todos modos
                  </Button>
                </div>
              )}

              <SheetFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setAdding(false)} className="h-11">Volver</Button>
                <Button type="button" onClick={() => submitNew(false)} disabled={create.isPending || !n.name.trim()} className="h-11">
                  {create.isPending ? "Agregando…" : "Agregar ayudante"}
                </Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>
);
