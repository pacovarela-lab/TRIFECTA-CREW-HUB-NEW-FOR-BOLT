// Transcribes one audio clip and proposes one expense. It never writes application data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CatalogItem = Record<string, string | null | undefined>;
interface Body {
  audioDataUrl: string;
  catalogs?: {
    projects?: CatalogItem[];
    workers?: CatalogItem[];
    vendors?: CatalogItem[];
    categories?: CatalogItem[];
    payment_methods?: CatalogItem[];
  };
}

const SYSTEM = `Eres un extractor de UN gasto de construcción dictado por voz. Entiendes español, inglés y Spanglish, números hablados, nombres propios, códigos de proyecto y vocabulario de obra.

Devuelve exclusivamente JSON válido con esta forma exacta:
{
  "transcript": string,
  "language": "es"|"en"|"mixed"|null,
  "vendor": {"raw": string|null, "normalized": string|null, "confidence": number},
  "amount": {"value": number|null, "currency": string|null, "confidence": number},
  "project": {"raw": string|null, "matched_id": string|null, "matched_code": string|null, "matched_name": string|null, "confidence": number, "alternatives": [{"id": string, "code": string|null, "name": string, "confidence": number}]},
  "category": {"raw": string|null, "matched_id": string|null, "matched_name": string|null, "confidence": number},
  "subcategory": {"raw": string|null, "matched_name": string|null, "confidence": number},
  "paid_by": {"raw": string|null, "matched_worker_id": string|null, "matched_name": string|null, "confidence": number},
  "payment_method": {"raw": string|null, "matched_value": string|null, "confidence": number},
  "description": {"value": string|null, "confidence": number},
  "date": {"value": string|null, "confidence": number},
  "needs_review": string[],
  "warnings": string[]
}

Reglas obligatorias:
- No inventes datos. Todo dato ausente es null y confianza 0.
- Todas las confianzas están entre 0 y 1. Menos de 0.98 entra en needs_review.
- La fecha solo se incluye si fue dicha o inferida inequívocamente desde "hoy"/"ayer"; formato YYYY-MM-DD.
- Solo usa matched_id, matched_worker_id o matched_value si existe exactamente en los catálogos enviados.
- Una coincidencia débil o ambigua no es definitiva: matched_* null y hasta 3 alternatives.
- normalized y matched_name deben usar el nombre canónico del catálogo; nunca crees entidades.
- Conserva literalmente la transcripción, sin corregir nombres silenciosamente.
- payment_method puede considerar tanto el tipo como el nombre de tarjeta/persona de la lista disponible.
- Responde un solo gasto. Si el audio contiene varios, usa warnings y needs_review, sin combinarlos arbitrariamente.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const textOrNull = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const score = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const validId = (value: unknown, items: CatalogItem[] = [], key = "id") => {
  const candidate = textOrNull(value);
  return candidate && items.some((item) => item[key] === candidate) ? candidate : null;
};

function sanitize(raw: any, catalogs: NonNullable<Body["catalogs"]>) {
  if (!raw || typeof raw !== "object" || !textOrNull(raw.transcript)) {
    throw new Error("INVALID_STRUCTURED_RESPONSE");
  }
  const projects = catalogs.projects ?? [];
  const workers = catalogs.workers ?? [];
  const categories = catalogs.categories ?? [];
  const methods = catalogs.payment_methods ?? [];
  const projectId = validId(raw.project?.matched_id, projects);
  const project = projects.find((item) => item.id === projectId);
  const workerId = validId(raw.paid_by?.matched_worker_id, workers);
  const worker = workers.find((item) => item.id === workerId);
  const categoryId = validId(raw.category?.matched_id, categories);
  const category = categories.find((item) => item.id === categoryId);
  const methodValue = validId(raw.payment_method?.matched_value, methods, "value");
  const alternatives = Array.isArray(raw.project?.alternatives)
    ? raw.project.alternatives
      .map((item: any) => {
        const id = validId(item?.id, projects);
        const match = projects.find((candidate) => candidate.id === id);
        return id && match ? { id, code: textOrNull(match.code), name: String(match.name), confidence: score(item.confidence) } : null;
      })
      .filter(Boolean)
      .slice(0, 3)
    : [];
  const language = ["es", "en", "mixed"].includes(raw.language) ? raw.language : null;
  const amount = typeof raw.amount?.value === "number" && raw.amount.value > 0 ? raw.amount.value : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date?.value ?? "") ? raw.date.value : null;
  const needsReview = new Set(Array.isArray(raw.needs_review) ? raw.needs_review.filter((item: unknown) => typeof item === "string") : []);
  const confidences: Array<[string, number]> = [
    ["vendor", score(raw.vendor?.confidence)], ["amount", score(raw.amount?.confidence)],
    ["project", score(raw.project?.confidence)], ["category", score(raw.category?.confidence)],
    ["subcategory", score(raw.subcategory?.confidence)], ["paid_by", score(raw.paid_by?.confidence)],
    ["payment_method", score(raw.payment_method?.confidence)], ["description", score(raw.description?.confidence)],
    ["date", score(raw.date?.confidence)],
  ];
  confidences.forEach(([field, confidence]) => { if (confidence < 0.98) needsReview.add(field); });
  if (!amount) needsReview.add("amount");
  if (!projectId) needsReview.add("project");

  return {
    transcript: String(raw.transcript).trim(),
    language,
    vendor: {
      raw: textOrNull(raw.vendor?.raw),
      normalized: textOrNull(raw.vendor?.normalized),
      confidence: score(raw.vendor?.confidence),
    },
    amount: { value: amount, currency: textOrNull(raw.amount?.currency), confidence: score(raw.amount?.confidence) },
    project: {
      raw: textOrNull(raw.project?.raw),
      matched_id: projectId,
      matched_code: project ? textOrNull(project.code) : null,
      matched_name: project ? textOrNull(project.name) : null,
      confidence: projectId ? score(raw.project?.confidence) : 0,
      alternatives,
    },
    category: {
      raw: textOrNull(raw.category?.raw),
      matched_id: categoryId,
      matched_name: category ? textOrNull(category.name) : null,
      confidence: categoryId ? score(raw.category?.confidence) : 0,
    },
    subcategory: {
      raw: textOrNull(raw.subcategory?.raw),
      matched_name: textOrNull(raw.subcategory?.matched_name),
      confidence: score(raw.subcategory?.confidence),
    },
    paid_by: {
      raw: textOrNull(raw.paid_by?.raw),
      matched_worker_id: workerId,
      matched_name: worker ? textOrNull(worker.name) : null,
      confidence: workerId ? score(raw.paid_by?.confidence) : 0,
    },
    payment_method: {
      raw: textOrNull(raw.payment_method?.raw),
      matched_value: methodValue,
      confidence: methodValue ? score(raw.payment_method?.confidence) : 0,
    },
    description: { value: textOrNull(raw.description?.value), confidence: score(raw.description?.confidence) },
    date: { value: date, confidence: date ? score(raw.date?.confidence) : 0 },
    needs_review: [...needsReview],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((item: unknown) => typeof item === "string").slice(0, 10) : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const aiKey = Deno.env.get("OPENAI_API_KEY");
    if (!aiKey) return json({ error: "VOICE_SERVICE_UNAVAILABLE" }, 503);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "UNAUTHORIZED" }, 401);
    // Require caller to be a member of some company (blocks orphan accounts from consuming AI credits).
    const { data: profile } = await authClient
      .from("profiles").select("company_id").eq("id", authData.user.id).maybeSingle();
    if (!profile?.company_id) return json({ error: "FORBIDDEN_NO_COMPANY" }, 403);

    const body = await req.json() as Body;
    if (!body.audioDataUrl || !/^data:audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|mp3);base64,/i.test(body.audioDataUrl)) {
      return json({ error: "INVALID_AUDIO_MIME" }, 400);
    }
    if (body.audioDataUrl.length > 20_000_000) {
      return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
    }

    const catalogs = body.catalogs ?? {};
    const context = JSON.stringify({
      today: new Date().toISOString().slice(0, 10),
      projects: (catalogs.projects ?? []).slice(0, 500),
      workers: (catalogs.workers ?? []).slice(0, 300),
      vendors: (catalogs.vendors ?? []).slice(0, 500),
      categories: (catalogs.categories ?? []).slice(0, 200),
      payment_methods: (catalogs.payment_methods ?? []).slice(0, 100),
    });
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: `Catálogos permitidos y fecha actual: ${context}` },
              { type: "image_url", image_url: { url: body.audioDataUrl } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      // No registrar cuerpo, audio ni transcripción: solo el código seguro.
      console.error("voice_gateway_status", response.status);
      if (response.status === 429) return json({ error: "RATE_LIMIT" }, 429);
      if (response.status === 401 || response.status === 403) return json({ error: "VOICE_SERVICE_AUTH" }, 502);
      return json({ error: "VOICE_GATEWAY_FAILED" }, 502);
    }
    const gateway = await response.json();
    const content = gateway.choices?.[0]?.message?.content;
    if (!content) return json({ error: "INVALID_STRUCTURED_RESPONSE" }, 502);
    const raw = typeof content === "string"
      ? JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""))
      : content;
    return json(sanitize(raw, catalogs));
  } catch (error) {
    console.error("voice_expense_error_code", error instanceof SyntaxError ? "INVALID_JSON" : "UNEXPECTED");
    return json({ error: error instanceof SyntaxError ? "INVALID_STRUCTURED_RESPONSE" : "VOICE_PROCESSING_FAILED" }, 500);
  }
});
