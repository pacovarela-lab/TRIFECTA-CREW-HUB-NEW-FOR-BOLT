import { authenticated, integrationMode, json } from "../_shared/integration-security.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    await authenticated(req);
    const { phone } = await req.json();
    if (typeof phone !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(phone)) return json({ ok:false,error:"invalid_e164" },400);
    if (integrationMode("sms") !== "live") return json({ ok:false,error:"sms_configuration_pending" },503);
    return json({ ok:false,error:"sms_configuration_pending" },503);
  } catch { return json({ok:false,error:"unauthorized"},401); }
});
