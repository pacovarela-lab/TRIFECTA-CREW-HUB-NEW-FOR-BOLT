/**
 * Pure trial helpers. The backend (public.company_trial_state / trg_trial_gate)
 * is the single source of truth; these helpers only mirror it for UX.
 *
 * Extension point for future reactivation (no billing yet):
 * setting companies.trial_status to 'paid' | 'extended' | 'exempt', or
 * companies.trial_exempt = true, grants permanent write access.
 */

export type TrialState = "exempt" | "active" | "expired" | "unknown";

export interface TrialSnapshot {
  state: TrialState;
  trialEndsAt: string | null;
  daysRemaining: number | null;
}

export const TRIAL_EXPIRED_ERROR = "trial_expired";

/** Mirror of the SQL rule, used for tests and optimistic UI only. */
export const computeTrialState = (
  company: { trial_exempt?: boolean | null; trial_status?: string | null; trial_ends_at?: string | null } | null,
  now: Date = new Date(),
): TrialState => {
  if (!company) return "unknown";
  if (company.trial_exempt) return "exempt";
  const status = company.trial_status ?? "";
  if (status === "paid" || status === "extended" || status === "exempt") return "exempt";
  if (status === "suspended") return "expired";
  if (status === "active" || status === "trial") {
    if (!company.trial_ends_at) return "active";
    return new Date(company.trial_ends_at).getTime() > now.getTime() ? "active" : "expired";
  }
  return "expired";
};

export const daysRemaining = (trialEndsAt: string | null, now: Date = new Date()): number | null => {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
};

export const canWrite = (snapshot: TrialSnapshot | null): boolean => {
  if (!snapshot) return true; // fail-open in UI only; the DB trigger still enforces
  return snapshot.state === "exempt" || snapshot.state === "active";
};

/** Discreet badge while active; louder at 7/3/1 days. */
export const trialBadge = (snapshot: TrialSnapshot | null): { text: string; urgent: boolean } | null => {
  if (!snapshot || snapshot.state !== "active") return null;
  const d = snapshot.daysRemaining;
  if (d === null) return null;
  return { text: d === 1 ? "Te queda 1 día de prueba" : `Te quedan ${d} días de prueba`, urgent: d <= 7 };
};

export const isTrialExpiredError = (error: unknown): boolean => {
  const message = typeof error === "string" ? error : (error as { message?: string } | null)?.message ?? "";
  return message.toLowerCase().includes(TRIAL_EXPIRED_ERROR);
};
