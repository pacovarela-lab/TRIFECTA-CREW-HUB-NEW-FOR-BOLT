import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";

const TEMPLATE = "bank-import-alert";
const DEFAULT_RECIPIENT = "hello@trifectahi.com";
const MAX_REPORT_CHARS = 4000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) ?? {};
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const runUrl = clean(payload.run_url, 500);
  const summary = clean(payload.summary, 500);
  const report = clean(payload.report, MAX_REPORT_CHARS);
  const runId = clean(payload.run_id, 100) ?? new Date().toISOString();

  try {
    const result = await sendTemplateEmail(
      TEMPLATE,
      DEFAULT_RECIPIENT,
      {
        idempotencyKey: `bank-import-alert-${runId}`,
        templateData: {
          runUrl,
          summary,
          report,
          importedAt: new Date().toISOString(),
        },
      },
    );

    if (!result.sent) return json({ ok: false, status: "skipped", reason: result.reason });
    return json({ ok: true, status: "sent" });
  } catch (error) {
    console.error("bank import alert send failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return json({ ok: false, status: "failed" }, 502);
  }
});
