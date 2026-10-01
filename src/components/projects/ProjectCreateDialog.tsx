import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDivisions } from "@/hooks/useTrifectaData";
import { useBusinessUnits } from "@/hooks/useBusinessUnits";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { preselectDivisionId } from "@/lib/onboarding";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const ProjectCreateDialog = ({ open, onOpenChange }: Props) => {
  const { data: divisions } = useDivisions();
  const { data: businessUnits = [] } = useBusinessUnits({ activeOnly: true });
  const { companyId } = useUserRoles();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState("__none");
  const [budget, setBudget] = useState("0");
  const [address, setAddress] = useState("");

  // A brand-new tenant has exactly one division (General): preselect it.
  useEffect(() => {
    if (!divisionId) setDivisionId(preselectDivisionId(divisions));
  }, [divisions, divisionId]);

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("no_company");
      const { data, error } = await supabase
        .from("projects")
        .insert({
          company_id: companyId,
          division_id: divisionId,
          business_unit_id: businessUnitId === "__none" ? null : businessUnitId,
          name: name.trim(),
          estimated_total: Number(budget) || 0,
          address: address.trim() || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      setName("");
      setAddress("");
      toast.success("Trabajo creado");
      navigate(`/projects/${id}`);
    },
    onError: () => toast.error("No pudimos crear el trabajo."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo trabajo</DialogTitle>
          <DialogDescription>Solo necesitas un nombre. Puedes completar lo demás después.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nombre del trabajo *</Label>
            <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {(divisions?.length ?? 0) > 1 && <div className="space-y-1">
            <Label className="text-xs">Organización interna</Label>
            <Select value={divisionId} onValueChange={setDivisionId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>
                {divisions?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>}
          <div className="space-y-1">
            <Label className="text-xs">Tipo de trabajo</Label>
            <Select value={businessUnitId} onValueChange={setBusinessUnitId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Sin tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin tipo</SelectItem>
                {businessUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">¿Cuánto vas a cobrar? (opcional)</Label>
            <Input className="h-11" type="number" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dirección (opcional)</Label>
            <Input className="h-11" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Puedes agregarla después" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="h-11"
            disabled={create.isPending || !name.trim() || !divisionId}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creando…" : "Crear trabajo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
