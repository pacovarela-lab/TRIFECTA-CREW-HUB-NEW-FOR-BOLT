import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";
import {
  buildIdempotencyKey,
  decideSendAction,
  FEEDBACK_ALERT_FROM,
  FEEDBACK_ALERT_RECIPIENT,
  FEEDBACK_ALERT_REPLY_TO,
  FEEDBACK_ALERT_TEMPLATE,
  safeErrorMessage,
  sanitizeSnippet,
  type AttemptRow,
} from "./alert.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let submissionId: string | null = null;
  try {
    const body = await req.json();
    const candidate = body?.submission_id ?? body?.feedback_id;
    if (typeof candidate === "string" && UUID_RE.test(candidate)) submissionId = candidate;
  } catch {
    submissionId = null;
  }
  if (!submissionId) return json({ error: "invalid_submission_id" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const idempotencyKey = buildIdempotencyKey(submissionId);

  // Fail-closed: the attempt row is created server-side by the DB trigger only.
  const { data: attempt } = await supabase
    .from("email_send_attempts")
    .select("id,status,attempts,idempotency_key")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  const decision = decideSendAction(attempt as AttemptRow | null);
  if (decision === "not_found") return json({ error: "not_found" }, 404);
  if (decision === "already_sent") return json({ ok: true, skipped: "already_sent" });

  const row = attempt as AttemptRow;

  // Reconstruct the content strictly from the backend.
  const { data: feedback } = await supabase
    .from("product_feedback")
    .select("id,company_id,user_id,comments,route,priority,severity,created_at,submission_id")
    .or(`submission_id.eq.${submissionId},id.eq.${submissionId}`)
    .maybeSingle();

  if (!feedback) return json({ error: "feedback_not_found" }, 404);

  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", feedback.company_id).maybeSingle(),
    supabase.from("profiles").select("email").eq("id", feedback.user_id).maybeSingle(),
  ]);

  const attempts = (row.attempts ?? 0) + 1;

  try {
    const result = await sendTemplateEmail(FEEDBACK_ALERT_TEMPLATE, FEEDBACK_ALERT_RECIPIENT, {
      idempotencyKey,
      replyTo: FEEDBACK_ALERT_REPLY_TO,
      from: FEEDBACK_ALERT_FROM,
      templateData: {
        companyName: company?.name ?? "(unknown company)",
        userEmail: profile?.email ?? "(unknown user)",
        createdAt: feedback.created_at ?? new Date().toISOString(),
        route: feedback.route ?? "(not captured)",
        priority: feedback.priority ?? "medium",
        severity: feedback.severity ?? "(not set)",
        comment: sanitizeSnippet(feedback.comments),
      },
    });

    if (!result.sent) {
      await supabase
        .from("email_send_attempts")
        .update({ status: "failed", attempts, error_code: result.reason, error_message: null })
        .eq("id", row.id);
      return json({ ok: false, status: "failed", reason: result.reason }, 200);
    }

    await supabase
      .from("email_send_attempts")
      .update({
        status: "sent",
        attempts,
        error_code: null,
        error_message: null,
      })
      .eq("id", row.id);

    return json({ ok: true, status: "sent" });
  } catch (error) {
    await supabase
      .from("email_send_attempts")
      .update({
        status: "failed",
        attempts,
        error_code: "send_failed",
        error_message: safeErrorMessage(error),
      })
      .eq("id", row.id);

    console.error("feedback alert send failed", { idempotencyKey, message: safeErrorMessage(error) });
    return json({ ok: false, status: "failed" }, 502);
  }
});
