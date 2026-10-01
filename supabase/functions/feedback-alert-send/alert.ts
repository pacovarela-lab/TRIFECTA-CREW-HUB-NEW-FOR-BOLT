// Pure, dependency-free logic for the Beta Feedback email alert pipeline.
// Kept side-effect free so it can be unit tested from Vitest.

export const FEEDBACK_ALERT_EMAIL_TYPE = "beta_feedback_alert";

/** Fixed recipient. Never accepted from the client. */
export const FEEDBACK_ALERT_RECIPIENT = "hello@trifectahi.com";

/** Sender inside the verified sending domain (display From uses the root domain). */
export const FEEDBACK_ALERT_FROM = "Crew Hub Alerts <alerts@trifectaportal.app>";
export const FEEDBACK_ALERT_SENDER_DOMAIN = "notify.trifectaportal.app";
export const FEEDBACK_ALERT_REPLY_TO = "hello@trifectahi.com";
export const FEEDBACK_ALERT_TEMPLATE = "beta-feedback-alert";

export const FEEDBACK_INBOX_URL = "https://trifectaportal.app/feedback";
export const FEEDBACK_ALERT_SUBJECT = "New Crew Hub Beta Feedback";

const MAX_SNIPPET_LINES = 5;
const MAX_SNIPPET_CHARS = 500;

export function buildIdempotencyKey(submissionId: string): string {
  return `feedback-alert-${submissionId}`;
}

export type AttemptStatus = "pending" | "sent" | "failed";

export interface AttemptRow {
  id: string;
  status: string;
  attempts: number;
  idempotency_key: string | null;
}

export type SendDecision = "not_found" | "already_sent" | "send";

/**
 * Fail-closed decision: only an existing attempt row (created server-side by the
 * DB trigger) may trigger a send, and a row already marked `sent` never sends again.
 */
export function decideSendAction(attempt: AttemptRow | null | undefined): SendDecision {
  if (!attempt) return "not_found";
  if (attempt.status === "sent") return "already_sent";
  return "send";
}

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /eyJ[A-Za-z0-9._-]{20,}/g, // JWT-like
  /\b(sk|rk|pk)_[A-Za-z0-9]{10,}\b/g,
  /\b(api[_-]?key|apikey|password|passwd|secret|token|authorization)\b\s*[:=]\s*\S+/gi,
];

/** Strip anything that looks like a credential and clamp the comment snippet. */
export function sanitizeSnippet(raw: string | null | undefined): string {
  if (!raw) return "(no comment provided)";
  let text = String(raw);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  const lines = text.split(/\r?\n/).slice(0, MAX_SNIPPET_LINES);
  let snippet = lines.join("\n").trim();
  if (snippet.length > MAX_SNIPPET_CHARS) {
    snippet = `${snippet.slice(0, MAX_SNIPPET_CHARS)}…`;
  }
  return snippet || "(no comment provided)";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface FeedbackAlertContext {
  companyName: string | null;
  userEmail: string | null;
  createdAt: string | null;
  route: string | null;
  priority: string | null;
  severity: string | null;
  comments: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildAlertEmail(context: FeedbackAlertContext): RenderedEmail {
  const company = context.companyName?.trim() || "(unknown company)";
  const user = context.userEmail?.trim() || "(unknown user)";
  const when = context.createdAt || new Date().toISOString();
  const route = context.route?.trim() || "(not captured)";
  const priority = context.priority?.trim() || "medium";
  const severity = context.severity?.trim() || "(not set)";
  const snippet = sanitizeSnippet(context.comments);

  const rows: Array<[string, string]> = [
    ["Company", company],
    ["User", user],
    ["Date/time", when],
    ["Route", route],
    ["Priority", priority],
    ["Severity", severity],
  ];

  const text = [
    "New Crew Hub Beta Feedback",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Comment:",
    snippet,
    "",
    `Open the inbox: ${FEEDBACK_INBOX_URL}`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;">
  <h2 style="margin:0 0 16px;">New Crew Hub Beta Feedback</h2>
  <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="color:#666;">${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`,
      )
      .join("\n    ")}
  </table>
  <p style="font-size:14px;"><strong>Comment</strong><br/>${escapeHtml(snippet).replace(/\n/g, "<br/>")}</p>
  <p style="font-size:14px;"><a href="${FEEDBACK_INBOX_URL}">Open the Beta Feedback inbox</a></p>
</body></html>`;

  return { subject: FEEDBACK_ALERT_SUBJECT, html, text };
}

/** Provider errors are stored without payloads/headers. */
export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown error");
  return sanitizeSnippet(raw).slice(0, 300);
}
