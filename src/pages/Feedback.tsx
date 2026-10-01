import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBetaFeedbackAdmin } from "@/hooks/useBetaFeedbackAdmin";
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FeedbackFilters,
  FeedbackRow,
  FeedbackStatus,
  filterFeedback,
} from "@/lib/betaAdmin";

const AccessDenied = () => {
  const navigate = useNavigate();
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-3 p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-bold tracking-tight">Esta función no está disponible para tu cuenta.</h1>
        <p className="text-sm text-muted-foreground">Pregúntale a tu administrador si crees que deberías tener acceso.</p>
        <Button className="h-11 w-full" onClick={() => navigate("/", { replace: true })}>
          Ir al panel
        </Button>
      </CardContent>
    </Card>
  );
};

const Feedback = () => {
  const { isBetaAdmin, overview, loading, refresh } = useBetaFeedbackAdmin();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<FeedbackFilters>({ status: "all", companyId: "all" });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isBetaAdmin) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      const list = ((data as unknown as FeedbackRow[]) || []);
      const ids = Array.from(new Set(list.map((r) => r.company_id)));
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: cs } = await supabase.from("companies").select("id,name").in("id", ids);
        (cs || []).forEach((c) => {
          names[c.id] = c.name;
        });
      }
      if (!cancelled) {
        setRows(list);
        setCompanies(names);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isBetaAdmin]);

  const visible = useMemo(() => filterFeedback(rows, filters), [rows, filters]);

  const setStatus = async (row: FeedbackRow, status: FeedbackStatus) => {
    setBusy(row.id);
    const { error } = await supabase.from("product_feedback").update({ status }).eq("id", row.id);
    setBusy(null);
    if (error) {
      toast.error("No pudimos actualizar este elemento. Inténtalo de nuevo.");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status, updated_at: new Date().toISOString() } : r)));
    refresh();
    toast.success(`Marcado como ${FEEDBACK_STATUS_LABELS[status]}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isBetaAdmin) return <AccessDenied />;

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Operaciones beta</p>
        <h1 className="text-2xl font-bold tracking-tight">Feedback</h1>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Nuevos", value: overview.new_count },
            { label: "En revisión", value: overview.reviewing_count },
            { label: "Resueltos", value: overview.fixed_count },
            { label: "Pruebas activas", value: overview.active_trial_companies },
            { label: "Pruebas ≤7 días", value: overview.trials_expiring_soon },
            { label: "Pruebas expiradas", value: overview.expired_trials },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filters.status === "all" ? "default" : "outline"}
              onClick={() => setFilters((f) => ({ ...f, status: "all" }))}
            >
              Todos
            </Button>
            {FEEDBACK_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filters.status === s ? "default" : "outline"}
                onClick={() => setFilters((f) => ({ ...f, status: s }))}
              >
                {FEEDBACK_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder="Buscar texto"
              value={filters.search || ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="h-10"
            />
            <Input
              placeholder="Ruta (ej. /expenses)"
              value={filters.route || ""}
              onChange={(e) => setFilters((f) => ({ ...f, route: e.target.value }))}
              className="h-10"
            />
            <Input
              type="date"
              value={filters.since ? filters.since.slice(0, 10) : ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, since: e.target.value ? new Date(e.target.value).toISOString() : undefined }))
              }
              className="h-10"
            />
          </div>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={filters.companyId || "all"}
            onChange={(e) => setFilters((f) => ({ ...f, companyId: e.target.value }))}
          >
            <option value="all">Todas las empresas</option>
            {Object.entries(companies).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay feedback que coincida con estos filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.status === "new" ? "default" : "secondary"}>
                    {FEEDBACK_STATUS_LABELS[r.status]}
                  </Badge>
                  {r.priority && <Badge variant="outline">{r.priority}</Badge>}
                  {r.severity && <Badge variant="outline">{r.severity}</Badge>}
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.comments}</p>
                {r.biggest_difficulty && (
                  <p className="text-xs text-muted-foreground">Dificultad: {r.biggest_difficulty}</p>
                )}
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Empresa: {companies[r.company_id] || r.company_id}</span>
                  <span>Usuario: {r.user_id}</span>
                  <span>Ruta: {r.route || "—"}</span>
                  <span>Versión: {r.app_version || "—"}</span>
                  <span className="truncate">Agente: {r.user_agent || "—"}</span>
                  <span>Actualizado: {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</span>
                  {r.contact && <span>Contacto: {r.contact}</span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {FEEDBACK_STATUSES.filter((s) => s !== r.status).map((s) => (
                    <Button key={s} size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r, s)}>
                      {FEEDBACK_STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Feedback;
