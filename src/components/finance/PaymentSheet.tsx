import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import {
  useProjects, useDivisions, useClients,
  useCreatePayment, useUpdatePayment, useCreateClient,
} from "@/hooks/useTrifectaData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPaymentIssueKinds, formatPaymentIssueKind } from "@/lib/paymentStatus";
import { Sparkles } from "lucide-react";
import { buildProjectName, inferKeyword } from "@/lib/projectNaming";
import { normalizeName } from "@/lib/normalize";

const METHODS = ["cash", "check", "card", "ach", "zelle", "venmo", "other"] as const;

const schema = z.object({
  unassigned: z.boolean(),
  project_id: z.string().nullable(),
  division_id: z.string().min(1, "La división es obligatoria"),
  client_id: z.string().nullable(),
  amount: z.number().positive("El monto debe ser mayor a 0"),
  method: z.enum(METHODS, { errorMap: () => ({ message: "El método es obligatorio" }) }),
  received_on: z.string().min(1, "La fecha es obligatoria"),
  notes: z.string().max(500).optional().nullable(),
});

interface InitialValues {
  amount?: number;
  received_on?: string;
  notes?: string;
  new_client?: string;
  client_id?: string | null;
  project_id?: string | null;
  division_id?: string;
  method?: string;
  bank_transaction_id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment?: any | null;
  defaultProjectId?: string;
  initialValues?: InitialValues | null;
}

export function PaymentSheet({ open, onOpenChange, payment, defaultProjectId, initialValues }: Props) {
  const isEdit = !!payment;
  const { data: projects } = useProjects();
  const { data: divisions } = useDivisions();
  const { data: clients } = useClients();
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const createClient = useCreateClient();

  const [unassigned, setUnassigned] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string>("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("other");
  const [receivedOn, setReceivedOn] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");

  const normalizePerson = (value: string | null | undefined) =>
    normalizeName(value).split(" ").map((t) => ({ nicolas: "nick", nicholas: "nick", nickolas: "nick" } as Record<string, string>)[t] ?? t).join(" ");

  const findClientByName = (name: string | null | undefined) => {
    const target = normalizePerson(name);
    if (!target) return null;
    return (clients ?? []).find((c: any) => normalizePerson(c.name) === target) ?? null;
  };

  useEffect(() => {
    if (!open) return;
    if (payment) {
      setUnassigned(!payment.project_id);
      setProjectId(payment.project_id ?? null);
      setDivisionId(payment.division_id ?? "");
      setClientId(payment.client_id ?? null);
      setAmount(String(payment.amount ?? ""));
      setMethod(payment.method ?? "other");
      setReceivedOn(payment.received_on ?? new Date().toISOString().slice(0, 10));
      setNotes(payment.notes ?? "");
      setNewClientName("");
    } else {
      setUnassigned(false);
      setProjectId(initialValues?.project_id ?? defaultProjectId ?? null);
      setDivisionId(initialValues?.division_id ?? "");
      setClientId(initialValues?.client_id ?? null);
      setAmount(initialValues?.amount ? String(initialValues.amount) : "");
      setMethod(initialValues?.method ?? "other");
      setReceivedOn(initialValues?.received_on ?? new Date().toISOString().slice(0, 10));
      setNotes(initialValues?.notes ?? "");
      setNewClientName(initialValues?.new_client ?? "");
    }
  }, [open, payment, defaultProjectId, initialValues]);

  // Bank descriptions may say Nicholas/Nicolas while the customer record is Nick.
  useEffect(() => {
    if (!open || payment || !initialValues?.new_client || !clients?.length || clientId) return;
    const match = findClientByName(initialValues.new_client);
    if (match) {
      setClientId(match.id);
      setNewClientName("");
    }
  }, [open, payment, initialValues?.new_client, clients, clientId]);

  // If a known client already has a project, preselect it so the pending bank payment can be edited/created in one step.
  useEffect(() => {
    if (!open || payment || projectId || !clientId || !projects?.length) return;
    const existing = (projects as any[]).find((p: any) => p.client_id === clientId);
    if (existing) {
      setProjectId(existing.id);
      if (existing.division_id) setDivisionId(existing.division_id);
    }
  }, [open, payment, projectId, clientId, projects]);

  // Inherit division/client from project
  useEffect(() => {
    if (unassigned) return;
    if (!projectId || !projects) return;
    const p = projects.find((x: any) => x.id === projectId);
    if (!p) return;
    if (p.division_id) setDivisionId(p.division_id);
    if (p.client_id && !clientId) setClientId(p.client_id);
  }, [projectId, projects, unassigned]);

  // Auto-fill division when only one exists (very common)
  useEffect(() => {
    if (!divisionId && divisions && divisions.length === 1) setDivisionId(divisions[0].id);
  }, [divisions, divisionId]);

  // Existing projects for the selected client → for numbered suffix preview
  const selectedClientName = useMemo(() => {
    if (newClientName.trim()) return newClientName.trim();
    return (clients ?? []).find((c: any) => c.id === clientId)?.name ?? "";
  }, [clientId, newClientName, clients]);

  const existingProjectsForClient = useMemo(() => {
    if (!projects || !clientId) return 0;
    return projects.filter((p: any) => p.client_id === clientId).length;
  }, [projects, clientId]);

  const suggestedProjectName = useMemo(() => {
    if (!selectedClientName || projectId || unassigned) return null;
    const keyword = inferKeyword(null, [notes]) ?? "Project";
    return buildProjectName(selectedClientName, keyword, existingProjectsForClient);
  }, [selectedClientName, projectId, unassigned, notes, existingProjectsForClient]);

  const submitting = createPayment.isPending || updatePayment.isPending;

  const ensureClient = async (): Promise<string | null> => {
    if (newClientName.trim()) {
      const c = await createClient.mutateAsync({ name: newClientName.trim() });
      return c.id;
    }
    return clientId;
  };

  const ensureProject = async (finalClientId: string | null): Promise<string | null> => {
    if (unassigned) return null;
    if (projectId) return projectId;
    if (!finalClientId || !selectedClientName) return null;
    // Auto-create project for this client (PROYECTO = CLIENTE rule)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) throw new Error("Sin compañía");
    const div = divisionId;
    if (!div) throw new Error("Elige la división antes de guardar.");
    const name = suggestedProjectName ?? selectedClientName;
    const { data: created, error } = await supabase
      .from("projects")
      .insert({
        company_id: profile.company_id,
        division_id: div,
        client_id: finalClientId,
        name,
        status: "active",
        project_type: "other",
      })
      .select("id, division_id")
      .single();
    if (error) throw error;
    toast.success(`Proyecto creado: ${name}`);
    return created.id;
  };

  const handleSave = async () => {
    try {
      const finalClient = await ensureClient();
      const finalProject = await ensureProject(finalClient);
      const finalDivision = divisionId;
      const parsed = schema.safeParse({
        unassigned,
        project_id: finalProject,
        division_id: finalDivision,
        client_id: finalClient,
        amount: Number(amount),
        method: method as any,
        received_on: receivedOn,
        notes: notes || null,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Completa el formulario");
        return;
      }
      const payload: any = {
        project_id: parsed.data.project_id,
        division_id: parsed.data.division_id,
        client_id: parsed.data.client_id,
        amount: parsed.data.amount,
        method: parsed.data.method,
        received_on: parsed.data.received_on,
        notes: parsed.data.notes ?? null,
      };
      if (!isEdit && initialValues?.bank_transaction_id) payload.bank_transaction_id = initialValues.bank_transaction_id;
      const remaining = getPaymentIssueKinds({ ...payload, received_on: payload.received_on });
      if (isEdit) await updatePayment.mutateAsync({ id: payment.id, patch: payload });
      else {
        const created = await createPayment.mutateAsync(payload as any);
        if (initialValues?.bank_transaction_id && created?.id) {
          await (supabase as any).from("bank_transactions").update({
            status: "matched",
            matched_payment_id: created.id,
            matched_expense_id: null,
            match_confidence: 1,
            reconciled_at: new Date().toISOString(),
          }).eq("id", initialValues.bank_transaction_id);
        }
      }
      if (remaining.length > 0) {
        toast.warning(`Guardado, pero sigue pendiente: falta ${remaining.map(formatPaymentIssueKind).join(" · ").toLowerCase()}`);
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader><SheetTitle>{isEdit ? "Editar pago" : "Agregar pago"}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Sin asignar</p>
              <p className="text-xs text-muted-foreground">Pago sin proyecto ni cliente</p>
            </div>
            <Switch checked={unassigned} onCheckedChange={(v) => { setUnassigned(v); if (v) { setProjectId(null); } }} />
          </div>

          <div>
            <Label>Cliente {!unassigned && "*"}</Label>
            <SearchableSelect
              options={(clients ?? []).map((c: any) => ({ value: c.id, label: c.name }))}
              value={clientId ?? ""}
              onChange={(v) => { setClientId(v); setNewClientName(""); setProjectId(null); }}
              placeholder="Selecciona un cliente"
              searchPlaceholder="Buscar cliente…"
              emptyText="Sin clientes que coincidan"
            />
            <Input
              className="mt-2 h-10"
              placeholder="…o escribe un cliente nuevo"
              value={newClientName}
              onChange={(e) => { setNewClientName(e.target.value); if (e.target.value) { setClientId(null); setProjectId(null); } }}
              maxLength={100}
            />
          </div>

          {!unassigned && (
            <div>
              <Label>Proyecto</Label>
              <SearchableSelect
                options={(projects ?? [])
                  .filter((p: any) => !clientId || p.client_id === clientId)
                  .map((p: any) => ({ value: p.id, label: p.name, hint: p.project_code }))}
                value={projectId ?? ""}
                onChange={(v) => setProjectId(v)}
                placeholder={selectedClientName ? "Auto-crear desde el cliente" : "Selecciona un proyecto"}
                searchPlaceholder="Buscar proyecto…"
                emptyText="Sin proyectos que coincidan"
              />
              {suggestedProjectName && (
                <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                  <Sparkles className="h-3 w-3" /> Se creará el proyecto: <strong>{suggestedProjectName}</strong>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto *</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Fecha *</Label>
              <Input type="date" className="h-11" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Método *</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {divisions && divisions.length > 1 && (
            <div>
              <Label>División *</Label>
              <Select value={divisionId} onValueChange={setDivisionId} disabled={!unassigned && !!projectId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona división" /></SelectTrigger>
                <SelectContent>
                  {(divisions ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!unassigned && projectId && <p className="mt-1 text-xs text-muted-foreground">Heredada del proyecto</p>}
            </div>
          )}

          <div>
            <Label>Notas</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="ej. Bathroom remodel, anticipo…" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button className="flex-1 h-11" onClick={handleSave} disabled={submitting}>{submitting ? "Guardando…" : "Guardar"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
