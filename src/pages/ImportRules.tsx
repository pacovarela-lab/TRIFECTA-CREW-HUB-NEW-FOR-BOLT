import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Edit3 } from "lucide-react";
import { toast } from "sonner";

type Rule = {
  id: string;
  name: string;
  match_field: string;
  match_pattern: string;
  match_kind: string;
  set_project_id: string | null;
  set_category_id: string | null;
  set_vendor_id: string | null;
  set_client_id: string | null;
  set_type: string | null;
  auto_confirm: boolean;
  enabled: boolean;
  priority: number;
};

const FIELDS = [
  { v: "description", label: "Descripción" },
  { v: "vendor", label: "Proveedor (campo crudo)" },
  { v: "client", label: "Cliente (campo crudo)" },
  { v: "raw", label: "Toda la fila" },
];
const KINDS = [
  { v: "contains", label: "Contiene" },
  { v: "exact", label: "Exacto" },
  { v: "regex", label: "Regex" },
];
const TYPES = [
  { v: "", label: "— sin cambio —" },
  { v: "expense", label: "Gasto" },
  { v: "payment", label: "Pago" },
  { v: "bank_tx", label: "Movimiento de banco" },
  { v: "task", label: "Tarea" },
];

const empty: Partial<Rule> = {
  name: "", match_field: "description", match_pattern: "", match_kind: "contains",
  set_project_id: null, set_category_id: null, set_vendor_id: null, set_client_id: null,
  set_type: null, auto_confirm: false, enabled: true, priority: 100,
};

export default function ImportRules() {
  const nav = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [lookups, setLookups] = useState<{ projects: any[]; vendors: any[]; clients: any[]; categories: any[] }>({ projects: [], vendors: [], clients: [], categories: [] });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Rule>>(empty);

  const load = async () => {
    const [{ data: rs }, p, v, c, cat] = await Promise.all([
      (supabase as any).from("import_rules").select("*").order("priority", { ascending: false }).order("created_at"),
      supabase.from("projects").select("id, project_code, name"),
      supabase.from("vendors").select("id, name"),
      supabase.from("clients").select("id, name"),
      supabase.from("categories").select("id, name"),
    ]);
    setRules((rs ?? []) as Rule[]);
    setLookups({ projects: p.data ?? [], vendors: v.data ?? [], clients: c.data ?? [], categories: cat.data ?? [] });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!draft.name || !draft.match_pattern) { toast.error("Nombre y patrón son obligatorios"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user!.id).maybeSingle();
    const payload: any = { ...draft, company_id: prof?.company_id, created_by: user!.id };
    if (payload.set_type === "") payload.set_type = null;
    const { error } = draft.id
      ? await (supabase as any).from("import_rules").update(payload).eq("id", draft.id)
      : await (supabase as any).from("import_rules").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Regla guardada");
    setOpen(false); setDraft(empty); load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar regla?")) return;
    await (supabase as any).from("import_rules").delete().eq("id", id);
    load();
  };

  const toggle = async (r: Rule) => {
    await (supabase as any).from("import_rules").update({ enabled: !r.enabled }).eq("id", r.id);
    load();
  };

  const nameOf = (list: any[], id: string | null, codeKey?: string) => {
    if (!id) return null;
    const x = list.find((y) => y.id === id);
    return x ? (codeKey && x[codeKey] ? `${x[codeKey]} · ${x.name}` : x.name) : null;
  };

  return (
    <div className="container py-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => nav("/import-review")}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Reglas de importación</h1>
          <p className="text-xs text-muted-foreground">Se aplican automáticamente cada vez que subes un archivo. Prioridad alta gana.</p>
        </div>
        <Button onClick={() => { setDraft(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nueva regla</Button>
      </div>

      <div className="space-y-2">
        {rules.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            Aún no hay reglas. Crea una para autoclasificar movimientos repetitivos.
          </CardContent></Card>
        )}
        {rules.map((r) => (
          <Card key={r.id} className={r.enabled ? "" : "opacity-60"}>
            <CardContent className="p-4 flex items-center gap-3">
              <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  <Badge variant="outline" className="text-[10px]">prioridad {r.priority}</Badge>
                  {r.auto_confirm && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">auto-confirma</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Si <strong>{r.match_field}</strong> {r.match_kind === "contains" ? "contiene" : r.match_kind} <code className="px-1 py-0.5 bg-muted rounded">{r.match_pattern}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Asigna: {[
                    r.set_type && `tipo=${r.set_type}`,
                    nameOf(lookups.projects, r.set_project_id, "project_code") && `proyecto=${nameOf(lookups.projects, r.set_project_id, "project_code")}`,
                    nameOf(lookups.vendors, r.set_vendor_id) && `vendor=${nameOf(lookups.vendors, r.set_vendor_id)}`,
                    nameOf(lookups.clients, r.set_client_id) && `cliente=${nameOf(lookups.clients, r.set_client_id)}`,
                    nameOf(lookups.categories, r.set_category_id) && `categoría=${nameOf(lookups.categories, r.set_category_id)}`,
                  ].filter(Boolean).join(" · ") || "(sin acciones)"}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setDraft(r); setOpen(true); }}><Edit3 className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{draft.id ? "Editar regla" : "Nueva regla"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. Home Depot → Materiales" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Campo</Label>
                <Select value={draft.match_field} onValueChange={(v) => setDraft({ ...draft, match_field: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELDS.map((f) => <SelectItem key={f.v} value={f.v}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de coincidencia</Label>
                <Select value={draft.match_kind} onValueChange={(v) => setDraft({ ...draft, match_kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridad</Label>
                <Input type="number" value={draft.priority ?? 100} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Patrón</Label>
              <Input value={draft.match_pattern ?? ""} onChange={(e) => setDraft({ ...draft, match_pattern: e.target.value })} placeholder="Ej. HOME DEPOT" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tipo a asignar</Label>
                <Select value={draft.set_type ?? ""} onValueChange={(v) => setDraft({ ...draft, set_type: v || null })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Proyecto</Label>
                <Select value={draft.set_project_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, set_project_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ninguno —</SelectItem>
                    {lookups.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.project_code} · {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendor</Label>
                <Select value={draft.set_vendor_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, set_vendor_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ninguno —</SelectItem>
                    {lookups.vendors.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cliente</Label>
                <Select value={draft.set_client_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, set_client_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ninguno —</SelectItem>
                    {lookups.clients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Categoría</Label>
                <Select value={draft.set_category_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, set_category_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ninguna —</SelectItem>
                    {lookups.categories.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!!draft.auto_confirm} onCheckedChange={(v) => setDraft({ ...draft, auto_confirm: v })} />
              <Label className="!mt-0">Auto-confirmar (importa sin revisión humana)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
