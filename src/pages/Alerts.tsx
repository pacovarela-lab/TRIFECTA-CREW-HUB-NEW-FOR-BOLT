import { useEffect } from "react";
import { useAlerts, useResolveAlert, useSyncOperationalAlerts, useRewardNotifications } from "@/hooks/useTrifectaData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const sevConfig = {
  critical: { icon: AlertCircle, label: "Alta", border: "border-destructive", bg: "bg-destructive/10", text: "text-destructive" },
  warning:  { icon: AlertTriangle, label: "Media", border: "border-warning", bg: "bg-warning/10", text: "text-warning-foreground" },
  info:     { icon: Info, label: "Baja", border: "border-border", bg: "bg-muted/50", text: "text-muted-foreground" },
} as const;

const Alerts = () => {
  const sync = useSyncOperationalAlerts();
  const { data: alerts = [], isLoading } = useAlerts({ onlyOpen: true });
  const { data: rewards = [] } = useRewardNotifications({ limit: 8 });
  const resolve = useResolveAlert();
  const navigate = useNavigate();

  // Auto-sync once on mount
  useEffect(() => { sync.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Avisos</h1>
          <p className="text-sm text-muted-foreground">{alerts.length} abiertos · detectados automáticamente de tus operaciones</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={cn("mr-2 h-4 w-4", sync.isPending && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : alerts.length === 0 ? (
        <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-success" /> No hay avisos abiertos. Todo se ve bien.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a: any) => {
            const cfg = sevConfig[a.severity as keyof typeof sevConfig] ?? sevConfig.info;
            const Icon = cfg.icon;
            return (
              <Card key={a.id} className={cn("border-l-4", cfg.border)}>
                <CardContent className={cn("flex items-start justify-between gap-3 p-3", cfg.bg)}>
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", cfg.text)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-semibold uppercase">{cfg.label}</span>
                        {a.projects?.name && <> · <button className="underline-offset-2 hover:underline" onClick={() => navigate(`/projects/${a.project_id}`)}>{a.projects.name}</button></>}
                        {a.divisions?.name && <> · {a.divisions.name}</>}
                        <> · {new Date(a.created_at).toLocaleDateString()}</>
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate(a.id)} disabled={resolve.isPending}>
                    Resolver
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {rewards.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Logros</h2>
          <div className="space-y-2">
            {rewards.map((r: any) => (
              <Card key={r.id} className="border-l-4 border-success">
                <CardContent className="flex items-start gap-3 bg-success/10 p-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Alerts;
