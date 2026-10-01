/**
 * Pure helpers for self-service tenant onboarding.
 * Kept free of React/Supabase so they can be unit tested in isolation.
 */

export const INITIAL_DIVISION_NAME = "General";
export const INITIAL_DIVISION_SLUG = "general";

/** Generic, non-industry-specific examples shown in the wizard (never auto-persisted). */
export const BUSINESS_AREA_EXAMPLES = ["Pintura", "Plomería", "Electricidad", "Handyman", "Roofing", "Otro"];

export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "Europe/Madrid",
  "UTC",
];

export const DEFAULT_TIMEZONE = "America/New_York";

export const detectTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

export const isValidCompanyName = (name: string): boolean => {
  const clean = name.trim();
  return clean.length >= 2 && clean.length <= 120;
};

export type OnboardingRoute = "loading" | "onboarding" | "app";

/**
 * Decides where an authenticated user should land.
 * A user without a company must always reach the onboarding wizard,
 * never an empty app shell.
 */
export const resolveOnboardingRoute = (state: {
  loading: boolean;
  companyId: string | null;
}): OnboardingRoute => {
  if (state.loading) return "loading";
  return state.companyId ? "app" : "onboarding";
};

/** Preselect the division when the tenant has exactly one active option. */
export const preselectDivisionId = (divisions: { id: string }[] | undefined): string => {
  if (!divisions || divisions.length !== 1) return "";
  return divisions[0].id;
};

/** Normalizes user-typed business area names: trims, dedupes (case-insensitive), drops empties. */
export const normalizeAreaNames = (names: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
};
