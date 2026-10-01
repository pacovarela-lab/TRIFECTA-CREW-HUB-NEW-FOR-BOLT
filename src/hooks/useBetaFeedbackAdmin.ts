import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type BetaOverview = {
  new_count: number;
  reviewing_count: number;
  fixed_count: number;
  closed_count: number;
  active_trial_companies: number;
  trials_expiring_soon: number;
  expired_trials: number;
};

/**
 * Backend-decided authorization: the RPC resolves auth.uid() against the single
 * authorized beta admin account. The client never asserts it by email.
 */
export function useBetaFeedbackAdmin() {
  const { user } = useAuth();
  const [isBetaAdmin, setIsBetaAdmin] = useState(false);
  const [overview, setOverview] = useState<BetaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);

  const refresh = useCallback(() => setToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user) {
        setIsBetaAdmin(false);
        setOverview(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("is_beta_feedback_admin");
      const admin = !error && data === true;
      let ov: BetaOverview | null = null;
      if (admin) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (supabase as any).rpc("beta_feedback_overview");
        if (!res.error && Array.isArray(res.data) && res.data[0]) ov = res.data[0] as BetaOverview;
      }
      if (!cancelled) {
        setIsBetaAdmin(admin);
        setOverview(ov);
        setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  return { isBetaAdmin, overview, loading, refresh };
}
