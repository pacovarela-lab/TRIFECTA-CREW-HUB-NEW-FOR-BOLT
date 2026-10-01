/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePayments, useDeletePayment } from "@/hooks/useTrifectaData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, DollarSign, ListFilter } from "lucide-react";
import { usd } from "@/lib/format";
import { paymentMethodLabel, getPaymentIssueKinds, formatPaymentIssueKind } from "@/lib/paymentStatus";
import { PaymentSheet } from "@/components/finance/PaymentSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Payments = () => {
  const { data, isLoading, error } = usePayments();
  const del = useDeletePayment();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const filtro = searchParams.get("filtro");
  const projectFilter = searchParams.get("project");
  const reviewOnly = filtro === "revisar";
  const unassignedOnly = filtro === "sin-asignar";

  const setFiltro = (value: "revisar" | "sin-asignar" | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("filtro", value);
    else next.delete("filtro");
    setSearchParams(next, { replace: true });
  };
  const setReviewOnly = (on: boolean) => setFiltro(on ? "revisar" : null);

  const reviewCount = useMemo(
    () => (data ?? []).reduce((n: number, p: any) => n + (getPaymentIssueKinds(p).length > 0 ? 1 : 0), 0),
    [data],
  );
  const unassignedCount = useMemo(
    () => (data ?? []).reduce((n: number, p: any) => n + (getPaymentIssueKinds(p).includes("no_project") ? 1 : 0), 0),
    [data],
  );
  const visible = useMemo(() => {
    let rows = data ?? [];
    if (projectFilter) rows = rows.filter((p: any) => p.project_id === projectFilter);
    if (unassignedOnly) return rows.filter((p: any) => getPaymentIssueKinds(p).includes("no_project"));
    if (reviewOnly) return rows.filter((p: any) => getPaymentIssueKinds(p).length > 0);
    return rows;
  }, [data, reviewOnly, unassignedOnly, projectFilter]);

  const openNew = () => { setEditing(null); setSheetOpen(true); };
  const openEdit = (p: any) => { setEditing(p); setSheetOpen(true); };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Cobros</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unassignedOnly
              ? `${visible.length} sin proyecto`
              : reviewOnly
                ? `${visible.length} por revisar`
                : `${data?.length ?? 0} registros`}
          </p>
        </div>
        <Button size="lg" className="h-11 min-w-11 rounded-lg" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Registrar cobro</Button>
      </div>

      <div className="flex items-center gap-2">
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
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
        </div>
      )}
      {error && <p className="text-sm text-destructive">No se pudieron cargar los pagos.</p>}
      {!isLoading && data && data.length === 0 && (
        <EmptyState
          icon={DollarSign}
          title="Aún no hay cobros"
          description="Cuando te paguen, registra el cobro aquí."
          actionLabel="Registrar primer cobro"
          onAction={openNew}
        />
      )}
      {!isLoading && reviewOnly && visible.length === 0 && (data?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm font-medium">Todo revisado</p>
            <p className="text-xs text-muted-foreground">No quedan cobros pendientes de revisión.</p>
            <Button size="sm" variant="outline" onClick={() => setReviewOnly(false)}>Ver todos</Button>
          </CardContent>
        </Card>
      )}


      <div className="space-y-2">
        {visible.map((p: any) => {
          const issues = getPaymentIssueKinds(p);
          const assigned = issues.length === 0;
          return (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold">
                      {p.clients?.name ?? p.projects?.name ?? <span className="pill pill-pending">Sin asignar</span>}
                    </p>
                    <p className="money text-base font-bold text-foreground">{usd(Number(p.amount))}</p>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    <span className="money">{p.received_on}</span> · {paymentMethodLabel(p.method)}
                    {p.projects?.name && p.clients?.name && p.projects.name !== p.clients.name ? ` · ${p.projects.name}` : ""}
                  </p>
                  {issues.length > 0 && (
                    <p className="mt-1 truncate text-xs">
                      <span className="pill pill-pending">
                        Necesita revisión: {issues.map(formatPaymentIssueKind).join(" · ")}
                      </span>
                    </p>
                  )}
                  {p.notes && p.notes !== "nan" && <p className="mt-1 truncate text-xs text-muted-foreground">{p.notes}</p>}

                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="Editar" className="min-h-11 min-w-11"><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Eliminar" className="min-h-11 min-w-11"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
                        <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate({ id: p.id, projectId: p.project_id })}>Eliminar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PaymentSheet open={sheetOpen} onOpenChange={setSheetOpen} payment={editing} />
    </div>
  );
};


export default Payments;
