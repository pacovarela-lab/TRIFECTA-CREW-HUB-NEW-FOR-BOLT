/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { useDashboardSummary } from "@/hooks/useTrifectaData";
import { useNavigate } from "react-router-dom";
import { Camera, Plus, ChevronRight } from "lucide-react";
import { QuickReceiptCapture } from "@/components/finance/QuickReceiptCapture";
import { QuickActionsSheet } from "@/components/QuickActionsSheet";
import { isDashboardTenantEmpty } from "@/lib/dashboardFilters";
import { useCurrentCompany } from "@/hooks/useBusinessUnits";

const Dashboard = () => {
  const { data, isLoading, error } = useDashboardSummary(null);
  const { data: company } = useCurrentCompany();
  const navigate = useNavigate();

  const [captureRequest, setCaptureRequest] = useState(0);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const receiptCaptureTrigger = useRef<(() => void) | null>(null);

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <p className="text-destructive">No se pudo cargar Hoy.</p>;
  if (!data) return null;

  const t = data.totals;
  const isEmptyTenant = isDashboardTenantEmpty({
    businessUnitId: "__all",
    projectCount: data.projectRollup?.length ?? 0,
    spent: t.spent,
    collected: t.collected,
  });

  if (isEmptyTenant) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hoy</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{company?.name ?? "Crew Hub"}</p>
        </div>
        <div className="rounded-[28px] border bg-card p-6 text-center space-y-4 shadow-md sm:p-8">
          <p className="text-base font-bold">Crea tu primer trabajo</p>
          <p className="text-sm text-muted-foreground">
            Registra lo que pasó y Crew Hub hará las cuentas por ti.
          </p>
          <button
            className="min-h-12 w-full sm:w-auto rounded-[24px] bg-primary px-6 py-3 text-base font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4"
            onClick={() => navigate("/projects?new=1")}
          >
            Crear trabajo
          </button>
        </div>
      </div>
    );
  }

  const activeProjects = (data.projectRollup ?? []).filter(
    (p: any) => p.status !== "completed" && p.status !== "cancelled",
  );

  return (
    <div className="space-y-6 rounded-[28px] bg-slate-50 p-3 sm:space-y-8 sm:p-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Hoy</h1>

      {/* Two large square buttons side by side */}
      <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
        {/* Tomar recibo */}
        <button
          type="button"
          onClick={() => {
            if (receiptCaptureTrigger.current) {
              receiptCaptureTrigger.current();
            } else {
              setCaptureRequest((v) => v + 1);
            }
          }}
          className="flex min-h-44 min-w-0 flex-col items-center justify-center gap-5 rounded-[28px] bg-gradient-to-br from-emerald-700 to-teal-800 px-4 py-8 text-white shadow-md shadow-emerald-900/10 transition hover:from-emerald-800 hover:to-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none sm:min-h-56"
        >
          <Camera className="h-16 w-16 shrink-0 rounded-2xl bg-current/10 p-3" strokeWidth={2.5} />
          <span className="text-xl font-extrabold tracking-tight">Tomar recibo</span>
        </button>

        {/* Qué deseas registrar? */}
        <button
          type="button"
          onClick={() => setActionSheetOpen(true)}
          className="flex min-h-44 min-w-0 flex-col items-center justify-center gap-5 rounded-[28px] border-2 border-slate-400 bg-white px-4 py-8 text-slate-900 shadow-md shadow-slate-200/50 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none sm:min-h-56"
        >
          <Plus className="h-16 w-16 shrink-0 rounded-2xl bg-current/10 p-3" strokeWidth={2.5} />
          <span className="text-xl font-extrabold text-center leading-snug tracking-tight">¿Qué deseas registrar?</span>
        </button>
      </div>

      {/* Proyectos activos */}
      <button
        type="button"
        onClick={() => navigate("/projects")}
        className="flex min-h-24 w-full flex-wrap items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-md shadow-slate-200/50 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none"
      >
        <span className="text-lg font-extrabold tracking-tight">Proyectos activos</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-emerald-100 px-3 text-2xl font-extrabold text-emerald-900">{activeProjects.length}</span>
          <ChevronRight className="h-6 w-6 text-muted-foreground" strokeWidth={2.5} />
        </div>
      </button>

      <QuickReceiptCapture captureRequest={captureRequest} captureTriggerRef={receiptCaptureTrigger} showButton={false} />
      <QuickActionsSheet open={actionSheetOpen} onOpenChange={setActionSheetOpen} receiptCaptureTrigger={receiptCaptureTrigger} />
    </div>
  );
};

const DashboardSkeleton = () => (
  <div className="space-y-8">
    <div className="h-7 w-24 animate-pulse rounded bg-muted" />
    <div className="grid grid-cols-2 gap-3">
      <div className="h-[120px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[120px] animate-pulse rounded-2xl bg-muted" />
    </div>
    <div className="h-14 animate-pulse rounded-xl bg-muted" />
  </div>
);

export default Dashboard;
