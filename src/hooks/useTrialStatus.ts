import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canWrite, type TrialSnapshot, type TrialState } from "@/lib/trial";

/**
 * Reads the trial state of the authenticated user's own company.
 * Derived server-side from auth.uid(); nothing is accepted from the client.
 */
export function useTrialStatus() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["trial-status", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<TrialSnapshot | null> => {
      const { data, error } = await supabase.rpc("my_trial_status");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        state: (row.state ?? "unknown") as TrialState,
        trialEndsAt: row.trial_ends_at ?? null,
        daysRemaining: row.days_remaining ?? null,
      };
    },
  });

  const snapshot = query.data ?? null;
  return {
    ...query,
    snapshot,
    canWrite: canWrite(snapshot),
    expired: snapshot?.state === "expired",
  };
}
