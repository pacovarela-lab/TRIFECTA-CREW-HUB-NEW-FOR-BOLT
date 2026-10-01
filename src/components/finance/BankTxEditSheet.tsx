import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tx: any | null;
}

export function BankTxEditSheet({ open, onOpenChange, tx }: Props) {
  const qc = useQueryClient();
  const [postedOn, setPostedOn] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !tx) return;
    setPostedOn(tx.posted_on ?? "");
    setAmount(String(tx.amount ?? ""));
    setDescription(tx.description ?? "");
    setNotes(tx.notes ?? "");
  }, [open, tx]);

  if (!tx) return null;

  const save = async () => {
    const amt = Number(amount);
    if (!postedOn) return toast.error("Fecha obligatoria");
    if (!Number.isFinite(amt) || amt === 0) return toast.error("Monto inválido");
    if (!description.trim()) return toast.error("Descripción obligatoria");
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("bank_transactions")
        .update({
          posted_on: postedOn,
          amount: amt,
          description: description.trim(),
          notes: notes.trim() || null,
          direction: amt < 0 ? "debit" : "credit",
        })
        .eq("id", tx.id);
      if (error) throw error;
      toast.success("Movimiento actualizado");
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader><SheetTitle>Editar movimiento del banco</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha *</Label>
              <Input type="date" className="h-11" value={postedOn} onChange={(e) => setPostedOn(e.target.value)} />
            </div>
            <div>
              <Label>Monto * <span className="text-xs text-muted-foreground">(negativo = cargo)</span></Label>
              <Input type="number" inputMode="decimal" step="0.01" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Descripción *</Label>
            <Input className="h-11" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Detalle interno, contexto, cliente sugerido…" />
          </div>
          <p className="text-xs text-muted-foreground">
            Para asignar cliente, proyecto, categoría o método de pago: usa <strong>Crear gasto</strong> o <strong>Crear pago</strong> desde la tarjeta — esos campos viven en el gasto/pago vinculado, no en el movimiento del banco.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button className="flex-1 h-11" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
