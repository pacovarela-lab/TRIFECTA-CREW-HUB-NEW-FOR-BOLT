/* eslint-disable @typescript-eslint/no-explicit-any */
import { useProjects, useDashboardSummary } from "@/hooks/useTrifectaData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usd } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { deriveProjectStatus } from "@/lib/projectStatus";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { SandboxBadge } from "@/components/projects/SandboxBadge";
import { ProjectCreateDialog } from "@/components/projects/ProjectCreateDialog";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useUserRoles } from "@/hooks/useUserRoles";

const Projects = () => {
  const { data, isLoading } = useProjects();
  const { data: summary } = useDashboardSummary();
  const rollupById = useMemo(
    () => new Map((summary?.projectRollup ?? []).map((p) => [p.id, p])),
    [summary],
  );
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { canWrite: trialWrites } = useTrialStatus();
  const { canSeeFinancials } = useUserRoles();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreateOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.toLowerCase().trim();
    if (!s) return data;
    return data.filter((p: any) => {
      const searchable = [
        p.name,
        p.project_code,
        p.address,
        p.clients?.name,
        p.divisions?.name,
        p.business_units?.name,
      ];
      return searchable.some((value) => String(value ?? "").toLowerCase().includes(s));
    });
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tus trabajos</h1>
        </div>
        <Button size="sm" disabled={!trialWrites} title={trialWrites ? undefined : "Tu prueba terminó — modo solo lectura"} onClick={() => setCreateOpen(true)} className="h-11 rounded-lg"><Plus className="mr-1 h-4 w-4" /> Nuevo</Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          inputMode="search"
          aria-label="Buscar trabajo"
          placeholder="Cliente, trabajo o dirección"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 rounded-xl pl-9 text-base"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{q ? "No encontramos trabajos con esa búsqueda." : "Crea tu primer trabajo."}</p>
          {!q && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button className="h-11" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" /> Crear trabajo</Button>
            </div>
          )}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p: any) => {
            const r = rollupById.get(p.id);
            const status = r
              ? deriveProjectStatus({
                  storedStatus: p.status,
                  profit: r.profit,
                  collected: r.collected,
                  hasOverdueTasks: r.overdueTasks > 0,
                  totalTasks: r.totalTasks,
                  completedTasks: r.completedTasks,
                })
              : (p.status === "completed" ? "completed" : "on_track");
            return (
              <Card key={p.id} role="button" onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer transition-colors hover:bg-accent/40">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold">{p.name}</p>
                      {p.is_sandbox && <SandboxBadge />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{p.divisions?.name} · {p.business_units?.name ?? "Sin área"} · {p.clients?.name ?? "Sin cliente"}</p>
                  </div>
                  <div className="text-right">
                    {canSeeFinancials && <p className="money text-sm font-bold">{usd(p.estimated_total)}</p>}
                    <ProjectStatusBadge status={status as any} className="mt-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ProjectCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};


export default Projects;
