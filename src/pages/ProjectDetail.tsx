/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProject, useProjectFinancials, useTasks, useReorderTasks, useExpenses, usePayments, useUpdateProject, useExpenseReviewQueue } from "@/hooks/useTrifectaData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Pencil, Plus, ChevronUp, ChevronDown, Receipt, DollarSign, FileDown, AlertTriangle, MessageCircle, MoreHorizontal, Calculator } from "lucide-react";
import { QuickActionsSheet } from "@/components/QuickActionsSheet";
import { downloadProjectReportPdf, shareProjectReportWhatsApp } from "@/lib/projectReportPdf";
import { toast } from "sonner";
import { usd, profitClass } from "@/lib/format";
import { ProjectEditDialog } from "@/components/projects/ProjectEditDialog";
import { TaskEditSheet } from "@/components/tasks/TaskEditSheet";
import { TaskCreateSheet } from "@/components/tasks/TaskCreateSheet";
import { TaskStatusControl } from "@/components/tasks/TaskStatusControl";
import { EstimateItemsEditor } from "@/components/estimates/EstimateItemsEditor";
import { collectionStatusClass, collectionStatusLabel, deriveCollectionStatus, paymentMethodLabel } from "@/lib/paymentStatus";
import { ExpenseSheet } from "@/components/finance/ExpenseSheet";
import { PaymentSheet } from "@/components/finance/PaymentSheet";
import { deriveProjectStatus, statusLabel, statusBadgeClass } from "@/lib/projectStatus";
import { PROJECT_STATUSES } from "@/lib/enums";
import { SandboxBadge } from "@/components/projects/SandboxBadge";
import { formatIssueKind } from "@/lib/expenseReview";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProjectFinancialControl } from "@/components/projects/ProjectFinancialControl";
import { useProjectControl } from "@/hooks/useProjectControl";
import { healthColor, healthLabel } from "@/lib/projectControl";

type TabKey = "resumen" | "gastos" | "cobros" | "tareas";

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id);
  const { data: fin } = useProjectFinancials(id);
  const { data: tasks } = useTasks(id);
  const { data: expenses } = useExpenses({ projectId: id });
  const { data: expenseReviewQueue = [] } = useExpenseReviewQueue(id);
  const { data: payments } = usePayments({ projectId: id });
  const reorder = useReorderTasks();

  const [editOpen, setEditOpen] = useState(false);
  const [taskEdit, setTaskEdit] = useState<any>(null);
  const [taskCreate, setTaskCreate] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("resumen");
  const { canSeeFinancials } = useUserRoles();
  const updateProject = useUpdateProject();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  if (isLoading || !project) return <p>Cargando…</p>;
  const estimateTotal = Number(fin?.estimateTotal ?? 0) || Number(project.estimated_total ?? 0);
  const spent = fin?.spent ?? 0;
  const collected = fin?.collected ?? 0;
  const profit = fin?.profit ?? 0;

  const move = (idx: number, dir: -1 | 1) => {
    if (!tasks) return;
    const target = idx + dir;
    if (target < 0 || target >= tasks.length) return;
    const ordered = tasks.map((t: any, i: number) => ({ ...t }));
    [ordered[idx], ordered[target]] = [ordered[target], ordered[idx]];
    reorder.mutate({
      projectId: id,
      ordered: ordered.map((t: any, i: number) => ({ id: t.id, position: i })),
    });
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const taskList = (tasks ?? []) as any[];
  const overdueCount = taskList.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled" && t.planned_end_date && t.planned_end_date < todayStr,
  ).length;
  const completedCount = taskList.filter((t) => t.status === "completed").length;
  const derivedStatus = deriveProjectStatus({
    storedStatus: (project as any).status,
    profit, collected,
    hasOverdueTasks: overdueCount > 0,
    totalTasks: taskList.length,
    completedTasks: completedCount,
  });

  const expenseIssues = expenseReviewQueue.reduce(
    (acc: { count: number; reasons: Set<string> }, row) => {
      acc.count += 1;
      row.issues.map((issue) => formatIssueKind(issue as any)).forEach((reason) => acc.reasons.add(reason));
      return acc;
    },
    { count: 0, reasons: new Set<string>() },
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "resumen", label: "Resumen" },
    { key: "gastos", label: "Gastos" },
    { key: "cobros", label: "Cobros" },
    { key: "tareas", label: "Tareas" },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* Encabezado: nombre + cliente + estado + menú */}
      <div className="flex items-start gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)} className="min-h-11 min-w-11 shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{project.name}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {(project as any).clients?.name ?? "Sin cliente"}
            {project.address ? ` · ${project.address}` : ""}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <DropdownMenu open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "pill cursor-pointer transition-opacity hover:opacity-80",
                    statusBadgeClass(derivedStatus),
                  )}
                  aria-label="Cambiar estado"
                >
                  {statusLabel(derivedStatus)}
                  <ChevronDown className="ml-1 h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PROJECT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onClick={() => {
                      updateProject.mutate({ id: id!, patch: { status: s.value } });
                      setStatusMenuOpen(false);
                    }}
                    className={cn((project as any).status === s.value && "font-bold")}
                  >
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {(project as any).is_sandbox && <SandboxBadge />}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="min-h-11 min-w-11 shrink-0" aria-label="Más acciones">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            {canSeeFinancials && <DropdownMenuItem onClick={() => {
              try {
                downloadProjectReportPdf(project as any, (fin ?? {}) as any, (expenses ?? []) as any, (payments ?? []) as any);
              } catch (e: any) { toast.error(e?.message ?? "No se pudo generar el PDF"); }
            }}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </DropdownMenuItem>}
            {canSeeFinancials && <DropdownMenuItem onClick={async () => {
              try {
                await shareProjectReportWhatsApp(project as any, (fin ?? {}) as any, (expenses ?? []) as any, (payments ?? []) as any);
              } catch (e: any) { toast.error(e?.message ?? "No se pudo compartir el reporte"); }
            }}>
              <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
            </DropdownMenuItem>}
            <DropdownMenuItem onClick={() => navigate("/calculator")}>
              <Calculator className="mr-2 h-4 w-4" /> Calculadora
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Bloque financiero: un solo bloque, sin sombra, "Te quedó" como cifra principal + semáforo */}
      {canSeeFinancials && (
        <FinancialHealthBlock projectId={id} profit={profit} collected={collected} spent={spent} />
      )}

      {/* Control financiero por proyecto */}
      {canSeeFinancials && id && <ProjectFinancialControl projectId={id} />}

      {/* Alertas: solo si aplican */}
      {expenseIssues.count > 0 && (
        <div
          className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 transition-colors hover:bg-warning/10"
          onClick={() => navigate(`/expenses?project=${id}&filtro=revisar`)}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{expenseIssues.count} gasto{expenseIssues.count === 1 ? "" : "s"} necesita{expenseIssues.count === 1 ? "" : "n"} revisión</p>
            <p className="truncate text-xs text-muted-foreground">
              {Array.from(expenseIssues.reasons).join(" · ")}
            </p>
          </div>
          <Button size="sm" variant="outline">Revisar</Button>
        </div>
      )}

      {/* Tabs: simples, texto claro, activo en emerald */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "min-h-[52px] flex-1 border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              activeTab === tab.key
                ? "border-success text-success"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de tabs */}
      {activeTab === "resumen" && (
        <div className="space-y-4">
          <Button
            size="lg"
            className="min-h-[52px] w-full bg-success text-success-foreground hover:bg-success/90"
            onClick={() => setQuickActionsOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Agregar
          </Button>
          {canSeeFinancials && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="border-t pt-2 space-y-1.5 text-sm">
                <Row label="Vas a cobrar" value={estimateTotal > 0 ? usd(estimateTotal) : "Sin monto"} />
                <Row label="Gastos generales" value={usd((fin as any)?.overhead ?? 0)} cls="text-muted-foreground" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estado del cobro</span>
                  <span className="text-sm font-semibold text-foreground">
                    {collectionStatusLabel(deriveCollectionStatus(estimateTotal, collected))}
                  </span>
                </div>
                <Row label="Saldo por cobrar" value={usd((fin as any)?.balanceDue ?? Math.max(0, estimateTotal - collected))} cls="text-warning-foreground" />
              </div>
            </div>
          )}

          {project.address && (
            <div><p className="text-sm font-semibold text-muted-foreground">Dirección</p><p className="mt-1 text-sm">{project.address}</p></div>
          )}
          {project.notes && (
            <div><p className="text-sm font-semibold text-muted-foreground">Notas</p><p className="mt-1 whitespace-pre-wrap text-sm">{project.notes}</p></div>
          )}

          <EstimateItemsEditor projectId={id!} />
        </div>
      )}

      {activeTab === "gastos" && (
        <div className="space-y-3">
          <Button size="lg" variant="outline" className="min-h-[52px] w-full" onClick={() => setExpenseOpen(true)}>
            <Receipt className="mr-2 h-4 w-4" /> Agregar gasto
          </Button>
          {canSeeFinancials && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <BreakdownCell label="Materiales" value={usd((fin as any)?.materials ?? 0)} onClick={() => navigate(`/expenses?project=${id}&cat=materiales`)} />
              <BreakdownCell label="Mano de obra" value={usd((fin as any)?.labor ?? 0)} onClick={() => navigate(`/expenses?project=${id}&cat=labor`)} />
              <BreakdownCell label="Otros" value={usd((fin as any)?.other ?? 0)} onClick={() => navigate(`/expenses?project=${id}&cat=otros`)} />
            </div>
          )}
          {(expenses?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin gastos registrados.</p>
          ) : (
            <div className="space-y-2">
              {(expenses ?? []).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm min-h-[52px]">
                  <div className="min-w-0"><p className="truncate font-bold">{e.categories?.name ?? "Sin categoría"}</p>
                    <p className="text-xs text-muted-foreground"><span className="money">{e.spent_on}</span> · {e.vendors?.name ?? "—"}</p></div>
                  <p className="money font-bold">{usd(Number(e.amount))}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "cobros" && (
        <div className="space-y-3">
          {canSeeFinancials && (
            <Button size="lg" variant="outline" className="min-h-[52px] w-full" onClick={() => setPaymentOpen(true)}>
              <DollarSign className="mr-2 h-4 w-4" /> Registrar cobro
            </Button>
          )}
          {canSeeFinancials && (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border bg-muted/30 p-3 text-left transition-colors hover:bg-muted/50"
              onClick={() => navigate(`/payments?project=${id}`)}
            >
              <span className="text-sm font-medium text-muted-foreground">Ver todos los cobros</span>
              <span className="money text-sm font-bold text-foreground">{usd(collected)}</span>
            </button>
          )}
          {!canSeeFinancials || (payments?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin cobros registrados.</p>
          ) : (
            <div className="space-y-2">
              {(payments ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm min-h-[52px]">
                  <div className="min-w-0"><p className="truncate font-bold">{p.clients?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground"><span className="money">{p.received_on}</span> · {paymentMethodLabel(p.method)}</p></div>
                  <p className="money font-bold text-foreground">{usd(Number(p.amount))}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "tareas" && (
        <div className="space-y-3">
          <Button size="lg" variant="outline" className="min-h-[52px] w-full" onClick={() => setTaskCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Agregar tarea
          </Button>
          {(!tasks || tasks.length === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Agrega algo que no quieres olvidar.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t: any, idx: number) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border bg-card p-3 min-h-[52px]">
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => move(idx, -1)}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === tasks.length - 1} onClick={() => move(idx, 1)}><ChevronDown className="h-4 w-4" /></Button>
                  </div>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setTaskEdit(t)}>
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.workers?.name ?? "Sin asignar"} · {t.planned_end_date ?? "sin fecha"}</p>
                  </button>
                  <TaskStatusControl task={t} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ProjectEditDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <TaskEditSheet open={!!taskEdit} onOpenChange={(v) => !v && setTaskEdit(null)} task={taskEdit} />
      <TaskCreateSheet open={taskCreate} onOpenChange={setTaskCreate} project={project} />
      <ExpenseSheet open={expenseOpen} onOpenChange={setExpenseOpen} defaultProjectId={id} />
      <PaymentSheet open={paymentOpen} onOpenChange={setPaymentOpen} defaultProjectId={id} />
      <QuickActionsSheet open={quickActionsOpen} onOpenChange={setQuickActionsOpen} defaultProjectId={id} />
    </div>
  );
};

const BreakdownCell = ({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-lg border bg-muted/30 p-2 text-center transition-colors hover:bg-muted/50"
  >
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="money mt-0.5 text-sm font-bold">{value}</p>
  </button>
);


const Row = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={`money font-bold ${cls ?? ""}`}>{value}</span>
  </div>
);


const FinancialHealthBlock = ({ projectId, profit, collected, spent }: { projectId?: string; profit: number; collected: number; spent: number }) => {
  const { data: control } = useProjectControl(projectId);
  const status = control?.overallStatus ?? "green";
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("h-3 w-3 rounded-full", healthColor(status))} />
          <span className="text-sm font-medium text-muted-foreground">Te quedó</span>
        </div>
        <span className={cn("money text-2xl font-bold", profitClass(profit))}>{usd(profit)}</span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">Cobraste</span>
        <span className="money text-base font-semibold text-foreground">{usd(collected)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Gastaste</span>
        <span className="money text-base font-semibold text-foreground">{usd(spent)}</span>
      </div>
    </div>
  );
};

export default ProjectDetail;
