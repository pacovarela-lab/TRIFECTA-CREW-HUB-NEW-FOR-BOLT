import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeBusinessUnitSlug } from "@/hooks/useBusinessUnits";
import { normalizeAreaNames } from "@/lib/onboarding";

/**
 * Self-service tenant creation.
 * The company is created entirely by a SECURITY DEFINER RPC derived from auth.uid();
 * the client never sends (nor can forge) a company_id.
 */
export function useCreateCompany() {
  return useMutation({
    mutationFn: async ({ name, timezone }: { name: string; timezone: string }) => {
      const { data, error } = await supabase.rpc("create_company_for_current_user", {
        _name: name.trim(),
        _timezone: timezone,
      });
      if (error) throw error;
      return data as string;
    },
  });
}

/** Optional step: create the tenant's own business areas. Skipping persists nothing. */
export function useCreateBusinessAreas() {
  return useMutation({
    mutationFn: async ({ companyId, names }: { companyId: string; names: string[] }) => {
      const clean = normalizeAreaNames(names);
      if (clean.length === 0) return 0;
      const { error } = await supabase.from("business_units").insert(
        clean.map((name, index) => ({
          company_id: companyId,
          name,
          slug: normalizeBusinessUnitSlug(name),
          sort_order: index,
        })),
      );
      if (error) throw error;
      return clean.length;
    },
  });
}
