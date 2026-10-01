import { authenticated, integrationMode, json } from "../_shared/integration-security.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    await authenticated(req);
    const { code } = await req.json();
    if (!/^\d{4,10}$/.test(String(code ?? ""))) return json({ok:false,error:"invalid_code"},400);
    if (integrationMode("sms") !== "live") return json({ok:false,error:"sms_configuration_pending"},503);
    return json({ok:false,error:"sms_configuration_pending"},503);
  } catch (e) { console.error("phone_check_unauthorized", (e as Error)?.message ?? "unknown"); return json({ok:false,error:"unauthorized"},401); }
});
