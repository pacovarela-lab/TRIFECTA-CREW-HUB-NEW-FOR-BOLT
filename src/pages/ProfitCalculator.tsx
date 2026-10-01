/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateModeA, calculateModeB, CONTINGENCY_RATES, type ContingencyRate } from "@/lib/profitCalculator";
import { ProjectCreateDialog } from "@/components/projects/ProjectCreateDialog";
import { usd as formatUSD } from "@/lib/format";

const ProfitCalculator = () => {
  const [tab, setTab] = useState<"a" | "b">("a");

  // Mode A
  const [charge, setCharge] = useState("");
  const [materials, setMaterials] = useState("");
  const [labor, setLabor] = useState("");
  const [other, setOther] = useState("");

  // Mode B
  const [bMaterials, setBMaterials] = useState("");
  const [helperDays, setHelperDays] = useState("");
  const [helperCost, setHelperCost] = useState("");
  const [ownerDays, setOwnerDays] = useState("");
  const [ownerRate, setOwnerRate] = useState("");
  const [contingency, setContingency] = useState<ContingencyRate>(0.15);

  const [createOpen, setCreateOpen] = useState(false);

  const modeA = useMemo(() => {
    if (!charge && !materials && !labor && !other) return null;
    return calculateModeA({
      chargeAmount: Number(charge) || 0,
      materials: Number(materials) || 0,
      labor: Number(labor) || 0,
      other: Number(other) || 0,
    });
  }, [charge, materials, labor, other]);

  const modeB = useMemo(() => {
    if (!bMaterials && !helperDays && !helperCost && !ownerDays && !ownerRate) return null;
    return calculateModeB({
      materials: Number(bMaterials) || 0,
      helperDays: Number(helperDays) || 0,
      helperDailyCost: Number(helperCost) || 0,
      ownerDays: Number(ownerDays) || 0,
      ownerDailyRate: Number(ownerRate) || 0,
      contingency,
    });
  }, [bMaterials, helperDays, helperCost, ownerDays, ownerRate, contingency]);

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Herramientas</p>
        <h1 className="text-2xl font-bold tracking-tight">Calculadora de ganancia</h1>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "a" | "b")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="a">Ganancia proyectada</TabsTrigger>
          <TabsTrigger value="b">Presupuesto rápido</TabsTrigger>
        </TabsList>

        <TabsContent value="a" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Modo A — Ganancia proyectada</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Precio al cliente (USD)</Label>
                <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={charge} onChange={(e) => setCharge(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Materiales estimados (USD)</Label>
                <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={materials} onChange={(e) => setMaterials(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mano de obra estimada (USD)</Label>
                <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={labor} onChange={(e) => setLabor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Otros costos (USD)</Label>
                <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={other} onChange={(e) => setOther(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {modeA && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <Row label="Costos totales" value={formatUSD(modeA.totalCost)} />
                <Row label="Ganancia proyectada" value={modeA.profit !== null ? formatUSD(modeA.profit) : "—"} highlight={modeA.isLoss ? "danger" : "success"} />
                <Row label="Margen" value={modeA.margin !== null ? `${(modeA.margin * 100).toFixed(1)}%` : "—"} highlight={modeA.isLoss ? "danger" : undefined} />
                {modeA.isLoss && <p className="text-sm font-semibold text-destructive">Pérdida: el precio no cubre los costos</p>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="b" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Modo B — Presupuesto rápido</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Materiales estimados (USD)</Label>
                <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={bMaterials} onChange={(e) => setBMaterials(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Días de ayudantes</Label>
                  <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={helperDays} onChange={(e) => setHelperDays(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Costo diario ayudante (USD)</Label>
                  <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={helperCost} onChange={(e) => setHelperCost(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Días propios</Label>
                  <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={ownerDays} onChange={(e) => setOwnerDays(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ingreso deseado por día (USD)</Label>
                  <Input className="h-11" type="number" inputMode="decimal" placeholder="0" value={ownerRate} onChange={(e) => setOwnerRate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Margen / contingencia</Label>
                <Select value={String(contingency)} onValueChange={(v) => setContingency(Number(v) as ContingencyRate)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTINGENCY_RATES.map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {modeB && (
            <>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <Row label="Mano de obra (ayudantes)" value={formatUSD(modeB.laborCost)} />
                  <Row label="Costo base" value={formatUSD(modeB.totalCost)} />
                  <Row label="Precio mínimo sugerido" value={formatUSD(modeB.suggestedPrice)} highlight="success" />
                </CardContent>
              </Card>
              <Button className="h-11 w-full" onClick={() => setCreateOpen(true)}>
                Crear trabajo con este presupuesto
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ProjectCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

const Row = ({ label, value, highlight }: { label: string; value: string; highlight?: "success" | "danger" }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className={`text-sm font-bold ${highlight === "success" ? "text-success" : highlight === "danger" ? "text-destructive" : ""}`}>{value}</span>
  </div>
);

export default ProfitCalculator;
