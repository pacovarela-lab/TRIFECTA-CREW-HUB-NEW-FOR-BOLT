import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyExpenseRulesNow, defaultRulePatternFromExpense, ExpenseRuleDraft, ExpenseRuleField, saveExpenseRule } from "@/lib/expenseRules";

export function SaveExpenseRuleDialog({ draft, onClose, onSaved }: {
  draft: ExpenseRuleDraft | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const inferred = draft ? defaultRulePatternFromExpense(draft.source) : { field: "vendor" as ExpenseRuleField, pattern: "" };
  const defaults = draft
    ? { field: draft.defaultField ?? inferred.field, pattern: draft.defaultPattern ?? inferred.pattern }
    : inferred;
  const isDateRule = draft?.changes.date_transform === "future_date_swap_dm";
  const [field, setField] = useState<ExpenseRuleField>((defaults.field ?? inferred.field) as ExpenseRuleField);
  const [pattern, setPattern] = useState(defaults.pattern ?? inferred.pattern);
  const [applyNow, setApplyNow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft) return;
    const next = defaultRulePatternFromExpense(draft.source);
    setField((draft.defaultField ?? next.field) as ExpenseRuleField);
    setPattern(draft.defaultPattern ?? next.pattern);
    setApplyNow(false);
  }, [draft]);

  if (!draft) return null;

  const handleSave = async () => {
    if (!isDateRule && !pattern.trim()) {
      toast.error("Escribe el texto que debe coincidir");
      return;
    }
    setSaving(true);
    try {
      const rule = await saveExpenseRule(draft, {
        match_field: field,
        match_pattern: pattern,
        match_kind: "contains",
        auto_confirm: true,
      });
      let count = 0;
      if (applyNow) count = await applyExpenseRulesNow([rule], { overwrite: true });
      toast.success(applyNow ? `Regla guardada y ${count} gastos actualizados` : "Regla guardada");
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la regla");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> ¿Guardar como regla?
          </DialogTitle>
          <DialogDescription>
            Aprende esta corrección y aplícala automáticamente a gastos que coincidan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md bg-muted p-2 text-sm">
            <div className="mb-1 font-medium">Se aplicará:</div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs">
              {draft.labels.map((label) => <li key={label}>{label}</li>)}
            </ul>
          </div>

          {isDateRule ? (
            <div className="rounded-md border p-3 text-sm">
              Fecha futura con día/mes invertidos → corregir automáticamente.
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Cuando coincida el campo</Label>
                <Select value={field} onValueChange={(v) => setField(v as ExpenseRuleField)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendor">Vendor / Proveedor</SelectItem>
                    <SelectItem value="description">Descripción</SelectItem>
                    <SelectItem value="category">Categoría</SelectItem>
                    <SelectItem value="raw">Cualquier campo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contenga el texto</Label>
                <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="ej: HOME DEPOT" />
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={applyNow} onCheckedChange={(v) => setApplyNow(!!v)} />
            Aplicar ahora a gastos existentes que coincidan
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>No, solo esta vez</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Sparkles className="mr-2 h-4 w-4" /> {saving ? "Guardando…" : "Guardar regla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}