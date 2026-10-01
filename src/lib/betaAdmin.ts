/**
 * Beta Feedback Operations — single source of truth for the beta admin rule.
 *
 * Authorization is ALWAYS decided in the backend (`public.is_beta_feedback_admin()`
 * resolves `auth.uid()` against the authorized account). The constant below is
 * only used for display/tests — never as a client-side security decision.
 */

export const BETA_FEEDBACK_ADMIN_EMAIL = "hello@trifectahi.com";

export const FEEDBACK_STATUSES = ["new", "reviewing", "fixed", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  fixed: "Fixed",
  closed: "Closed",
};

/** Allowed forward transitions (backwards moves are allowed for corrections). */
export function nextFeedbackStatus(status: FeedbackStatus): FeedbackStatus | null {
  const idx = FEEDBACK_STATUSES.indexOf(status);
  if (idx < 0 || idx === FEEDBACK_STATUSES.length - 1) return null;
  return FEEDBACK_STATUSES[idx + 1];
}

export type FeedbackRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  status: FeedbackStatus;
  priority?: string | null;
  severity?: string | null;
  comments?: string | null;
  biggest_difficulty?: string | null;
  contact?: string | null;
  company_id: string;
  user_id: string;
  route?: string | null;
  app_version?: string | null;
  user_agent?: string | null;
};

export type FeedbackFilters = {
  status?: FeedbackStatus | "all";
  companyId?: string | "all";
  route?: string;
  search?: string;
  since?: string;
};

/** Pure filter used by the inbox (kept out of the component so it is testable). */
export function filterFeedback(rows: FeedbackRow[], filters: FeedbackFilters): FeedbackRow[] {
  const search = (filters.search || "").trim().toLowerCase();
  const route = (filters.route || "").trim().toLowerCase();
  return rows
    .filter((r) => !filters.status || filters.status === "all" || r.status === filters.status)
    .filter((r) => !filters.companyId || filters.companyId === "all" || r.company_id === filters.companyId)
    .filter((r) => !route || (r.route || "").toLowerCase().includes(route))
    .filter((r) => !filters.since || r.created_at >= filters.since)
    .filter((r) => {
      if (!search) return true;
      return [r.comments, r.biggest_difficulty, r.route, r.contact]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(search));
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Badge value: only ever rendered when the backend confirmed admin access. */
export function newFeedbackBadge(isAdmin: boolean, newCount: number): number {
  return isAdmin ? Math.max(0, newCount) : 0;
}
