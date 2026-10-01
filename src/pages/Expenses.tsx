/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useExpenses, useDeleteExpense, useReceiptsInboxCount, useProjects, useUpdateExpense, useExpenseReviewQueue } from "@/hooks/useTrifectaData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Receipt, Mic, AlertTriangle, Wand2, ListFilter, FolderKanban } from "lucide-react";
import { usd } from "@/lib/format";
import { ExpenseSheet } from "@/components/finance/ExpenseSheet";
import { VoiceExpenseSheet } from "@/components/finance/VoiceExpenseSheet";
import { Link, useSearchParams } from "react-router-dom";
import { applyExpenseRulesNow } from "@/lib/expenseRules";
import { isProratedOverheadExpense } from "@/lib/expenseReview";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Expenses = () => {
  const { data, isLoading, error } = useExpenses();
  const { data: reviewQueue = [], isLoading: reviewQueueLoading } = useExpenseReviewQueue();
  const qc = useQueryClient();
  const { data: inboxCount = 0 } = useReceiptsInboxCount();
  const del = useDeleteExpense();
  const { data: projects } = useProjects();
  const updateExpense = useUpdateExpense();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [initialValues, setInitialValues] = useState<any | null>(null);
  const [applyingRules, setApplyingRules] = useState(false);
  const [bulkProject, setBulkProject] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const filtro = searchParams.get("filtro");
  const projectFilter = searchParams.get("project");
  const catFilter = searchParams.get("cat");
  const reviewOnly = filtro === "revisar";
  const unassignedOnly = filtro === "sin-asignar";

  const setFiltro = (value: "revisar" | "sin-asignar" | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("filtro", value);
    else next.delete("filtro");
    setSearchParams(next, { replace: true });
  };
  const setReviewOnly = (on: boolean) => setFiltro(on ? "revisar" : null);

  const reviewIssuesById = useMemo(
    () => new Map(reviewQueue.map((row) => [row.expense_id, row.issues] as const)),
    [reviewQueue],
  );
  const reviewCount = reviewQueue.length;
  const unassignedCount = useMemo(
    () => reviewQueue.reduce((n, row) => n + (row.issues.includes("unassigned") ? 1 : 0), 0),
    [reviewQueue],
  );
  const visible = useMemo(() => {
    let rows = data ?? [];
    if (projectFilter) rows = rows.filter((e: any) => e.project_id === projectFilter);
    if (catFilter === "materiales") rows = rows.filter((e: any) => {
      const catName = (e.categories?.name ?? "").toLowerCase();
      return !/labor/i.test(catName) && (/material/.test(catName) || catName === "");
    });
    if (catFilter === "labor") rows = rows.filter((e: any) => /labor/i.test(e.categories?.name ?? "") || /^\s*labor[:\s-]/i.test(e.description ?? ""));
    if (catFilter === "otros") rows = rows.filter((e: any) => {
      const catName = (e.categories?.name ?? "").toLowerCase();
      const isLabor = /labor/i.test(catName) || /^\s*labor[:\s-]/i.test(e.description ?? "");
      const isMat = !isLabor && (/material/.test(catName) || catName === "");
      return !isLabor && !isMat;
    });
    if (unassignedOnly) return rows.filter((e: any) => reviewIssuesById.get(e.id)?.includes("unassigned"));
    if (reviewOnly) return rows.filter((e: any) => reviewIssuesById.has(e.id));
    return rows;
  }, [data, reviewOnly, unassignedOnly, projectFilter, catFilter, reviewIssuesById]);

  // Requiere migración 20261001000000_expense_review_acknowledge aplicada.
  const acknowledge = async (id: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await (supabase.from("expenses") as any)
      .update({ review_acknowledged_at: new Date().toISOString(), review_acknowledged_by: auth?.user?.id ?? null })
      .eq("id", id);
    if (error) return toast.error("No se pudo autorizar el gasto");
    await qc.refetchQueries({ queryKey: ["expense-review-queue"] });
    toast.success("Gasto autorizado");
  };

  const openNew = () => { setEditing(null); setInitialValues(null); setSheetOpen(true); };
  const openGeneral = () => { setEditing(null); setInitialValues({ unassigned: true }); setSheetOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setInitialValues(null); setSheetOpen(true); };


  // Rules are applied only when the user asks for it (manual button), never
  // automatically on load — so a manual edit is never silently overwritten.
  const runRules = async () => {
    setApplyingRules(true);
    try {
      const count = await applyExpenseRulesNow();
      if (count > 0) {
        toast.success(`${count} gastos actualizados por tus reglas guardadas`);
        qc.invalidateQueries({ queryKey: ["expenses"] });
      } else {
        toast.info("No había gastos que coincidieran con tus reglas.");
      }
    } catch {
      toast.error("No se pudieron aplicar las reglas.");
    } finally {
      setApplyingRules(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Gastos</h1>
            <p className="text-xs text-muted-foreground">
              {projectFilter
                ? `Proyecto · ${reviewOnly ? `${visible.length} por revisar` : `${visible.length} registros`}`
                : unassignedOnly
                  ? `${visible.length} sin proyecto`
                  : reviewOnly
                    ? `${visible.length} por revisar`
                    : `${data?.length ?? 0} registros`}
            </p>

          </div>
          <Button size="lg" className="h-11 shrink-0" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Agregar
          </Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          <Button
            size="sm"
            variant={reviewOnly ? "default" : "outline"}
            className="h-9 shrink-0"
            onClick={() => setReviewOnly(!reviewOnly)}
            aria-pressed={reviewOnly}
          >
            <ListFilter className="h-4 w-4" />
            <span className="ml-1">Por revisar{reviewCount > 0 ? ` (${reviewCount})` : ""}</span>
          </Button>

          <Button
            size="sm"
            variant={unassignedOnly ? "default" : "outline"}
            className="h-9 shrink-0"
            onClick={() => setFiltro(unassignedOnly ? null : "sin-asignar")}
            aria-pressed={unassignedOnly}
          >
            <ListFilter className="h-4 w-4" />
            <span className="ml-1">Sin proyecto{unassignedCount > 0 ? ` (${unassignedCount})` : ""}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-9 shrink-0"
            onClick={() => setVoiceOpen(true)}
            aria-label="Agregar gasto por voz"
          >
            <Mic className="h-4 w-4" />
            <span className="ml-1">Voz</span>
          </Button>
          <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={runRules} disabled={applyingRules} title="Aplicar tus reglas guardadas a los gastos existentes">
            <Wand2 className="h-4 w-4" />
            <span className="ml-1">{applyingRules ? "Aplicando…" : "Reglas"}</span>
          </Button>
          <Button size="sm" variant="secondary" className="h-9 shrink-0" onClick={openGeneral} title="Gasto sin proyecto (gasolina, agua, oficina)">
            <Plus className="mr-1 h-4 w-4" /> General
          </Button>
        </div>
      </div>

      {unassignedOnly && visible.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-3">
            <p className="text-xs font-medium">Acciones para gastos sin proyecto ({visible.length})</p>
            <div className="flex flex-wrap items-center gap-2">
              <SearchableSelect
                className="w-56"
                triggerClassName="h-9"
                options={(projects ?? []).map((p: any) => ({
                  value: p.id,
                  label: `${p.project_code ? `${p.project_code} · ` : ""}${p.name}`,
                  hint: p.project_code,
                }))}
                value={bulkProject}
                onChange={setBulkProject}
                placeholder="Asignar a proyecto…"
                searchPlaceholder="Buscar proyecto…"
                emptyText="Sin proyectos que coincidan"
              />
              <Button
                size="sm"
                disabled={!bulkProject || bulkBusy}
                onClick={async () => {
                  if (!bulkProject) return toast.error("Selecciona un proyecto");
                  const proj = (projects ?? []).find((p) => p.id === bulkProject);
                  setBulkBusy(true);
                  let ok = 0;
                  for (const e of visible) {
                    try {
                      await updateExpense.mutateAsync({ id: e.id, patch: { project_id: bulkProject, division_id: proj?.division_id ?? null, is_overhead: false } });
                      ok++;
                    } catch { /* keep processing the remaining expenses */ }
                  }
                  setBulkBusy(false);
                  toast.success(`Asignados ${ok} gastos al proyecto`);
                  setBulkProject("");
                }}
              >
                Asignar proyecto
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={async () => {
                  setBulkBusy(true);
                  let ok = 0;
                  for (const e of visible) {
                    try {
                      await updateExpense.mutateAsync({ id: e.id, patch: { is_overhead: true } });
                      ok++;
                    } catch { /* keep processing the remaining expenses */ }
                  }
                  setBulkBusy(false);
                  toast.success(`${ok} gastos marcados como general (prorrateo mensual)`);
                }}
              >
                <FolderKanban className="mr-1 h-4 w-4" /> Marcar prorrateo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={async () => {
                  setBulkBusy(true);
                  try {
                    const count = await applyExpenseRulesNow(undefined, { overwrite: true });
                    if (count > 0) {
                      toast.success(`${count} gastos actualizados por tus reglas`);
                      qc.invalidateQueries({ queryKey: ["expenses"] });
                    } else {
                      toast.info("No había gastos que coincidieran con tus reglas.");
                    }
                  } catch {
                    toast.error("No se pudieron aplicar las reglas.");
                  }
                  setBulkBusy(false);
                }}
              >
                <Wand2 className="mr-1 h-4 w-4" /> Aplicar reglas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Link to="/receipts" className="block">
        <Card className="hover:bg-muted/40">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Recibos</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {inboxCount > 0 ? `${inboxCount} por revisar` : "Todo revisado"}
            </span>
          </CardContent>
        </Card>
      </Link>

      <DiscrepanciesBanner count={reviewCount} loading={reviewQueueLoading} />

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && <p className="text-sm text-destructive">No se pudieron cargar los gastos.</p>}
      {!isLoading && data && data.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Todavía no tienes gastos. Cuando compres algo para un trabajo, agrégalo aquí o toma foto del recibo.</CardContent></Card>
      )}
      {!isLoading && reviewOnly && visible.length === 0 && (data?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm font-medium">Todo revisado</p>
            <p className="text-xs text-muted-foreground">No quedan gastos pendientes de revisión.</p>
            <Button size="sm" variant="outline" onClick={() => setReviewOnly(false)}>Ver todos</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((e: any) => {

          const issues = reviewIssuesById.get(e.id) ?? [];
          return (
          <Card key={e.id}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-foreground">{e.categories?.name ?? "Sin categoría"}</p>
                  <p className="money text-base font-bold text-foreground">{usd(Number(e.amount))}</p>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  <span className="money">{e.spent_on}</span> · {e.vendors?.name ?? "Sin proveedor"} ·{" "}
                  {e.projects?.name ?? (
                    isProratedOverheadExpense(e)
                      ? <span className="pill pill-success">General · prorrateado</span>
                      : <span className="pill pill-pending">Sin proyecto</span>
                  )}
                </p>
                {issues.length > 0 && (
                  <p className="mt-1 truncate text-xs">
                    <span className="pill pill-pending">Necesita revisión: {formatExpenseIssues(issues)}</span>
                    <button type="button" className="ml-2 min-h-9 rounded-md border px-2 text-xs font-semibold" onClick={() => acknowledge(e.id)}>Autorizar así</button>
                  </p>
                )}
                {e.workers?.name && (
                  <p className="mt-0.5 truncate text-xs">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Realizó: {e.workers.name}</span>
                  </p>
                )}
                {e.description && <p className="mt-1 truncate text-xs text-muted-foreground">{e.description}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(e)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="Eliminar"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate({ id: e.id, projectId: e.project_id })}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        );})}
      </div>


      <ExpenseSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        expense={editing}
        initialValues={initialValues}
        onReviewVerified={() => {
          qc.invalidateQueries({ queryKey: ["expense-review-queue"] });
        }}
      />
      <VoiceExpenseSheet open={voiceOpen} onOpenChange={setVoiceOpen} />
    </div>
  );
};

function DiscrepanciesBanner({ count, loading }: { count: number; loading: boolean }) {
  if (loading || count === 0) return null;
  return (
    <Link to="/expenses/discrepancies" className="block">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 transition-colors hover:bg-warning/10">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-foreground" />
          <p className="text-sm font-medium">Revisión de discrepancias</p>
        </div>
        <span className="text-xs font-semibold">{count} a revisar</span>
      </div>
    </Link>
  );
}

function formatExpenseIssues(issues: string[]) {
  const labels: Record<string, string> = {
    future_date: "fecha",
    labor_no_worker: "ayudante",
    unknown_labor: "ayudante",
    unassigned: "proyecto",
    pending_evidence: "evidencia",
    no_category: "categoría",
  };
  return issues.map((i) => labels[i] ?? i).join(" · ");
}

export default Expenses;
