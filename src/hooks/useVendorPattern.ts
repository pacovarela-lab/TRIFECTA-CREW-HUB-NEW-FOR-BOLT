import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Devuelve la sugerencia más usada (categoría/proyecto/división) para un vendor.
 * Aprende automáticamente cuando se guarda un gasto vía recordVendorPattern.
 */
export function useVendorSuggestion(vendorId?: string | null) {
  return useQuery({
    queryKey: ["vendor-pattern", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_category_patterns")
        .select("category_id, project_id, division_id, times_used")
        .eq("vendor_id", vendorId!)
        .order("times_used", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRecordVendorPattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      company_id: string;
      vendor_id: string;
      category_id?: string | null;
      project_id?: string | null;
      division_id?: string | null;
    }) => {
      // upsert manual: buscar combinación existente
      const { data: existing } = await supabase
        .from("vendor_category_patterns")
        .select("id, times_used")
        .eq("vendor_id", input.vendor_id)
        .eq("category_id", input.category_id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("vendor_category_patterns")
          .update({ times_used: existing.times_used + 1, last_used_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("vendor_category_patterns").insert({
          company_id: input.company_id,
          vendor_id: input.vendor_id,
          category_id: input.category_id ?? null,
          project_id: input.project_id ?? null,
          division_id: input.division_id ?? null,
        });
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-pattern", vars.vendor_id] });
    },
  });
}
