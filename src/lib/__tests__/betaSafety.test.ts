import { describe, expect, it } from "vitest";
import {
  INTERNAL_ONLY_ROUTES,
  INTERNAL_TRIFECTA_COMPANY_ID,
  PLATFORM_NAME,
  PLATFORM_STAGE_LABEL,
  canAccessRoute,
  isInternalOnlyRoute,
  isInternalTrifectaTenant,
  tenantIdentity,
} from "@/lib/tenant";
import { buildFeedbackContext, formatFeedbackContext } from "@/lib/feedback";

const EXTERNAL = "c924d79e-2318-4f45-81db-06a3b276e941";

describe("branding", () => {
  it("uses a neutral platform name and beta label", () => {
    expect(PLATFORM_NAME).toBe("Crew Hub");
    expect(PLATFORM_STAGE_LABEL).toBe("Beta");
    expect(PLATFORM_NAME.toLowerCase()).not.toContain("trifecta");
  });

  it("shows the tenant company in front of the platform name", () => {
    expect(tenantIdentity("Acme Electric")).toEqual({ primary: "Acme Electric", secondary: "Crew Hub" });
    expect(tenantIdentity("Trifecta Home Improvement").primary).toBe("Trifecta Home Improvement");
  });

  it("falls back to neutral branding when no company is known", () => {
    expect(tenantIdentity(null)).toEqual({ primary: "Crew Hub", secondary: "Beta" });
    expect(tenantIdentity("   ").primary).toBe("Crew Hub");
  });
});

describe("internal tenant detection", () => {
  it("recognises only the stable Trifecta company id", () => {
    expect(isInternalTrifectaTenant(INTERNAL_TRIFECTA_COMPANY_ID)).toBe(true);
    expect(isInternalTrifectaTenant(INTERNAL_TRIFECTA_COMPANY_ID.toUpperCase())).toBe(true);
    expect(isInternalTrifectaTenant(EXTERNAL)).toBe(false);
  });

  it("fails closed for null/empty company ids", () => {
    expect(isInternalTrifectaTenant(null)).toBe(false);
    expect(isInternalTrifectaTenant(undefined)).toBe(false);
    expect(isInternalTrifectaTenant("")).toBe(false);
  });
});

describe("internal route guard", () => {
  it("flags every internal tool route", () => {
    for (const route of INTERNAL_ONLY_ROUTES) expect(isInternalOnlyRoute(route)).toBe(true);
    expect(isInternalOnlyRoute("/import-review/abc-123")).toBe(true);
    expect(isInternalOnlyRoute("/bank/")).toBe(true);
  });

  it("leaves shared product routes open", () => {
    for (const route of ["/", "/projects", "/tasks", "/expenses", "/payments", "/workers", "/reports", "/settings"]) {
      expect(isInternalOnlyRoute(route)).toBe(false);
      expect(canAccessRoute(route, EXTERNAL)).toBe(true);
    }
  });

  it("blocks /import for external tenants and allows the internal Trifecta tenant", () => {
    expect(isInternalOnlyRoute("/import")).toBe(true);
    expect(canAccessRoute("/import", EXTERNAL)).toBe(false);
    expect(canAccessRoute("/import", INTERNAL_TRIFECTA_COMPANY_ID)).toBe(true);
  });

  it("blocks external tenants from internal routes, allows Trifecta", () => {
    for (const route of INTERNAL_ONLY_ROUTES) {
      expect(canAccessRoute(route, EXTERNAL)).toBe(false);
      expect(canAccessRoute(route, null)).toBe(false);
      expect(canAccessRoute(route, INTERNAL_TRIFECTA_COMPANY_ID)).toBe(true);
    }
  });
});

describe("beta feedback context", () => {
  it("captures only safe diagnostics", () => {
    const context = buildFeedbackContext({
      userId: "user-1",
      companyId: EXTERNAL,
      route: "/projects?new=1",
      userAgent: "Mozilla/5.0 (iPhone)",
      appVersion: "abc1234",
      now: new Date("2026-08-26T00:00:00.000Z"),
    });
    expect(context).toEqual({
      userId: "user-1",
      companyId: EXTERNAL,
      route: "/projects",
      timestamp: "2026-08-26T00:00:00.000Z",
      appVersion: "abc1234",
      userAgent: "Mozilla/5.0 (iPhone)",
    });
  });

  it("truncates the user agent and never emits secret-looking fields", () => {
    const context = buildFeedbackContext({
      userId: "u",
      companyId: "c",
      route: "/",
      userAgent: "x".repeat(500),
    });
    expect(context.userAgent.length).toBe(180);
    const rendered = formatFeedbackContext(context);
    for (const banned of ["password", "token", "secret", "authorization", "apikey"]) {
      expect(rendered.toLowerCase()).not.toContain(banned);
    }
    expect(rendered).toContain("route: /");
  });
});
