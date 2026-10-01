import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "manager" | "member" | "viewer" | "field";

export function useUserRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) {
        setRoles([]);
        setCompanyId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.company_id) {
        if (!cancelled) {
          setRoles([]);
          setCompanyId(null);
          setLoading(false);
        }
        return;
      }
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("company_id", profile.company_id);
      if (!cancelled) {
        setCompanyId(profile.company_id);
        setRoles((roleRows || []).map((r) => r.role as AppRole));
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, reloadToken]);

  const refresh = useCallback(async () => {
    setReloadToken((n) => n + 1);
  }, []);

  const isField = roles.includes("field") && !roles.includes("admin") && !roles.includes("manager");
  return {
    roles,
    companyId,
    refresh,
    loading,
    isAdmin: roles.includes("admin"),
    isManager: roles.includes("manager"),
    isField,
    canSeeFinancials: !isField,
    hasRole: (r: AppRole) => roles.includes(r),
  };
}
