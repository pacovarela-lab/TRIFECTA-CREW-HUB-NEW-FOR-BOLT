/**
 * Beta Safety — platform branding + internal-tenant boundaries.
 *
 * The product is shipped to external beta tenants under a neutral name.
 * A small set of screens are Trifecta-internal reconciliation/import tools and
 * must never be reachable (nor visible) for any other tenant.
 *
 * This module is the single source of truth: never re-declare the internal
 * company UUID or the internal route list anywhere else.
 */

export const PLATFORM_NAME = "Crew Hub";
export const PLATFORM_TAGLINE = "Field operations for contractors";
export const PLATFORM_STAGE_LABEL = "Beta";

/** Stable company id of the internal Trifecta tenant (production backend). */
export const INTERNAL_TRIFECTA_COMPANY_ID = "80b3feb0-2316-4d76-affd-60f163275d9a";

/** Routes that only the internal Trifecta tenant may see or open. */
export const INTERNAL_ONLY_ROUTES = [
  "/import",
  "/import-trifecta-os",
  "/import-v10",
  "/import-review",
  "/import-rules",
  "/import-data",
  "/bank",
  "/ledger",
  "/audit",
] as const;

export type InternalRoute = (typeof INTERNAL_ONLY_ROUTES)[number];

/**
 * True only for the internal Trifecta tenant. Fails closed: unknown/loading
 * company ids are treated as external, so internal tools stay hidden.
 */
export function isInternalTrifectaTenant(companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  return companyId.trim().toLowerCase() === INTERNAL_TRIFECTA_COMPANY_ID;
}

/** True when the given pathname belongs to the internal-only tool surface. */
export function isInternalOnlyRoute(pathname: string): boolean {
  const path = (pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  return INTERNAL_ONLY_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

/** Whether a tenant may open a given route. */
export function canAccessRoute(pathname: string, companyId: string | null | undefined): boolean {
  if (!isInternalOnlyRoute(pathname)) return true;
  return isInternalTrifectaTenant(companyId);
}

/**
 * Header identity: the tenant's own company name in front, platform behind.
 * Falls back to the platform name while the company is still loading.
 */
export function tenantIdentity(companyName: string | null | undefined) {
  const name = (companyName || "").trim();
  return {
    primary: name || PLATFORM_NAME,
    secondary: name ? PLATFORM_NAME : PLATFORM_STAGE_LABEL,
  };
}
