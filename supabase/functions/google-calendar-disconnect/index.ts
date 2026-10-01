import { administrativeClient, authenticated, json } from "../_shared/integration-security.ts";

Deno.serve(async (req) => {
  try {
    const { user, companyId } = await authenticated(req);
    const admin = administrativeClient();
    const { error } = await admin.from("user_calendar_connections").delete().eq("user_id", user.id).eq("company_id", companyId);
    if (error) throw error;
    return json({ ok: true, status: "not_connected" });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "request_failed" }, 400);
  }
});
