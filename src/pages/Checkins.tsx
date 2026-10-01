/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCheckins, useCheckOut } from "@/hooks/useCheckins";
import { useExpenses, useWorkers, useProjects } from "@/hooks/useTrifectaData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Clock, Plus, LogOut as LogOutIcon, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usd } from "@/lib/format";
import { buildLaborProjectGroups, checkinHours } from "@/lib/laborRegister";
import { CheckinSheet } from "@/components/checkins/CheckinSheet";

const Checkins = () => {
  const { data: checkins = [], isLoading: checkinsLoading } = useCheckins();
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses();
  const { data: workers = [] } = useWorkers();
  const { data: projects = [] } = useProjects();
  const checkOut = useCheckOut();
  const [searchParams] = useSearchParams();
  const projectParam = searchParams.get("project");
  const [open, setOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState(projectParam ?? "__all");
  const [workerFilter, setWorkerFilter] = useState("__all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const isLoading = checkinsLoading || expensesLoading;
  const groups = useMemo(() => buildLaborProjectGroups(expenses as any[], checkins as any[], {
    projectId: projectFilter === "__all" ? null : projectFilter,
    workerId: workerFilter === "__all" ? null : workerFilter,
    from: from || null,
    to: to || null,
  }), [checkins, expenses, from, projectFilter, to, workerFilter]);

  const open_ones = checkins.filter((c: any) => !c.checked_out_at);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registro de mano de obra</h1>
          <p className="text-xs text-muted-foreground">{open_ones.length} en obra ahora</p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-11"><Plus className="mr-1 h-4 w-4" /> Registrar</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label className="text-xs">Trabajo</Label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los trabajos</SelectItem>
                {projects.map((project: any) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label className="text-xs">Ayudante</Label>
            <Select value={workerFilter} onValueChange={setWorkerFilter}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los ayudantes</SelectItem>
                {workers.map((worker: any) => <SelectItem key={worker.id} value={worker.id}>{worker.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" className="h-10" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" className="h-10" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        </CardContent>
      </Card>

      {open_ones.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">En obra</h2>
          <div className="space-y-2">
            {open_ones.map((c: any) => (
              <Card key={c.id} className="border-l-4 border-success">
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.workers?.name ?? "Ayudante"}</p>
                    <p className="truncate text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(c.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {c.projects?.name && <> · {c.projects.name}</>}
                    </p>
                    {c.latitude && (
                      <a href={`https://maps.google.com/?q=${c.latitude},${c.longitude}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> Ver en el mapa
                      </a>
                    )}
                    {c.notes && <p className="mt-1 text-xs italic text-muted-foreground">{c.notes}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => checkOut.mutate(c.id)} disabled={checkOut.isPending}>
                    <LogOutIcon className="mr-1 h-3 w-3" /> Salida
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resumen por trabajo</h2>
          <div className="space-y-3">
            {groups.map((group) => (
              <Card key={group.projectId ?? "__unassigned"}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="eyebrow">Trabajo</p><p className="truncate font-bold">{group.projectName}</p></div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">Mano de obra</p>
                      <p className="money font-bold">{usd(group.totalCost)}</p>
                      {group.totalHours > 0 && <p className="text-xs text-muted-foreground">{group.totalHours.toFixed(1)} h</p>}
                    </div>
                  </div>

                  {group.expenses.length > 0 && <div className="space-y-1.5">
                    <p className="text-xs font-semibold">Costos registrados</p>
                    {group.expenses.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{expense.workers?.name ?? "Sin ayudante asignado"}</p>
                        <p className="text-muted-foreground">{expense.spent_on ?? "Sin fecha"}</p>
                      </div>
                      <p className="money font-semibold">{usd(Number(expense.amount) || 0)}</p>
                    </div>)}
                  </div>}

                  {group.checkins.length > 0 && <div className="space-y-1.5">
                    <p className="text-xs font-semibold">Horas registradas</p>
                    {group.checkins.map((checkin) => <div key={checkin.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{checkin.workers?.name ?? "Ayudante"}</p>
                        <p className="text-muted-foreground">{new Date(checkin.checked_in_at).toLocaleDateString()}</p>
                      </div>
                      <Badge variant="outline">{checkinHours(checkin).toFixed(1)} h</Badge>
                    </div>)}
                  </div>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!isLoading && groups.length === 0 && open_ones.length === 0 && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Todavía no hay mano de obra registrada para este trabajo.
        </CardContent></Card>
      )}

      <CheckinSheet open={open} onOpenChange={setOpen} defaultProjectId={projectParam} />
    </div>
  );
};

export default Checkins;
