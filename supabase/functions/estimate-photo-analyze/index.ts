import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ESTIMATE_PHOTO_SCHEMA_VERSION, ESTIMATE_PHOTO_SYSTEM_PROMPT, SCHEMA_FAILURE_CODES, analysisHttpStatus, analysisRunMatchesRequest, authorizeEstimatePhoto, parseGatewayJson, safeAnalysisError, shouldRetryGatewayStatus } from "../_shared/estimate-photo-contract.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const REQUEST_KEY = /^[A-Za-z0-9._:-]{16,128}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function gateway(images: string[], apiKey: string) {
  const content = [
    { type: "text", text: "Extract only information visible or reasonably inferable from these ordered estimate images. Preserve image_index and uncertainty. Return the strict estimate-photo-v1 object." },
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: ESTIMATE_PHOTO_SYSTEM_PROMPT },
            { role: "user", content },
          ],
        }),
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error("gateway_rate_limited");
        // 402/403 upstream son terminales y NO deben colapsar a 500 genérico.
        // Solo se conserva metadata segura (upstream_status); nunca keys ni body.
        if (response.status === 402 || response.status === 403) throw new Error(response.status === 402 ? "gateway_payment_required" : "gateway_access_denied");
        if (shouldRetryGatewayStatus(response.status)) throw new Error("gateway_unavailable");
        throw new Error("analysis_failed");
      }
      const payload = await response.json();
      return { extraction: parseGatewayJson(payload?.choices?.[0]?.message?.content, images.length), model: "gpt-4o", attempts: attempt };
    } catch (error) {
      const normalized = error instanceof DOMException && error.name === "AbortError" ? new Error("gateway_timeout") : error;
      const code = normalized instanceof Error ? normalized.message : "";
      // El desvío de esquema del modelo es NO determinista: un segundo intento suele devolver JSON válido.
      const retryable = ["gateway_timeout", "gateway_rate_limited", "gateway_unavailable"].includes(code)
        || (SCHEMA_FAILURE_CODES.has(code) && !["conflicting_currency_evidence", "currency_evidence_mismatch", "no_extractable_content"].includes(code));
      if (attempt === 2 || !retryable) throw normalized;
      await sleep(350 * attempt);

    } finally { clearTimeout(timer); }
  }
  throw new Error("analysis_failed");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json(401, { error: "unauthorized" });

  let body: { estimate_id?: string; request_key?: string; image_set_hash?: string };
  try { body = await request.json(); } catch { return json(400, { error: "invalid_request" }); }
  if (!UUID.test(body.estimate_id ?? "") || !REQUEST_KEY.test(body.request_key ?? "") || !HASH.test(body.image_set_hash ?? "")) return json(400, { error: "invalid_request" });

  const { data: profile } = await client.from("profiles").select("company_id").eq("id", auth.user.id).maybeSingle();
  if (!profile?.company_id) return json(403, { error: "membership_required" });
  const { data: estimate } = await client.from("estimates").select("id,company_id,status,source_type").eq("id", body.estimate_id!).maybeSingle();
  const trial = await client.rpc("my_trial_status");
  try {
    authorizeEstimatePhoto({ userId: auth.user.id, membershipCompanyId: profile.company_id, estimateCompanyId: estimate?.company_id ?? null, estimateStatus: estimate?.status ?? null, estimateSourceType: estimate?.source_type ?? null, trialState: trial.data?.[0]?.state ?? null });
  } catch (error) { return json(error instanceof Error && error.message === "trial_expired" ? 402 : 403, { error: error instanceof Error ? error.message : "estimate_forbidden" }); }

  const recentResult = await client.from("estimate_analysis_runs").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((recentResult.count ?? 0) >= 10) return json(429, { error: "rate_limited" });

  const { data: images, error: imageError } = await client.from("estimate_images").select("id,storage_path,page_number,sha256,mime_type,byte_size").eq("estimate_id", body.estimate_id!).eq("company_id", profile.company_id).order("page_number");
  if (imageError || !images || images.length < 1 || images.length > 5 || images.some((image) => image.byte_size > 10 * 1024 * 1024 || !String(image.storage_path).startsWith(`${profile.company_id}/${body.estimate_id}/`))) return json(400, { error: "invalid_images" });
  if (await sha256(images.map((image) => image.sha256).join(":")) !== body.image_set_hash) return json(400, { error: "image_set_hash_mismatch" });

  const existing = async () => {
    const byRequest = await client.from("estimate_analysis_runs").select("id,status,attempts,safe_error_code,estimate_id,image_set_hash,stage").eq("company_id", profile.company_id).eq("request_key", body.request_key!).maybeSingle();
    if (byRequest.data) {
      if (!analysisRunMatchesRequest(byRequest.data, { estimate_id: body.estimate_id!, image_set_hash: body.image_set_hash! })) throw new Error("request_key_conflict");
      return byRequest.data;
    }
    const bySet = await client.from("estimate_analysis_runs").select("id,status,attempts,safe_error_code,estimate_id,image_set_hash,stage").eq("company_id", profile.company_id).eq("estimate_id", body.estimate_id!).eq("image_set_hash", body.image_set_hash!).eq("stage", "extraction").maybeSingle();
    return bySet.data;
  };

  let runId: string;
  let prior;
  try { prior = await existing(); } catch { return json(409, { error: "request_key_conflict" }); }
  if (prior?.status === "succeeded") {
    const { data: result } = await client.from("estimates").select("id,title,status,charge_amount,estimate_items(*)").eq("id", body.estimate_id!).single();
    return json(200, { ok: true, replay: true, estimate: result });
  }
  if (prior?.status === "running") return json(409, { error: "analysis_in_progress" });
  if (prior) {
    runId = prior.id;
    const { error } = await client.from("estimate_analysis_runs").update({ status: "running", attempts: (prior.attempts ?? 0) + 1, started_at: new Date().toISOString(), completed_at: null, safe_error_code: null, safe_error_message: null }).eq("id", runId);
    if (error) return json(409, { error: "retry_not_available" });
  } else {
    const inserted = await client.from("estimate_analysis_runs").insert({ company_id: profile.company_id, estimate_id: body.estimate_id!, request_key: body.request_key!, image_set_hash: body.image_set_hash!, stage: "extraction", status: "running", schema_version: ESTIMATE_PHOTO_SCHEMA_VERSION, attempts: 1, started_at: new Date().toISOString(), created_by: auth.user.id }).select("id").single();
    if (inserted.error) {
      let raced;
      try { raced = await existing(); } catch { return json(409, { error: "request_key_conflict" }); }
      if (raced?.status === "succeeded") return json(200, { ok: true, replay: true });
      return json(409, { error: "analysis_already_exists" });
    }
    runId = inserted.data.id;
  }

  await client.from("estimates").update({ status: "analyzing" }).eq("id", body.estimate_id!);
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("analysis_failed");
    const signed = await client.storage.from("estimate-images").createSignedUrls(images.map((image) => image.storage_path), 60);
    if (signed.error || !signed.data || signed.data.some((entry) => !entry.signedUrl)) throw new Error("analysis_failed");
    const analyzed = await gateway(signed.data.map((entry) => entry.signedUrl), apiKey);
    const result = await client.rpc("persist_estimate_photo_extraction", { p_run_id: runId, p_extraction: analyzed.extraction, p_model: analyzed.model, p_attempts: analyzed.attempts });
    if (result.error) throw new Error("analysis_failed");
    return json(200, { ok: true, replay: false, estimate: result.data, extraction: analyzed.extraction });
  } catch (error) {
    const safe = safeAnalysisError(error);
    // Metadata segura para diagnóstico: solo el estado upstream, nunca keys ni body del gateway.
    const upstreamStatus = safe.code === "gateway_payment_required" ? 402 : safe.code === "gateway_access_denied" ? 403 : null;
    await client.from("estimate_analysis_runs").update({ status: "failed", completed_at: new Date().toISOString(), safe_error_code: safe.code, safe_error_message: upstreamStatus ? `upstream_status=${upstreamStatus}` : safe.message }).eq("id", runId);
    await client.from("estimates").update({ status: "draft" }).eq("id", body.estimate_id!);
    return json(analysisHttpStatus(safe.code), { error: safe.code });
  }
});
