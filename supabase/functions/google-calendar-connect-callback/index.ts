import { CORS_METHODS, corsHeaders, corsPreflight, integrationMode, json } from "../_shared/integration-security.ts";

Deno.serve(async (req) => {
  const preflight = corsPreflight(req, CORS_METHODS.get);
  if (preflight) return preflight;
  if (integrationMode("google") !== "live") return json({ ok: false, error: "google_not_configured" }, 503, CORS_METHODS.get);
  return json({ ok: false, error: "google_not_configured" }, 503, CORS_METHODS.get);
});
