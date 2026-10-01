import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { usd, profitClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";

const DivisionDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    enabled: !!id,
    queryKey: ["division-detail", id],
    queryFn: async () => {
      const [div, projects, expenses, payments] = await Promise.all([
        supabase.from("divisions").select("*").eq("id", id!).single(),
        supabase.from("projects").select("*, clients(name)").eq("division_id", id!).eq("is_sandbox", false).order("created_at", { ascending: false }),
        supabase.from("expenses").select("project_id, amount").eq("division_id", id!),
        supabase.from("payments").select("project_id, amount").eq("division_id", id!),
      ]);
      if (div.error) throw div.error;
      const projIds = new Set((projects.data ?? []).map((p: any) => p.id));
      const filteredExpenses = (expenses.data ?? []).filter((e: any) => !e.project_id || projIds.has(e.project_id));
      const filteredPayments = (payments.data ?? []).filter((p: any) => !p.project_id || projIds.has(p.project_id));
      const projs = (projects.data ?? []).map((p) => {
        const spent = filteredExpenses.filter((e) => e.project_id === p.id).reduce((s, e) => s + Number(e.amount), 0);
        const collected = filteredPayments.filter((x) => x.project_id === p.id).reduce((s, x) => s + Number(x.amount), 0);
        return { ...p, spent, collected, profit: collected - spent };
      });
      const totals = projs.reduce(
        (acc, p) => ({
          estimated: acc.estimated + Number(p.estimated_total ?? 0),
          spent: acc.spent + p.spent,
          collected: acc.collected + p.collected,
          profit: acc.profit + p.profit,
        }),
        { estimated: 0, spent: 0, collected: 0, profit: 0 }
      );
      return { division: div.data, projects: projs, totals };
    },
  });

  if (isLoading) return <p>Cargando…</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate("/")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{data.division.name}</h1>
          <p className="text-xs text-muted-foreground">{data.projects.length} proyectos</p>
        </div>
        <Button size="sm" onClick={() => navigate("/import")}><Plus className="mr-1 h-4 w-4" /> Importar</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Estimado</p><p className="text-lg font-bold">{usd(data.totals.estimated)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Gastado</p><p className="text-lg font-bold">{usd(data.totals.spent)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Cobrado</p><p className="text-lg font-bold">{usd(data.totals.collected)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Utilidad</p><p className={`text-lg font-bold ${profitClass(data.totals.profit)}`}>{usd(data.totals.profit)}</p></CardContent></Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Proyectos</h2>
        {data.projects.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Aún no hay proyectos. Importa un estimado para empezar.</CardContent></Card>
        ) : data.projects.map((p) => (
          <Card key={p.id} role="button" onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer">
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.clients?.name ?? "Sin cliente"} · Est {usd(p.estimated_total)}</p>
              </div>
              <p className={`text-base font-bold ${profitClass(p.profit)}`}>{usd(p.profit)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DivisionDashboard;
