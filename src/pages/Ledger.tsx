import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usd } from "@/lib/format";
import { toast } from "sonner";

type Row = {
  client_id: string | null;
  client_name: string;
  estimated: number;
  received: number;
  spent: number;
  balance: number;
};

const Ledger = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { fetchLedger } = await import("@/lib/financialLedger");
        const { computeOverheadByProject } = await import("@/lib/overhead");
        const [clientsR, projectsR, ohExpR, ledger] = await Promise.all([
          supabase.from("clients").select("id,name"),
          supabase.from("projects").select(
            "id,client_id,estimated_total,is_sandbox,exclude_from_overhead",
          ),
          supabase.from("expenses").select("project_id, amount, spent_on, is_overhead"),
          fetchLedger(),
        ]);
        if (clientsR.error) throw clientsR.error;

        const projectClient = new Map<string, string | null>();
        const estimatedByClient = new Map<string, number>();
        const sandboxIds = new Set(
          (projectsR.data ?? []).filter((p: any) => p.is_sandbox).map((p: any) => p.id),
        );
        for (const p of projectsR.data ?? []) {
          projectClient.set(p.id, p.client_id);
          if (p.client_id && !p.is_sandbox) {
            estimatedByClient.set(
              p.client_id,
              (estimatedByClient.get(p.client_id) ?? 0) + Number(p.estimated_total ?? 0),
            );
          }
        }

        // Confirmed-only revenue and spend bucketed by client.
        const receivedByClient = new Map<string, number>();
        const spentByClient = new Map<string, number>();
        const isConfirmed = (s: string) => s === "confirmed" || s === "reconciled";
        for (const e of ledger) {
          if (!isConfirmed(e.status)) continue;
          if (e.project_id && sandboxIds.has(e.project_id)) continue;
          // Resolve client: payment's own client wins; otherwise via project.
          const cid =
            e.direction === "income" && e.client
              ? null /* client name only; we already aggregate by project below */
              : null;
          const projectClientId = e.project_id ? projectClient.get(e.project_id) ?? null : null;
          const targetCid = projectClientId; // splits + expenses + payments via project's client
          if (!targetCid) continue;
          if (e.direction === "income") {
            receivedByClient.set(targetCid, (receivedByClient.get(targetCid) ?? 0) + Number(e.amount));
          } else {
            spentByClient.set(targetCid, (spentByClient.get(targetCid) ?? 0) + Number(e.amount));
          }
          void cid;
        }

        // Add prorated overhead → bucket per client via project's client_id.
        const overheadMap = computeOverheadByProject(
          (ohExpR.data ?? []) as any[],
          (projectsR.data ?? []) as any[],
        );
        for (const [pid, share] of overheadMap) {
          const cid = projectClient.get(pid);
          if (!cid) continue;
          spentByClient.set(cid, (spentByClient.get(cid) ?? 0) + share);
        }

        const out: Row[] = (clientsR.data ?? []).map((c) => {
          const estimated = estimatedByClient.get(c.id) ?? 0;
          const received = receivedByClient.get(c.id) ?? 0;
          const spent = spentByClient.get(c.id) ?? 0;
          return {
            client_id: c.id,
            client_name: c.name,
            estimated,
            received,
            spent,
            balance: estimated - received,
          };
        });
        out.sort((a, b) => b.balance - a.balance);
        setRows(out);
      } catch (e: any) {
        toast.error(e.message ?? "Error cargando ledger");
      } finally {
        setLoading(false);
      }
    })();
  }, []);


  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.client_name.toLowerCase().includes(s));
  }, [rows, q]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          estimated: acc.estimated + r.estimated,
          received: acc.received + r.received,
          spent: acc.spent + r.spent,
          balance: acc.balance + r.balance,
        }),
        { estimated: 0, received: 0, spent: 0, balance: 0 },
      ),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Estado de cuenta por cliente</h1>
      <p className="text-sm text-muted-foreground">
        Compara lo presupuestado, lo cobrado, lo gastado y el saldo pendiente por cliente.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Presupuestado</CardTitle></CardHeader><CardContent className="text-lg font-bold">{usd(totals.estimated)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Cobrado</CardTitle></CardHeader><CardContent className="text-lg font-bold">{usd(totals.received)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Gastado</CardTitle></CardHeader><CardContent className="text-lg font-bold">{usd(totals.spent)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Saldo</CardTitle></CardHeader><CardContent className="text-lg font-bold">{usd(totals.balance)}</CardContent></Card>
      </div>

      <Input placeholder="Buscar cliente..." value={q} onChange={(e) => setQ(e.target.value)} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Gastado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin clientes</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.client_id ?? r.client_name}>
                  <TableCell className="font-medium">{r.client_name}</TableCell>
                  <TableCell className="text-right">{usd(r.estimated)}</TableCell>
                  <TableCell className="text-right">{usd(r.received)}</TableCell>
                  <TableCell className="text-right">{usd(r.spent)}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {usd(r.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Ledger;
