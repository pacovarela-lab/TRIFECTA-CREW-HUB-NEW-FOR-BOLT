/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, BarChart3 } from "lucide-react";
import { useDivisions } from "@/hooks/useTrifectaData";
import { useBusinessUnits } from "@/hooks/useBusinessUnits";
import { downloadCSV, toCSV } from "@/lib/csv";
import { usd } from "@/lib/format";
import { profitClass } from "@/lib/format";

const todayStr = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

const Reports = () => {
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(todayStr);
  const [divisionId, setDivisionId] = useState<string>("__all");
  const [businessUnitId, setBusinessUnitId] = useState<string>("__all");
  const { data: divisions = [] } = useDivisions();
  const { data: businessUnits = [] } = useBusinessUnits();

  const filters = {
    from,
    to,
    divisionId: divisionId === "__all" ? null : divisionId,
    businessUnitId: businessUnitId === "__all" ? null : businessUnitId,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", filters],
    queryFn: async () => {
      const { fetchLedger } = await import("@/lib/financialLedger");
      const [ledger, ohExpRes, projRes] = await Promise.all([
        fetchLedger(),
        // Overhead inputs for proration; scoped to date range so the prorated
        // share matches the months we're reporting on.
        supabase.from("expenses")
          .select("project_id, amount, spent_on, is_overhead")
          .gte("spent_on", from).lte("spent_on", to),
        supabase.from("projects").select(
          "id, name, division_id, business_unit_id, estimated_total, status, is_sandbox, exclude_from_overhead, divisions(name)",
        ),
      ]);
      if (projRes.error) throw projRes.error;
      if (ohExpRes.error) throw ohExpRes.error;
      const allProjects = projRes.data ?? [];
      const sandboxIds = new Set(allProjects.filter((p: any) => p.is_sandbox).map((p: any) => p.id));
      const allowedProjectIds = new Set(allProjects.filter((project) =>
        !filters.businessUnitId || project.business_unit_id === filters.businessUnitId,
      ).map((project) => project.id));
      // Date + division + sandbox filter on the ledger itself.
      const scoped = ledger.filter((e) => {
        if (e.date < from || e.date > to) return false;
        if (filters.divisionId && e.division_id !== filters.divisionId) return false;
        if (filters.businessUnitId && (!e.project_id || !allowedProjectIds.has(e.project_id))) return false;
        if (e.project_id && sandboxIds.has(e.project_id)) return false;
        return true;
      });
      return {
        entries: scoped,
        overheadInputs: ohExpRes.data ?? [],
        projects: allProjects.filter((p) => !(p as any).is_sandbox &&
          (!filters.divisionId || p.division_id === filters.divisionId) &&
          (!filters.businessUnitId || p.business_unit_id === filters.businessUnitId)),
      };
    },
  });

  const summary = useMemo(() => {
    const entries = data?.entries ?? [];
    const projects = data?.projects ?? [];

    // Confirmed-only totals (needs_review surfaces separately).
    const isConfirmed = (s: string) => s === "confirmed" || s === "reconciled";
    let totalExp = 0;
    let totalPay = 0;
    let needsReviewExp = 0;
    let needsReviewPay = 0;
    let needsReviewCount = 0;
    for (const e of entries) {
      const amt = Number(e.amount);
      const confirmed = isConfirmed(e.status);
      const review = e.status === "needs_review" || e.status === "suggested";
      if (e.direction === "income") {
        if (confirmed) totalPay += amt;
        else if (review) { needsReviewPay += amt; needsReviewCount++; }
      } else {
        if (confirmed) totalExp += amt;
        else if (review) { needsReviewExp += amt; needsReviewCount++; }
      }
    }

    // Overhead prorated within the date window. Synchronously available
    // because we already loaded all inputs; avoid an async useMemo.
    const overheadByProject = new Map<string, number>();
    // Inline a minimal proration to keep this hook synchronous; mirrors
    // computeOverheadByProject() but trimmed for use here.
    {
      const elig = new Set(
        projects.filter((p: any) => !p.is_sandbox && !p.exclude_from_overhead).map((p: any) => p.id),
      );
      type Bucket = { pool: number; activity: Map<string, number> };
      const months = new Map<string, Bucket>();
      for (const e of (data?.overheadInputs ?? []) as any[]) {
        const ym = (e.spent_on ?? "").slice(0, 7);
        if (!ym) continue;
        let b = months.get(ym);
        if (!b) { b = { pool: 0, activity: new Map() }; months.set(ym, b); }
        const amt = Number(e.amount) || 0;
        if (e.is_overhead) b.pool += amt;
        else if (e.project_id && elig.has(e.project_id)) {
          b.activity.set(e.project_id, (b.activity.get(e.project_id) ?? 0) + amt);
        }
      }
      for (const { pool, activity } of months.values()) {
        if (pool <= 0 || activity.size === 0) continue;
        const total = [...activity.values()].reduce((a, b) => a + b, 0);
        if (total <= 0) continue;
        for (const [pid, amt] of activity) {
          overheadByProject.set(pid, (overheadByProject.get(pid) ?? 0) + pool * (amt / total));
        }
      }
    }
    const totalOverhead = [...overheadByProject.values()].reduce((a, b) => a + b, 0);
    totalExp += totalOverhead;

    // P&L per project (uses confirmed direct + splits + overhead share).
    const pnlMap = new Map<string, { name: string; division: string; spent: number; collected: number; estimated: number }>();
    for (const p of projects) {
      pnlMap.set(p.id, {
        name: (p as any).name,
        division: (p as any).divisions?.name ?? "—",
        spent: overheadByProject.get(p.id) ?? 0,
        collected: 0,
        estimated: Number((p as any).estimated_total ?? 0),
      });
    }
    for (const e of entries) {
      if (!isConfirmed(e.status)) continue;
      const k = e.project_id ?? "__unassigned";
      const cur = pnlMap.get(k) ?? { name: "Sin proyecto", division: "—", spent: 0, collected: 0, estimated: 0 };
      if (e.direction === "income") cur.collected += Number(e.amount);
      else cur.spent += Number(e.amount);
      pnlMap.set(k, cur);
    }
    const pnl = Array.from(pnlMap.values())
      .map((r) => ({ ...r, profit: r.collected - r.spent, margin: r.collected > 0 ? (r.collected - r.spent) / r.collected : 0 }))
      .filter((r) => r.spent > 0 || r.collected > 0)
      .sort((a, b) => b.collected - a.collected);

    // By category / vendor / division — derived from confirmed ledger entries.
    const catMap = new Map<string, number>();
    const vMap = new Map<string, number>();
    const dMapName = new Map<string, string>();
    for (const p of projects) {
      if (p.division_id) dMapName.set(p.division_id, (p as any).divisions?.name ?? "—");
    }
    const dMap = new Map<string, { spent: number; collected: number }>();
    for (const e of entries) {
      if (!isConfirmed(e.status)) continue;
      if (e.direction === "expense") {
        const ck = e.category ?? "Sin categoría";
        catMap.set(ck, (catMap.get(ck) ?? 0) + Number(e.amount));
        const vk = e.vendor ?? "Sin proveedor";
        vMap.set(vk, (vMap.get(vk) ?? 0) + Number(e.amount));
      }
      const dname = (e.division_id && dMapName.get(e.division_id)) || "—";
      const cur = dMap.get(dname) ?? { spent: 0, collected: 0 };
      if (e.direction === "income") cur.collected += Number(e.amount);
      else cur.spent += Number(e.amount);
      dMap.set(dname, cur);
    }
    const byCategory = Array.from(catMap.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    const byVendor = Array.from(vMap.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    const byDivision = Array.from(dMap.entries()).map(([name, v]) => ({ name, ...v, profit: v.collected - v.spent }));

    return {
      totalExp, totalPay, profit: totalPay - totalExp,
      overhead: totalOverhead,
      needsReviewExp, needsReviewPay, needsReviewCount,
      pnl, byCategory, byVendor, byDivision,
    };
  }, [data]);


  const exportPnL = () => {
    const rows = summary.pnl.map((r) => ({
      project: r.name, division: r.division,
      estimated: r.estimated.toFixed(2),
      collected: r.collected.toFixed(2),
      spent: r.spent.toFixed(2),
      profit: r.profit.toFixed(2),
      margin_pct: (r.margin * 100).toFixed(1),
    }));
    downloadCSV(`pnl_${from}_${to}.csv`, toCSV(rows));
  };
  const exportExpenses = () => {
    const projName = new Map((data?.projects ?? []).map((p: any) => [p.id, p.name]));
    const divName = new Map((data?.projects ?? []).map((p: any) => [p.division_id, p.divisions?.name ?? ""]));
    const rows = (data?.entries ?? [])
      .filter((e) => e.direction === "expense")
      .map((e) => ({
        date: e.date,
        project: (e.project_id && projName.get(e.project_id)) || "",
        division: (e.division_id && divName.get(e.division_id)) || "",
        category: e.category ?? "",
        vendor: e.vendor ?? "",
        amount: Number(e.amount).toFixed(2),
        status: e.status,
        source_type: e.source_type,
        description: e.description ?? "",
      }));
    downloadCSV(`expenses_${from}_${to}.csv`, toCSV(rows));
  };
  const exportPayments = () => {
    const projName = new Map((data?.projects ?? []).map((p: any) => [p.id, p.name]));
    const divName = new Map((data?.projects ?? []).map((p: any) => [p.division_id, p.divisions?.name ?? ""]));
    const rows = (data?.entries ?? [])
      .filter((e) => e.direction === "income")
      .map((e) => ({
        date: e.date,
        project: (e.project_id && projName.get(e.project_id)) || "",
        division: (e.division_id && divName.get(e.division_id)) || "",
        client: e.client ?? "",
        amount: Number(e.amount).toFixed(2),
        status: e.status,
      }));
    downloadCSV(`payments_${from}_${to}.csv`, toCSV(rows));
  };


  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Reportes financieros</h1>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" className="h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label className="text-xs">Área del negocio</Label>
            <Select value={businessUnitId} onValueChange={setBusinessUnitId}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas las áreas</SelectItem>
                {businessUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}{unit.is_active ? "" : " (inactiva)"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" className="h-10" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label className="text-xs">División</Label>
            <Select value={divisionId} onValueChange={setDivisionId}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas las divisiones</SelectItem>
                {divisions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end col-span-2 sm:col-span-1">
            <Button onClick={exportPnL} variant="outline" className="h-10 w-full"><Download className="mr-2 h-4 w-4" /> Exportar resumen</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <KPI label="Cobrado" value={usd(summary.totalPay)} className="text-success" />
        <KPI label="Gastado" value={usd(summary.totalExp)} className="text-destructive" />
        <KPI label="Ganancia" value={usd(summary.profit)} className={profitClass(summary.profit)} />
      </div>

      <Tabs defaultValue="pnl" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pnl">Resumen</TabsTrigger>
          <TabsTrigger value="cat">Categorías</TabsTrigger>
          <TabsTrigger value="vendor">Proveedores</TabsTrigger>
          <TabsTrigger value="div">Divisiones</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl" className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {summary.pnl.length === 0 && !isLoading && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No hay datos en este periodo.</CardContent></Card>
          )}
          {summary.pnl.map((r) => (
            <Card key={r.name}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.division}</p>
                  </div>
                  <p className={`text-base font-bold ${profitClass(r.profit)}`}>{usd(r.profit)}</p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Cell label="Cobrado" value={usd(r.collected)} />
                  <Cell label="Gastado" value={usd(r.spent)} />
                  <Cell label="Margen" value={`${(r.margin * 100).toFixed(0)}%`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="cat">
          <BreakdownList rows={summary.byCategory} onExport={() => downloadCSV(`expenses_by_category_${from}_${to}.csv`, toCSV(summary.byCategory.map((r) => ({ category: r.name, amount: r.amount.toFixed(2) }))))} />
        </TabsContent>
        <TabsContent value="vendor">
          <BreakdownList rows={summary.byVendor} onExport={() => downloadCSV(`expenses_by_vendor_${from}_${to}.csv`, toCSV(summary.byVendor.map((r) => ({ vendor: r.name, amount: r.amount.toFixed(2) }))))} />
        </TabsContent>
        <TabsContent value="div" className="space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => downloadCSV(`by_division_${from}_${to}.csv`, toCSV(summary.byDivision.map((r) => ({ division: r.name, collected: r.collected.toFixed(2), spent: r.spent.toFixed(2), profit: r.profit.toFixed(2) }))))}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </div>
          {summary.byDivision.map((r) => (
            <Card key={r.name}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{r.name}</p>
                  <p className={`font-bold ${profitClass(r.profit)}`}>{usd(r.profit)}</p>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Cobrado: {usd(r.collected)}</span>
                  <span>Gastado: {usd(r.spent)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={exportExpenses} className="h-11"><Download className="mr-2 h-4 w-4" /> Gastos CSV</Button>
        <Button variant="outline" onClick={exportPayments} className="h-11"><Download className="mr-2 h-4 w-4" /> Cobros CSV</Button>
      </div>
    </div>
  );
};

const KPI = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <Card><CardContent className="p-3">
    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    <p className={`text-lg font-bold ${className ?? ""}`}>{value}</p>
  </CardContent></Card>
);
const Cell = ({ label, value }: { label: string; value: string }) => (
  <div><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>
);
const BreakdownList = ({ rows, onExport }: { rows: { name: string; amount: number }[]; onExport: () => void }) => {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="space-y-2">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={onExport}><Download className="mr-1 h-4 w-4" /> CSV</Button></div>
      {rows.length === 0 ? <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No hay datos.</CardContent></Card> : null}
      {rows.map((r) => (
        <Card key={r.name}><CardContent className="p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="font-semibold">{usd(r.amount)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(r.amount / max) * 100}%` }} />
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
};

export default Reports;
