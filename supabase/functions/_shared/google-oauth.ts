import { constantTimeEqual, decodeState, signState } from "./crypto.ts";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export type GoogleCalendarConnectionState = {
  encrypted_refresh_token?: string | null;
  status?: string | null;
  last_error_code?: string | null;
} | null;

export type GoogleOAuthStatePayload = {
  nonce: string;
  userId: string;
  companyId: string;
  expiresAt: number;
};

export type StoredGoogleOAuthState = {
  user_id: string;
  company_id: string;
  expires_at: string;
  consumed_at?: string | null;
};

export const GOOGLE_OAUTH_STATE_ERROR_CODES = [
  "oauth_state_not_found",
  "oauth_state_expired",
  "oauth_state_already_used",
  "oauth_state_invalid",
] as const;

export type GoogleOAuthStateErrorCode = typeof GOOGLE_OAUTH_STATE_ERROR_CODES[number];

export function googleOAuthStateErrorCode(error: unknown): GoogleOAuthStateErrorCode | null {
  const value = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null
      ? Object.values(error as Record<string, unknown>).filter((part) => typeof part === "string").join(" ")
      : String(error ?? "");
  for (const code of GOOGLE_OAUTH_STATE_ERROR_CODES) {
    if (value.includes(code)) return code;
  }
  if (value.includes("expired_oauth_state")) return "oauth_state_expired";
  if (value.includes("invalid_oauth_state") || value.includes("oauth_state_mismatch")) return "oauth_state_invalid";
  return null;
}

export function requiresGoogleConsent(connection: GoogleCalendarConnectionState): boolean {
  return !connection?.encrypted_refresh_token ||
    connection.status === "requires_reconnect" ||
    connection.last_error_code === "invalid_grant";
}

export function googleAuthorizationParams(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  requireConsent: boolean;
}): URLSearchParams {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  });
  params.set("prompt", input.requireConsent ? "consent select_account" : "select_account");
  return params;
}

export async function verifyGoogleOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): Promise<GoogleOAuthStatePayload> {
  const [payloadPart, signature, extra] = state.split(".");
  if (!payloadPart || !signature || extra) throw new Error("invalid_oauth_state");
  const expected = await signState(payloadPart, secret);
  if (!constantTimeEqual(signature, expected)) throw new Error("invalid_oauth_state");
  const payload = decodeState<GoogleOAuthStatePayload>(payloadPart);
  if (!payload.nonce || payload.expiresAt < now) throw new Error("expired_oauth_state");
  return payload;
}

export function assertStoredGoogleOAuthStateUsable(
  stored: StoredGoogleOAuthState | null,
  payload: GoogleOAuthStatePayload,
  now = Date.now(),
): asserts stored is StoredGoogleOAuthState {
  if (!stored || stored.consumed_at || new Date(stored.expires_at).getTime() < now) {
    throw new Error("expired_or_used_oauth_state");
  }
  if (stored.user_id !== payload.userId || stored.company_id !== payload.companyId) {
    throw new Error("oauth_state_mismatch");
  }
}

const TOKEN_EXCHANGE_DESCRIPTION_LIMIT = 300;

function sanitizeTokenExchangeField(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.trim() === "") return "unavailable";
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<redacted>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<redacted>")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "<redacted>")
    .trim()
    .slice(0, limit);
}

/**
 * Builds a single sanitized log line for a failed Google token exchange.
 * Never includes codes, tokens, secrets, verifiers, state, emails or UUIDs.
 */
export function summarizeGoogleTokenExchangeFailure(status: number, rawBody: string): string {
  let error = "unavailable";
  let description = "unavailable";
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    error = sanitizeTokenExchangeField(parsed.error, 100);
    description = sanitizeTokenExchangeField(parsed.error_description, TOKEN_EXCHANGE_DESCRIPTION_LIMIT);
  } catch {
    error = "non_json_response";
    description = "unavailable";
  }
  return `google_token_exchange_failed status=${status} error=${error} description=${description}`;
}
