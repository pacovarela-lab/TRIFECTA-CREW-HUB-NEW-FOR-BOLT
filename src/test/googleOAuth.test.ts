import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { encodeState, signState } from "../../supabase/functions/_shared/crypto";
import {
  assertStoredGoogleOAuthStateUsable,
  GOOGLE_CALENDAR_SCOPES,
  googleAuthorizationParams,
  googleOAuthStateErrorCode,
  requiresGoogleConsent,
  verifyGoogleOAuthState,
} from "../../supabase/functions/_shared/google-oauth";

const authorizationParams = (requireConsent: boolean) => googleAuthorizationParams({
  clientId: "client-id",
  redirectUri: "https://example.supabase.co/functions/v1/google-calendar-connect-callback",
  state: "state.signature",
  challenge: "challenge",
  requireConsent,
});

describe("Google OAuth authorization", () => {
  it("forces consent for the first connection", () => {
    expect(requiresGoogleConsent(null)).toBe(true);
    expect(authorizationParams(true).get("prompt")).toBe("consent select_account");
  });

  it("does not force consent for a valid existing authorization", () => {
    expect(requiresGoogleConsent({ encrypted_refresh_token: "encrypted", status: "connected", last_error_code: null })).toBe(false);
    expect(authorizationParams(false).get("prompt")).toBe("select_account");
    expect(authorizationParams(false).get("prompt")).not.toContain("consent");
  });

  it("forces consent when the refresh token is absent", () => {
    expect(requiresGoogleConsent({ encrypted_refresh_token: null, status: "connected", last_error_code: null })).toBe(true);
  });

  it("forces consent after invalid_grant or an explicit reconnect state", () => {
    expect(requiresGoogleConsent({ encrypted_refresh_token: "encrypted", status: "connected", last_error_code: "invalid_grant" })).toBe(true);
    expect(requiresGoogleConsent({ encrypted_refresh_token: "encrypted", status: "requires_reconnect", last_error_code: null })).toBe(true);
  });

  it("uses incremental offline access, minimum scopes, and PKCE", () => {
    const params = authorizationParams(false);
    expect(params.get("include_granted_scopes")).toBe("true");
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("code_challenge")).toBe("challenge");
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("scope")?.split(" ")).toEqual([...GOOGLE_CALENDAR_SCOPES]);
    expect(params.get("scope")).not.toContain("https://www.googleapis.com/auth/calendar ");
  });
});

describe("Google OAuth state", () => {
  it("uses narrow RPCs instead of exposing the private schema", () => {
    const start = readFileSync("supabase/functions/google-calendar-connect-start/index.ts", "utf8");
    const callback = readFileSync("supabase/functions/google-calendar-connect-callback/index.ts", "utf8");
    expect(start).toContain('admin.rpc("create_google_oauth_state"');
    expect(callback).toContain('admin.rpc("consume_google_oauth_state"');
    expect(start).not.toContain('.schema("private")');
    expect(callback).not.toContain('.schema("private")');
  });

  it("maps RPC and signed-state failures to stable public codes", () => {
    expect(googleOAuthStateErrorCode({ code: "P0001", message: "oauth_state_not_found" })).toBe("oauth_state_not_found");
    expect(googleOAuthStateErrorCode(new Error("expired_oauth_state"))).toBe("oauth_state_expired");
    expect(googleOAuthStateErrorCode(new Error("invalid_oauth_state"))).toBe("oauth_state_invalid");
    expect(googleOAuthStateErrorCode(new Error("database connection failed"))).toBeNull();
  });
  it("accepts a valid signed state and rejects tampering", async () => {
    const secret = "state-secret-with-at-least-thirty-two-bytes";
    const payload = { nonce: "nonce", userId: "user", companyId: "company", expiresAt: Date.now() + 60_000 };
    const encoded = encodeState(payload);
    const state = `${encoded}.${await signState(encoded, secret)}`;
    await expect(verifyGoogleOAuthState(state, secret)).resolves.toEqual(payload);
    await expect(verifyGoogleOAuthState(`${encoded}.invalid`, secret)).rejects.toThrow("invalid_oauth_state");
  });

  it("rejects an expired or already consumed state", () => {
    const payload = { nonce: "nonce", userId: "user", companyId: "company", expiresAt: Date.now() + 60_000 };
    expect(() => assertStoredGoogleOAuthStateUsable({
      user_id: "user", company_id: "company", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
    }, payload)).not.toThrow();
    expect(() => assertStoredGoogleOAuthStateUsable({
      user_id: "user", company_id: "company", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: new Date().toISOString(),
    }, payload)).toThrow("expired_or_used_oauth_state");
  });
});
