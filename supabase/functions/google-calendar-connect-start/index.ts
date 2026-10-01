import { authenticated, CORS_METHODS, corsPreflight, featureEnabled, integrationMode, json } from "../_shared/integration-security.ts";

Deno.serve(async (req) => {
  const preflight = corsPreflight(req, CORS_METHODS.post);
  if (preflight) return preflight;
  try {
    const { client, companyId } = await authenticated(req);
    if (!await featureEnabled(client, companyId, "google_calendar_enabled") || integrationMode("google") !== "live") {
      return json({ ok: false, error: "google_not_configured" }, 503);
    }
    return json({ ok: false, error: "google_not_configured" }, 503);
  } catch (error) {
    const code = error instanceof Error ? error.message : "request_failed";
    if (code === "unauthorized") return json({ ok: false, error: code }, 401);
    if (code === "company_membership_required" || code === "company_context_required") {
      return json({ ok: false, error: code }, 403);
    }
    return json({ ok: false, error: "oauth_error" }, 500);
  }
});
