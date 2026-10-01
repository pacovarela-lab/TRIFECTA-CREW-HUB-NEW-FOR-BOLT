import { authenticated, json } from "../_shared/integration-security.ts";
Deno.serve(async (req) => {
  try { const { client, companyId }=await authenticated(req); const {count}=await client.from("notification_outbox").select("id",{count:"exact",head:true}).eq("company_id",companyId).eq("type","TASK_REMINDER_SMS").in("status",["pending","retry"]).lte("scheduled_for",new Date().toISOString()); return json({ok:true,due:count??0}); }
  catch { return json({ok:false,error:"unauthorized"},401); }
});
