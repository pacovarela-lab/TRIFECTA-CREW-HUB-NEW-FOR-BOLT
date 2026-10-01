/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/useUserRoles";

// Subscribes to realtime changes on key tables and invalidates relevant queries.
// Channel topic is scoped to the user's company so realtime RLS authorizes access.
export const useRealtimeUpdates = () => {
  const qc = useQueryClient();
  const { companyId } = useUserRoles();

  useEffect(() => {
    if (!companyId) return;
    const filter = `company_id=eq.${companyId}`;
    const channel = supabase
      .channel(`company:${companyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts", filter }, (payload) => {
        const a: any = payload.new;
        if (a?.message) {
          const sev = a.severity as string;
          const fn = sev === "critical" ? toast.error : sev === "warning" ? toast.warning : toast.info;
          fn(a.message, { duration: 6000 });
        }
        qc.invalidateQueries({ queryKey: ["alerts"] });
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alerts", filter }, () => {
        qc.invalidateQueries({ queryKey: ["alerts"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reward_notifications", filter }, (payload) => {
        const r: any = payload.new;
        if (r?.message) toast.success(r.message, { duration: 5000 });
        qc.invalidateQueries({ queryKey: ["reward-notifications"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, () => {
        qc.invalidateQueries({ queryKey: ["tasks", "all"] });
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter }, () => {
        qc.invalidateQueries({ queryKey: ["expenses"] });
        qc.invalidateQueries({ queryKey: ["expense-review-queue"] });
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter }, () => {
        qc.invalidateQueries({ queryKey: ["payments"] });
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_checkins", filter }, () => {
        qc.invalidateQueries({ queryKey: ["worker-checkins"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc, companyId]);
};
