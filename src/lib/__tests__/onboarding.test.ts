import { describe, expect, it } from "vitest";
import {
  BUSINESS_AREA_EXAMPLES,
  INITIAL_DIVISION_NAME,
  isValidCompanyName,
  normalizeAreaNames,
  preselectDivisionId,
  resolveOnboardingRoute,
} from "@/lib/onboarding";

describe("onboarding routing (A)", () => {
  it("sends an authenticated user without company to the wizard", () => {
    expect(resolveOnboardingRoute({ loading: false, companyId: null })).toBe("onboarding");
  });
  it("sends a user with company to the app", () => {
    expect(resolveOnboardingRoute({ loading: false, companyId: "c1" })).toBe("app");
  });
  it("waits while membership is loading (no navigation loops)", () => {
    expect(resolveOnboardingRoute({ loading: true, companyId: null })).toBe("loading");
  });
});

describe("company name validation (B)", () => {
  it("rejects empty or too short names", () => {
    expect(isValidCompanyName("")).toBe(false);
    expect(isValidCompanyName(" a ")).toBe(false);
  });
  it("accepts a normal name", () => {
    expect(isValidCompanyName("  Acme Services  ")).toBe(true);
  });
  it("rejects absurdly long names", () => {
    expect(isValidCompanyName("x".repeat(121))).toBe(false);
  });
});

describe("initial division (D)", () => {
  it("is named General", () => {
    expect(INITIAL_DIVISION_NAME).toBe("General");
  });
  it("is preselected when the tenant has exactly one division", () => {
    expect(preselectDivisionId([{ id: "d1" }])).toBe("d1");
  });
  it("is not preselected when there are several or none", () => {
    expect(preselectDivisionId([{ id: "d1" }, { id: "d2" }])).toBe("");
    expect(preselectDivisionId([])).toBe("");
    expect(preselectDivisionId(undefined)).toBe("");
  });
});

describe("business areas during onboarding (E, L)", () => {
  it("supports skipping (no areas persisted)", () => {
    expect(normalizeAreaNames(["", "   "])).toEqual([]);
  });
  it("trims and dedupes user-typed areas", () => {
    expect(normalizeAreaNames([" Residential ", "residential", "Service"])).toEqual([
      "Residential",
      "Service",
    ]);
  });
  it("never suggests Trifecta-specific areas", () => {
    const forbidden = ["Home Improvement", "Roofs", "Landscaping", "Junk Removal"];
    for (const name of forbidden) {
      expect(BUSINESS_AREA_EXAMPLES).not.toContain(name);
    }
  });
});
