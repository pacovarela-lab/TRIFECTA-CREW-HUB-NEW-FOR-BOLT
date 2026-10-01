import { describe, expect, it } from "vitest";
import {
  buildAlertEmail,
  buildIdempotencyKey,
  decideSendAction,
  FEEDBACK_ALERT_FROM,
  FEEDBACK_ALERT_RECIPIENT,
  FEEDBACK_ALERT_REPLY_TO,
  safeErrorMessage,
  sanitizeSnippet,
  type AttemptRow,
} from "../../supabase/functions/feedback-alert-send/alert";

const attempt = (over: Partial<AttemptRow> = {}): AttemptRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  status: "pending",
  attempts: 0,
  idempotency_key: "feedback-alert-abc",
  ...over,
});

describe("beta feedback email pipeline", () => {
  it("A/B: one submission maps to exactly one logical attempt key", () => {
    const key = buildIdempotencyKey("abc");
    expect(key).toBe("feedback-alert-abc");
    expect(buildIdempotencyKey("abc")).toBe(key);
  });

  it("C: a pending attempt is allowed to send", () => {
    expect(decideSendAction(attempt())).toBe("send");
  });

  it("D: a second invocation for the same submission never sends twice", () => {
    expect(decideSendAction(attempt({ status: "sent" }))).toBe("already_sent");
  });

  it("E/K: an unknown or unauthorized reference is fail-closed", () => {
    expect(decideSendAction(null)).toBe("not_found");
    expect(decideSendAction(undefined)).toBe("not_found");
  });

  it("G/H: a failed attempt retries under the same idempotency key", () => {
    const failed = attempt({ status: "failed", attempts: 1 });
    expect(decideSendAction(failed)).toBe("send");
    expect(failed.idempotency_key).toBe(buildIdempotencyKey("abc"));
  });

  it("I: retry after sent does not send a second email", () => {
    expect(decideSendAction(attempt({ status: "sent", attempts: 3 }))).toBe("already_sent");
  });

  it("J: recipient, sender and reply-to are fixed server-side constants", () => {
    expect(FEEDBACK_ALERT_RECIPIENT).toBe("hello@trifectahi.com");
    expect(FEEDBACK_ALERT_FROM).toBe("Crew Hub Alerts <alerts@trifectaportal.app>");
    expect(FEEDBACK_ALERT_REPLY_TO).toBe("hello@trifectahi.com");
  });

  it("L: the email body carries context but never secrets", () => {
    const email = buildAlertEmail({
      companyName: "Acme Co",
      userEmail: "tester@example.com",
      createdAt: "2026-08-26T00:00:00.000Z",
      route: "/dashboard",
      priority: "high",
      severity: "blocker",
      comments:
        "Broken here. Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop\napi_key=sk_live_0123456789abcdef",
    });

    expect(email.subject).toBe("New Crew Hub Beta Feedback");
    expect(email.text).toContain("Acme Co");
    expect(email.text).toContain("/dashboard");
    expect(email.text).toContain("https://trifectaportal.app/feedback");
    for (const body of [email.text, email.html]) {
      expect(body).not.toMatch(/Bearer\s+eyJ/);
      expect(body).not.toContain("sk_live_0123456789abcdef");
      expect(body).toContain("[redacted]");
    }
  });

  it("L: provider errors are stored redacted and clamped", () => {
    const msg = safeErrorMessage(new Error("failed with token=supersecretvalue"));
    expect(msg).not.toContain("supersecretvalue");
    expect(msg.length).toBeLessThanOrEqual(300);
  });

  it("clamps long comments", () => {
    expect(sanitizeSnippet("x".repeat(900)).length).toBeLessThanOrEqual(501);
    expect(sanitizeSnippet(null)).toBe("(no comment provided)");
  });
});
