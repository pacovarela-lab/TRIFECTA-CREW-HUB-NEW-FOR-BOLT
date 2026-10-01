import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";

export const normalizeBusinessUnitSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function useBusinessUnits(options?: { activeOnly?: boolean }) {
  const { companyId } = useUserRoles();
  return useQuery({
    queryKey: ["business-units", companyId, options?.activeOnly ? "active" : "all"],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("business_units")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order")
        .order("name");
      if (options?.activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCurrentCompany() {
  const { companyId } = useUserRoles();
  return useQuery({
    queryKey: ["current-company", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").eq("id", companyId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useBusinessUnitMutations() {
  const queryClient = useQueryClient();
  const { companyId } = useUserRoles();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["business-units"] });

  const create = useMutation({
    mutationFn: async ({ name, description, sortOrder }: { name: string; description?: string; sortOrder: number }) => {
      if (!companyId) throw new Error("No hay una compañía activa.");
      const cleanName = name.trim();
      const { error } = await supabase.from("business_units").insert({
        company_id: companyId,
        name: cleanName,
        slug: normalizeBusinessUnitSlug(cleanName),
        description: description?.trim() || null,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; description?: string | null; is_active?: boolean; sort_order?: number } }) => {
      const next = { ...patch } as typeof patch & { slug?: string };
      if (patch.name !== undefined) {
        next.name = patch.name.trim();
        next.slug = normalizeBusinessUnitSlug(patch.name);
      }
      const { error } = await supabase.from("business_units").update(next).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("business_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
