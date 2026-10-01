/**
 * Beta feedback diagnostic context.
 *
 * Only non-sensitive identifiers are collected: never passwords, tokens,
 * secrets, receipt contents, or any other tenant's data.
 */

export type FeedbackContextInput = {
  userId: string;
  companyId: string;
  route: string;
  userAgent?: string | null;
  appVersion?: string | null;
  now?: Date;
};

export type FeedbackContext = {
  userId: string;
  companyId: string;
  route: string;
  timestamp: string;
  appVersion: string;
  userAgent: string;
};

const MAX_USER_AGENT = 180;

export function buildFeedbackContext(input: FeedbackContextInput): FeedbackContext {
  const version =
    input.appVersion ??
    (typeof import.meta !== "undefined" ? (import.meta.env?.VITE_APP_COMMIT as string | undefined) : undefined) ??
    "unknown";
  return {
    userId: input.userId,
    companyId: input.companyId,
    route: (input.route || "/").split("?")[0],
    timestamp: (input.now ?? new Date()).toISOString(),
    appVersion: version,
    userAgent: (input.userAgent ?? "unknown").slice(0, MAX_USER_AGENT),
  };
}

export function formatFeedbackContext(context: FeedbackContext): string {
  return [
    "--- diagnostics ---",
    `route: ${context.route}`,
    `timestamp: ${context.timestamp}`,
    `user: ${context.userId}`,
    `company: ${context.companyId}`,
    `version: ${context.appVersion}`,
    `agent: ${context.userAgent}`,
  ].join("\n");
}
