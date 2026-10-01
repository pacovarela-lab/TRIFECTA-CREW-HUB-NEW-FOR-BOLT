/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useCheckIn } from "@/hooks/useCheckins";
import { useWorkers, useProjects } from "@/hooks/useTrifectaData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

type CheckinSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string | null;
};

export function CheckinSheet({ open, onOpenChange, defaultProjectId }: CheckinSheetProps) {
  const { data: workers = [] } = useWorkers();
  const { data: projects = [] } = useProjects();
  const checkIn = useCheckIn();
  const [form, setForm] = useState<{ worker_id: string; project_id: string; notes: string }>({
    worker_id: "",
    project_id: defaultProjectId ?? "__none",
    notes: "",
  });
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const activeWorkers = workers.filter((worker: any) => worker.active !== false);

  const grabLocation = () => {
    if (!navigator.geolocation) { toast.error("El GPS no está disponible"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setLocating(false); toast.success("Ubicación capturada"); },
      (err) => { setLocating(false); toast.error(err.message); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async () => {
    if (!form.worker_id) { toast.error("Selecciona un ayudante"); return; }
    const project = projects.find((p: any) => p.id === form.project_id);
    await checkIn.mutateAsync({
      worker_id: form.worker_id,
      project_id: form.project_id === "__none" ? null : form.project_id,
      division_id: project?.division_id ?? null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      notes: form.notes || null,
    });
    onOpenChange(false);
    setForm({ worker_id: "", project_id: defaultProjectId ?? "__none", notes: "" });
    setCoords(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left"><SheetTitle>Nuevo registro de mano de obra</SheetTitle></SheetHeader>
        <div className="space-y-3 py-3">
          <div className="space-y-1">
            <Label className="text-xs">Ayudante *</Label>
            <Select value={form.worker_id} onValueChange={(v) => setForm({ ...form, worker_id: v })}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona un ayudante" /></SelectTrigger>
              <SelectContent>
                {activeWorkers.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}{w.trade ? ` · ${w.trade}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trabajo</Label>
            <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ninguno —</SelectItem>
                {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas</Label>
            <Input className="h-11" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ej. comenzó la instalación" />
          </div>
          <Button type="button" variant="outline" onClick={grabLocation} disabled={locating} className="h-11 w-full">
            <MapPin className="mr-2 h-4 w-4" /> {coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : locating ? "Localizando…" : "Capturar ubicación GPS"}
          </Button>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">Cancelar</Button>
          <Button onClick={submit} disabled={checkIn.isPending || !form.worker_id} className="h-11">
            {checkIn.isPending ? "Guardando…" : "Registrar entrada"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
