import { authenticated, CORS_METHODS, corsPreflight, integrationMode, json } from "../_shared/integration-security.ts";

Deno.serve(async (req) => {
  const preflight = corsPreflight(req, CORS_METHODS.post);
  if (preflight) return preflight;
  try {
    const { user, companyId } = await authenticated(req);
    if (integrationMode("google") !== "live") return json({ ok: false, error: "google_calendar_configuration_pending" }, 503);
    return json({ ok: true, connection: { status: "not_connected" }, calendars: [] });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "request_failed" }, 400);
  }
});
