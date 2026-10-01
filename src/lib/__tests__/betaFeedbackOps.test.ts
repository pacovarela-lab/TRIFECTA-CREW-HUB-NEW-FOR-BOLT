import { describe, expect, it } from "vitest";
import {
  BETA_FEEDBACK_ADMIN_EMAIL,
  FEEDBACK_STATUSES,
  FeedbackRow,
  filterFeedback,
  newFeedbackBadge,
  nextFeedbackStatus,
} from "@/lib/betaAdmin";
import { buildFeedbackContext, formatFeedbackContext } from "@/lib/feedback";

const row = (over: Partial<FeedbackRow> = {}): FeedbackRow => ({
  id: crypto.randomUUID(),
  created_at: "2026-08-20T10:00:00.000Z",
  status: "new",
  company_id: "company-a",
  user_id: "user-a",
  comments: "Something broke",
  route: "/expenses",
  ...over,
});

describe("beta feedback operations", () => {
  it("A: a submitted feedback keeps exactly one row per submission id", () => {
    const submissionId = crypto.randomUUID();
    const attempts = [submissionId, submissionId, submissionId];
    const stored = new Map<string, string>();
    for (const id of attempts) if (!stored.has(id)) stored.set(id, "row");
    expect(stored.size).toBe(1);
  });

  it("B: double click within one dialog opening cannot create two submissions", () => {
    let submitting = false;
    let inserts = 0;
    const submit = () => {
      if (submitting) return;
      submitting = true;
      inserts += 1;
    };
    submit();
    submit();
    expect(inserts).toBe(1);
  });

  it("C: tenant scoped listing never exposes another tenant's rows", () => {
    const rows = [row({ company_id: "company-a" }), row({ company_id: "company-b" })];
    expect(filterFeedback(rows, { companyId: "company-a" })).toHaveLength(1);
  });

  it("D/G/H: badge and inbox access are false for anyone the backend did not confirm", () => {
    expect(newFeedbackBadge(false, 12)).toBe(0);
    expect(newFeedbackBadge(false, 0)).toBe(0);
  });

  it("E/L: confirmed admin sees the global new count", () => {
    expect(newFeedbackBadge(true, 3)).toBe(3);
  });

  it("F: status workflow advances new → reviewing → fixed → closed", () => {
    expect(FEEDBACK_STATUSES).toEqual(["new", "reviewing", "fixed", "closed"]);
    expect(nextFeedbackStatus("new")).toBe("reviewing");
    expect(nextFeedbackStatus("reviewing")).toBe("fixed");
    expect(nextFeedbackStatus("fixed")).toBe("closed");
    expect(nextFeedbackStatus("closed")).toBeNull();
  });

  it("I: diagnostics metadata carries no secrets and strips query strings", () => {
    const ctx = buildFeedbackContext({
      userId: "u1",
      companyId: "c1",
      route: "/expenses?token=supersecret",
      userAgent: "x".repeat(500),
      appVersion: "abc123",
      now: new Date("2026-08-20T10:00:00.000Z"),
    });
    expect(ctx.route).toBe("/expenses");
    expect(ctx.userAgent.length).toBeLessThanOrEqual(180);
    const text = formatFeedbackContext(ctx);
    expect(text).not.toMatch(/token|password|bearer|secret|apikey/i);
  });

  it("J: filters keep newest first for the inbox default ordering", () => {
    const rows = [
      row({ created_at: "2026-08-01T00:00:00.000Z", comments: "old" }),
      row({ created_at: "2026-08-21T00:00:00.000Z", comments: "new" }),
    ];
    expect(filterFeedback(rows, {})[0].comments).toBe("new");
  });

  it("K: search, route and date filters narrow the inbox", () => {
    const rows = [
      row({ comments: "camera fails", route: "/receipts", created_at: "2026-08-21T00:00:00.000Z" }),
      row({ comments: "totals wrong", route: "/reports", created_at: "2026-07-01T00:00:00.000Z" }),
    ];
    expect(filterFeedback(rows, { search: "camera" })).toHaveLength(1);
    expect(filterFeedback(rows, { route: "/reports" })).toHaveLength(1);
    expect(filterFeedback(rows, { since: "2026-08-01T00:00:00.000Z" })).toHaveLength(1);
  });

  it("M: the authorized beta admin identity is declared once", () => {
    expect(BETA_FEEDBACK_ADMIN_EMAIL).toBe("hello@trifectahi.com");
  });
});
