import { describe, expect, it } from "vitest";
import {
  CORS_METHODS,
  corsPreflight,
  json,
  resolveCompanyContext,
} from "../../supabase/functions/_shared/integration-http";
import { googleCalendarErrorMessage, googleCalendarStateErrorMessage } from "../lib/googleCalendarErrors";

describe("Google Calendar CORS", () => {
  it("answers OPTIONS successfully without invoking authentication", () => {
    let authenticationAttempted = false;
    const response = corsPreflight(new Request("https://example.test", { method: "OPTIONS" }), CORS_METHODS.post)
      ?? (() => { authenticationAttempted = true; return null; })();
    expect(response?.status).toBe(204);
    expect(authenticationAttempted).toBe(false);
    expect(response?.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  });

  it.each([200, 401, 403, 500])("keeps CORS headers on HTTP %s", (status) => {
    const response = json({ ok: status === 200 }, status, CORS_METHODS.post);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  });

  it("keeps callback CORS limited to GET and OPTIONS", () => {
    const response = json({ ok: false, error: "oauth_error" }, 500, CORS_METHODS.get);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-methods")).not.toContain("POST");
  });
});

describe("company context resolution", () => {
  it("allows admin and member roles in the same company", () => {
    expect(resolveCompanyContext([
      { company_id: "company-a", role: "admin" },
      { company_id: "company-a", role: "member" },
    ])).toBe("company-a");
  });

  it("allows one member in one company", () => {
    expect(resolveCompanyContext([{ company_id: "company-a", role: "member" }])).toBe("company-a");
  });

  it("requires context for two distinct companies", () => {
    expect(() => resolveCompanyContext([
      { company_id: "company-a", role: "admin" },
      { company_id: "company-b", role: "member" },
    ])).toThrow("company_context_required");
  });

  it("deduplicates three roles belonging to the same company", () => {
    expect(resolveCompanyContext([
      { company_id: "company-a", role: "admin" },
      { company_id: "company-a", role: "member" },
      { company_id: "company-a", role: "viewer" },
    ])).toBe("company-a");
  });

  it("does not count inactive or invalid memberships", () => {
    expect(() => resolveCompanyContext([
      { company_id: "company-a", role: "member", active: false },
      { company_id: null, role: "admin" },
      { company_id: "company-b", role: null },
    ])).toThrow("company_membership_required");
  });
});

describe("safe Google Calendar errors", () => {
  it("maps known errors without exposing response internals", async () => {
    const error = Object.assign(new Error("FunctionsHttpError"), {
      context: json({ error: "company_context_required", secret: "must-not-appear" }, 403),
    });
    await expect(googleCalendarErrorMessage(error)).resolves.toContain("más de una empresa");
    await expect(googleCalendarErrorMessage(error)).resolves.not.toContain("must-not-appear");
  });

  it("uses the network-safe fallback", async () => {
    await expect(googleCalendarErrorMessage(new Error("fetch failed"))).resolves.toContain("comunicarnos");
  });

  it.each(["oauth_state_not_found", "oauth_state_expired", "oauth_state_already_used", "oauth_state_invalid"])(
    "maps %s to the same safe reconnect message",
    (code) => expect(googleCalendarStateErrorMessage(code)).toContain("expiró o ya fue utilizada"),
  );
});
