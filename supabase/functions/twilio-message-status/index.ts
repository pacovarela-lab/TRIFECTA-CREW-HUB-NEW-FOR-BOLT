import { json } from "../_shared/integration-security.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  return json({ ok: false, error: "sms_configuration_pending" }, 503);
});
