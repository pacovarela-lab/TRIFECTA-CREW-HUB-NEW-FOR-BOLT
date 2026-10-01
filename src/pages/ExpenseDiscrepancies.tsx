/* eslint-disable @typescript-eslint/no-explicit-any, no-useless-escape, @typescript-eslint/no-unused-expressions, no-empty */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { useExpenses, useUpdateExpense, useWorkers, useProjects, useCategories, useExpenseReviewQueue } from "@/hooks/useTrifectaData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { usd } from "@/lib/format";
import { findSimilar } from "@/lib/similarity";
import { toast } from "sonner";
import { SaveExpenseRuleDialog } from "@/components/finance/SaveExpenseRuleDialog";
import { ExpenseRuleDraft } from "@/lib/expenseRules";
import { type ExpenseIssueKind } from "@/lib/expenseReview";

type IssueKind = ExpenseIssueKind;

interface Discrepancy {
  expense: any;
  issues: IssueKind[];
  suggestedDate?: string | null;
  suggestedWorkerId?: string | null;
  suggestedWorkerName?: string | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Try to fix a future date by swapping month/day if both <= 12 and result is not in future. */
function suggestDateFix(iso: string): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  if (m <= 12 && d <= 12 && m !== d) {
    const swapped = `${y}-${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}`;
    if (swapped <= todayISO()) return swapped;
  }
  // If still future, clamp the year to current year
  const t = todayISO();
  const clamped = `${t.slice(0, 4)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (clamped <= t) return clamped;
  return null;
}

/** Extract a candidate worker name from descriptions like "Labor: Juan Perez — 8h". */
function extractLaborName(desc?: string | null): string | null {
  if (!desc) return null;
  const m = desc.match(/labor\s*[:\-]\s*([^—\-|·,\n]+)/i);
  return m ? m[1].trim() : null;
}

const ExpenseDiscrepancies = () => {
  const [sp] = useSearchParams();
  const projectFilter = sp.get("project");
  const { data: allExpenses = [], isLoading } = useExpenses();
  const { data: reviewQueue = [], isLoading: reviewQueueLoading } = useExpenseReviewQueue(projectFilter ?? undefined);
  const expenses = useMemo(
    () => (projectFilter ? (allExpenses ?? []).filter((e: any) => e.project_id === projectFilter) : allExpenses ?? []),
    [allExpenses, projectFilter],
  );
  const projectName = useMemo(
    () => (projectFilter ? (allExpenses.find((e: any) => e.project_id === projectFilter) as any)?.projects?.name : null),
    [allExpenses, projectFilter],
  );
  const { data: workers = [] } = useWorkers({ activeOnly: true });
  const { data: projects = [] } = useProjects();
  const { data: categories = [] } = useCategories("expense");
  const update = useUpdateExpense();
  const qc = useQueryClient();
  const [ruleDraft, setRuleDraft] = useState<ExpenseRuleDraft | null>(null);

  const buildRuleDraft = (expense: any, patch: any, labelPrefix = "") : ExpenseRuleDraft | null => {
    const labels: string[] = [];
    const changes: ExpenseRuleDraft["changes"] = {};
    if (patch.project_id && patch.project_id !== expense.project_id) {
      const p = projects.find((x: any) => x.id === patch.project_id);
      changes.project_id = patch.project_id;
      changes.division_id = patch.division_id ?? p?.division_id ?? null;
      labels.push(`${labelPrefix}Proyecto → ${p?.name ?? "seleccionado"}`);
    }
    if (patch.worker_id && patch.worker_id !== expense.worker_id) {
      const w = workers.find((x: any) => x.id === patch.worker_id);
      changes.worker_id = patch.worker_id;
      labels.push(`${labelPrefix}Ayudante → ${w?.name ?? "seleccionado"}`);
    }
    if (patch.spent_on && patch.spent_on !== expense.spent_on) {
      changes.date_transform = "future_date_swap_dm";
      labels.push(`${labelPrefix}Fecha ${expense.spent_on} → ${patch.spent_on}`);
    }
    if (!labels.length || (!changes.project_id && !changes.worker_id && !changes.date_transform)) return null;
    return {
      companyId: expense.company_id,
      source: {
        description: expense.description,
        vendorName: expense.vendors?.name,
        categoryName: expense.categories?.name,
        projectName: expense.projects?.name,
        spentOn: expense.spent_on,
      },
      changes,
      labels,
      defaultField: patch.spent_on ? "spent_on" : undefined,
      defaultPattern: patch.spent_on ? "future_date_swap_dm" : undefined,
    };
  };

  const saveWithLearning = async (expense: any, patch: any) => {
    await update.mutateAsync({ id: expense.id, patch });
    await Promise.all([
      qc.refetchQueries({ queryKey: ["expenses"] }),
      qc.refetchQueries({ queryKey: ["expense-review-queue"] }),
    ]);
    const draft = buildRuleDraft(expense, patch);
    if (draft) setRuleDraft(draft);
  };

  const reviewIssuesById = useMemo(
    () => new Map(reviewQueue.map((row) => [row.expense_id, row.issues as IssueKind[]] as const)),
    [reviewQueue],
  );

  const discrepancies: Discrepancy[] = useMemo(() => {
    return (expenses ?? [])
      .map((e: any) => {
        const issues = reviewIssuesById.get(e.id) ?? [];
        let suggestedDate: string | null = null;
        let suggestedWorkerId: string | null = null;
        let suggestedWorkerName: string | null = null;

        if (issues.includes("future_date")) {
          suggestedDate = suggestDateFix(e.spent_on);
        }

        if (issues.includes("unknown_labor") || issues.includes("labor_no_worker")) {
          const guess = extractLaborName(e.description);
          if (guess) {
            const m = findSimilar(workers as any[], { name: guess })[0];
            if (m && m.score >= 0.6) {
              suggestedWorkerId = m.record.id;
              suggestedWorkerName = m.record.name;
            }
          }
        }

        return { expense: e, issues, suggestedDate, suggestedWorkerId, suggestedWorkerName };
      })
      .filter((d) => d.issues.length > 0);
  }, [expenses, workers, reviewIssuesById]);

  const groups = useMemo(() => {
    const g: Record<IssueKind, Discrepancy[]> = {
      future_date: [],
      labor_no_worker: [],
      unknown_labor: [],
      unassigned: [],
      pending_evidence: [],
      no_category: [],
    };
    discrepancies.forEach((d) => d.issues.forEach((i) => g[i]?.push(d)));
    return g;
  }, [discrepancies]);

  const firstIssueTab = ([
    "future_date",
    "unknown_labor",
    "labor_no_worker",
    "unassigned",
    "pending_evidence",
    "no_category",
  ] as IssueKind[]).find((kind) => groups[kind].length > 0) ?? "future_date";

  if (isLoading || reviewQueueLoading) return <p className="p-4 text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to="/expenses">
            <Button variant="ghost" size="icon" aria-label="Volver"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Revisión de discrepancias</h1>
            <p className="text-xs text-muted-foreground">
              {discrepancies.length} gastos con problemas
              {projectName && <> · Proyecto: <b>{projectName}</b></>}
            </p>
          </div>

        </div>
      </div>

      {discrepancies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <p className="text-sm font-medium">Todo en orden</p>
            <p className="text-xs text-muted-foreground">No se detectaron gastos con problemas.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={firstIssueTab}>
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-6">
            <TabsTrigger value="future_date" className="text-xs">
              Fechas <Badge variant="secondary" className="ml-1">{groups.future_date.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unknown_labor" className="text-xs">
              Labor ?<Badge variant="secondary" className="ml-1">{groups.unknown_labor.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="labor_no_worker" className="text-xs">
              Sin ayudante <Badge variant="secondary" className="ml-1">{groups.labor_no_worker.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unassigned" className="text-xs">
              Proyecto <Badge variant="secondary" className="ml-1">{groups.unassigned.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending_evidence" className="text-xs">
              Evidencia <Badge variant="secondary" className="ml-1">{groups.pending_evidence.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="no_category" className="text-xs">
              Categoría <Badge variant="secondary" className="ml-1">{groups.no_category.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="future_date" className="mt-3">
            <FutureDatePanel items={groups.future_date} onSave={(expense, patch) => saveWithLearning(expense, patch)} />
          </TabsContent>
          <TabsContent value="unknown_labor" className="mt-3">
            <WorkerAssignPanel items={groups.unknown_labor} workers={workers} onSave={(expense, patch) => saveWithLearning(expense, patch)} />
          </TabsContent>
          <TabsContent value="labor_no_worker" className="mt-3">
            <WorkerAssignPanel items={groups.labor_no_worker} workers={workers} onSave={(expense, patch) => saveWithLearning(expense, patch)} />
          </TabsContent>
          <TabsContent value="unassigned" className="mt-3">
            <ProjectAssignPanel items={groups.unassigned} projects={projects} onSave={(expense, patch) => saveWithLearning(expense, patch)} />
          </TabsContent>
          <TabsContent value="pending_evidence" className="mt-3">
            <PendingEvidencePanel items={groups.pending_evidence} onSave={(expense, patch) => saveWithLearning(expense, patch)} />
          </TabsContent>
          <TabsContent value="no_category" className="mt-3">
            <CategoryAssignPanel items={groups.no_category} categories={categories} onSave={(expense, patch) => saveWithLearning(expense, patch)} />
          </TabsContent>
        </Tabs>
      )}
      <SaveExpenseRuleDialog
        draft={ruleDraft}
        onClose={() => setRuleDraft(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["expenses"] });
          qc.invalidateQueries({ queryKey: ["expense-review-queue"] });
        }}
      />
    </div>
  );
};

/* ---------- Panels ---------- */

function Row({
  d, checked, onToggle, right,
}: { d: Discrepancy; checked: boolean; onToggle: () => void; right?: React.ReactNode }) {
  const e = d.expense;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-3">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">
              {e.categories?.name ?? "Sin categoría"}
            </p>
            <p className="text-sm font-bold">{usd(Number(e.amount))}</p>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {e.spent_on} · {e.vendors?.name ?? "—"} · {e.projects?.name ?? "Sin proyecto"}
          </p>
          {e.description && <p className="mt-1 truncate text-xs text-muted-foreground">{e.description}</p>}
          {right && <div className="mt-2">{right}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function FutureDatePanel({ items, onSave }: { items: Discrepancy[]; onSave: (expense: any, p: any) => Promise<any> }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  const toggle = (id: string) => {
    const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n);
  };
  const all = () => setSel(new Set(items.map((i) => i.expense.id)));
  const none = () => setSel(new Set());

  const applySwap = async () => {
    setBusy(true);
    let ok = 0, skip = 0;
    for (const d of items) {
      if (!sel.has(d.expense.id)) continue;
      if (!d.suggestedDate) { skip++; continue; }
      try { await onSave(d.expense, { spent_on: d.suggestedDate }); ok++; } catch { skip++; }
    }
    setBusy(false);
    toast.success(`Corregidas ${ok}, omitidas ${skip}`);
    setSel(new Set());
  };

  const applyManual = async () => {
    if (!manual) return toast.error("Selecciona una fecha");
    setBusy(true);
    let ok = 0;
    for (const d of items) {
      if (!sel.has(d.expense.id)) continue;
      try { await onSave(d.expense, { spent_on: manual }); ok++; } catch {}
    }
    setBusy(false);
    toast.success(`Actualizadas ${ok}`);
    setSel(new Set());
  };

  if (items.length === 0) return <EmptyState text="Sin fechas futuras." />;

  return (
    <div className="space-y-3">
      <BulkBar count={sel.size} all={all} none={none}>
        <Button size="sm" disabled={!sel.size || busy} onClick={applySwap}>Aplicar sugerencia (swap d/m)</Button>
        <div className="flex items-center gap-1">
          <Input type="date" value={manual} onChange={(ev) => setManual(ev.target.value)} className="h-9 w-36" />
          <Button size="sm" variant="outline" disabled={!sel.size || !manual || busy} onClick={applyManual}>Aplicar fecha</Button>
        </div>
      </BulkBar>
      {items.map((d) => (
        <Row key={d.expense.id} d={d} checked={sel.has(d.expense.id)} onToggle={() => toggle(d.expense.id)}
          right={
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span>Fecha futura: <b>{d.expense.spent_on}</b></span>
              {d.suggestedDate && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Sugerido: {d.suggestedDate}</span>}
            </div>
          }
        />
      ))}
    </div>
  );
}

function WorkerAssignPanel({ items, workers, onSave }: { items: Discrepancy[]; workers: any[]; onSave: (expense: any, p: any) => Promise<any> }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkWorker, setBulkWorker] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const all = () => setSel(new Set(items.map((i) => i.expense.id)));
  const none = () => setSel(new Set());

  const applyBulk = async () => {
    if (!bulkWorker) return toast.error("Selecciona un ayudante");
    setBusy(true);
    let ok = 0;
    for (const d of items) { if (!sel.has(d.expense.id)) continue; try { await onSave(d.expense, { worker_id: bulkWorker }); ok++; } catch {} }
    setBusy(false);
    toast.success(`Asignados ${ok}`);
    setSel(new Set());
  };

  const applySuggestions = async () => {
    setBusy(true);
    let ok = 0, skip = 0;
    for (const d of items) {
      if (!sel.has(d.expense.id)) continue;
      if (!d.suggestedWorkerId) { skip++; continue; }
      try { await onSave(d.expense, { worker_id: d.suggestedWorkerId }); ok++; } catch { skip++; }
    }
    setBusy(false);
    toast.success(`Asignados ${ok}, omitidos ${skip}`);
    setSel(new Set());
  };

  if (items.length === 0) return <EmptyState text="No hay gastos de labor pendientes." />;

  return (
    <div className="space-y-3">
      <BulkBar count={sel.size} all={all} none={none}>
        <Button size="sm" disabled={!sel.size || busy} onClick={applySuggestions}>Aplicar sugerencias IA</Button>
        <div className="flex items-center gap-1">
          <SearchableSelect
            className="w-44"
            triggerClassName="h-9"
            options={workers.map((w) => ({ value: w.id, label: w.name }))}
            value={bulkWorker}
            onChange={setBulkWorker}
            placeholder="Ayudante…"
            searchPlaceholder="Buscar ayudante…"
            emptyText="Sin ayudantes que coincidan"
          />
          <Button size="sm" variant="outline" disabled={!sel.size || !bulkWorker || busy} onClick={applyBulk}>Asignar</Button>
        </div>
      </BulkBar>
      {items.map((d) => (
        <Row key={d.expense.id} d={d} checked={sel.has(d.expense.id)} onToggle={() => toggle(d.expense.id)}
          right={
            <div className="flex items-center gap-2 text-xs">
              {d.suggestedWorkerName ? (
                <>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Sugerencia: {d.suggestedWorkerName}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                    onClick={async () => { try { await onSave(d.expense, { worker_id: d.suggestedWorkerId }); toast.success("Asignado"); } catch {} }}>
                    Aplicar
                  </Button>
                </>
              ) : <span className="text-muted-foreground">Sin sugerencia</span>}
            </div>
          }
        />
      ))}
    </div>
  );
}

function ProjectAssignPanel({ items, projects, onSave }: { items: Discrepancy[]; projects: any[]; onSave: (expense: any, p: any) => Promise<any> }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkProject, setBulkProject] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const all = () => setSel(new Set(items.map((i) => i.expense.id)));
  const none = () => setSel(new Set());

  const applyBulk = async () => {
    if (!bulkProject) return toast.error("Selecciona un proyecto");
    const proj = projects.find((p) => p.id === bulkProject);
    setBusy(true);
    let ok = 0;
    for (const d of items) {
      if (!sel.has(d.expense.id)) continue;
      try {
        await onSave(d.expense, { project_id: bulkProject, division_id: proj?.division_id, is_overhead: false });
        ok++;
      } catch {}
    }
    setBusy(false);
    toast.success(`Asignados ${ok}`);
    setSel(new Set());
  };

  const markAllOverhead = async () => {
    setBusy(true);
    let ok = 0;
    for (const d of items) {
      if (!sel.has(d.expense.id)) continue;
      try {
        await onSave(d.expense, { is_overhead: true });
        ok++;
      } catch {}
    }
    setBusy(false);
    toast.success(`${ok} marcados como gasto general (prorrateo)`);
    setSel(new Set());
  };

  if (items.length === 0) return <EmptyState text="No hay gastos sin proyecto." />;

  return (
    <div className="space-y-3">
      <BulkBar count={sel.size} all={all} none={none}>
        <SearchableSelect
          className="w-56"
          triggerClassName="h-9"
          options={projects.map((p) => ({
            value: p.id,
            label: `${p.project_code ? `${p.project_code} · ` : ""}${p.name}`,
            hint: p.project_code,
          }))}
          value={bulkProject}
          onChange={setBulkProject}
          placeholder="Proyecto…"
          searchPlaceholder="Buscar proyecto…"
          emptyText="Sin proyectos que coincidan"
        />
        <Button size="sm" disabled={!sel.size || !bulkProject || busy} onClick={applyBulk}>Asignar proyecto</Button>
        <Button size="sm" variant="outline" disabled={!sel.size || busy} onClick={markAllOverhead}>Marcar prorrateo</Button>
      </BulkBar>
      {items.map((d) => (
        <Row key={d.expense.id} d={d} checked={sel.has(d.expense.id)} onToggle={() => toggle(d.expense.id)} />
      ))}
    </div>
  );
}

function CategoryAssignPanel({ items, categories, onSave }: { items: Discrepancy[]; categories: any[]; onSave: (expense: any, p: any) => Promise<any> }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const all = () => setSel(new Set(items.map((i) => i.expense.id)));
  const none = () => setSel(new Set());

  const applyBulk = async () => {
    if (!bulkCategory) return toast.error("Selecciona una categoría");
    setBusy(true);
    let ok = 0;
    for (const d of items) {
      if (!sel.has(d.expense.id)) continue;
      try {
        await onSave(d.expense, { category_id: bulkCategory });
        ok++;
      } catch {}
    }
    setBusy(false);
    toast.success(`Actualizados ${ok}`);
    setSel(new Set());
  };

  if (items.length === 0) return <EmptyState text="No hay gastos sin categoría." />;

  return (
    <div className="space-y-3">
      <BulkBar count={sel.size} all={all} none={none}>
        <SearchableSelect
          className="w-56"
          triggerClassName="h-9"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          value={bulkCategory}
          onChange={setBulkCategory}
          placeholder="Categoría…"
          searchPlaceholder="Buscar categoría…"
          emptyText="Sin categorías que coincidan"
        />
        <Button size="sm" disabled={!sel.size || !bulkCategory || busy} onClick={applyBulk}>Asignar categoría</Button>
      </BulkBar>
      {items.map((d) => (
        <Row key={d.expense.id} d={d} checked={sel.has(d.expense.id)} onToggle={() => toggle(d.expense.id)} />
      ))}
    </div>
  );
}

function PendingEvidencePanel({ items, onSave }: { items: Discrepancy[]; onSave: (expense: any, patch: any) => Promise<any> }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const all = () => setSel(new Set(items.map((i) => i.expense.id)));
  const none = () => setSel(new Set());

  const stripTag = (desc?: string | null) =>
    (desc ?? "").replace(/\[PENDIENTE[^\]]*\]\s*/gi, "").trim() || null;

  const markOne = async (d: Discrepancy) => {
    try {
      await onSave(d.expense, { description: stripTag(d.expense.description) });
      toast.success("Marcado como OK sin evidencia");
    } catch { toast.error("No se pudo actualizar"); }
  };

  const markBulk = async () => {
    setBusy(true);
    let ok = 0;
    for (const d of items) {
      if (!sel.has(d.expense.id)) continue;
      try { await onSave(d.expense, { description: stripTag(d.expense.description) }); ok++; } catch {}
    }
    setBusy(false);
    toast.success(`Marcados ${ok}`);
    setSel(new Set());
  };

  if (items.length === 0) return <EmptyState text="No hay gastos pendientes de evidencia." />;

  return (
    <div className="space-y-3">
      <BulkBar count={sel.size} all={all} none={none}>
        <Button size="sm" disabled={!sel.size || busy} onClick={markBulk}>
          <CheckCircle2 className="mr-1 h-4 w-4" />OK sin evidencia (seleccionados)
        </Button>
      </BulkBar>
      {items.map((d) => (
        <Row
          key={d.expense.id}
          d={d}
          checked={sel.has(d.expense.id)}
          onToggle={() => toggle(d.expense.id)}
          right={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-warning-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span>Marcado como pendiente de evidencia.</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => markOne(d)}>
                <CheckCircle2 className="mr-1 h-4 w-4" />OK sin evidencia
              </Button>
            </div>
          }
        />
      ))}
    </div>
  );
}

function BulkBar({ count, all, none, children }: { count: number; all: () => void; none: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs font-medium">{count} seleccionados</span>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={all}>Todos</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={none}>Ninguno</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

export default ExpenseDiscrepancies;
