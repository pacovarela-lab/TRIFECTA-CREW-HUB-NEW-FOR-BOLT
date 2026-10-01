// Extracts vendor, amount, date, category and description from a receipt image/PDF
// using Lovable AI Gateway (Gemini multimodal). Auto-retries with a stronger model
// when key fields (amount/spent_on/vendor) are missing or confidence is low.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  fileDataUrl: string;
  ocrText?: string;
  knownCategories?: string[];
  knownVendors?: string[];
}

interface LineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
}

interface Parsed {
  vendor: string | null;
  amount: number | null;
  subtotal: number | null;
  tax: number | null;
  spent_on: string | null;
  category: string | null;
  description: string | null;
  payment_method: string | null;
  last4: string | null;
  line_items: LineItem[];
  confidence: number;
}

// Vendor → category fallback rules. Used when the AI doesn't return a category
// but the vendor name clearly maps to one. Matches are case/diacritics-insensitive.
const VENDOR_CATEGORY_RULES: Array<{ patterns: RegExp[]; category: string }> = [
  { patterns: [/home\s*depot/i, /lowe'?s/i, /menards/i, /ferreter/i, /truper/i, /ace\s*hardware/i, /84\s*lumber/i], category: "Materiales" },
  { patterns: [/shell/i, /chevron/i, /pemex/i, /mobil/i, /exxon/i, /bp\b/i, /arco/i, /valero/i, /76\b/i, /\bgasoline\b/i, /gasolinera/i], category: "Combustible" },
  { patterns: [/uber/i, /lyft/i, /taxi/i, /\btoll\b/i, /peaje/i, /parking/i, /estacionamiento/i], category: "Transporte" },
  { patterns: [/mcdonald/i, /burger\s*king/i, /starbucks/i, /chipotle/i, /subway/i, /restaurante/i, /\bcafe\b/i, /taqueria/i, /pizzeria/i], category: "Comida" },
  { patterns: [/harbor\s*freight/i, /\bdewalt\b/i, /milwaukee/i, /makita/i, /herramienta/i], category: "Herramientas" },
  { patterns: [/at&t/i, /verizon/i, /t-?mobile/i, /telcel/i, /movistar/i, /comcast/i, /xfinity/i, /spectrum/i], category: "Servicios" },
];

const autoCategorize = (vendor: string | null, description: string | null): string | null => {
  const haystack = `${vendor ?? ""} ${description ?? ""}`;
  if (!haystack.trim()) return null;
  for (const rule of VENDOR_CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.category;
  }
  return null;
};

const extractLast4 = (raw: any, text?: string): string | null => {
  const candidate = typeof raw?.last4 === "string" ? raw.last4 : null;
  const fromAI = candidate?.match(/\d{4}/)?.[0];
  if (fromAI) return fromAI;
  if (!text) return null;
  // Common patterns: "**** 1234", "XXXX 1234", "ending in 1234", "Acct: ****1234"
  const m = text.match(/(?:\*{2,}|x{2,}|ending\s*(?:in)?|terminada\s*en|acct\.?\s*[:#]?\s*\*{0,}|card\s*[:#]?\s*\*{0,})\s*(\d{4})\b/i);
  return m?.[1] ?? null;
};

const parseMoney = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    normalized = /,(\d{1,2})$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const pickAmountFromCandidates = (raw: any): number | null => {
  const direct = parseMoney(raw?.amount);
  if (direct) return direct;

  const candidates = [
    raw?.total,
    raw?.grand_total,
    raw?.total_paid,
    raw?.amount_due,
    raw?.balance_due,
    raw?.monto_total,
    raw?.importe_total,
    raw?.total_final,
  ];
  for (const candidate of candidates) {
    const parsed = parseMoney(candidate);
    if (parsed) return parsed;
  }

  if (Array.isArray(raw?.amount_candidates)) {
    const parsed = raw.amount_candidates
      .map((candidate: any) => parseMoney(typeof candidate === "object" ? candidate?.value : candidate))
      .filter((n: number | null): n is number => n != null)
      .sort((a: number, b: number) => b - a);
    return parsed[0] ?? null;
  }

  return null;
};

const extractLabeledAmountFromText = (text?: string): number | null => {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const label = /(grand\s+total|total\s+(due|paid|a\s+pagar|final)|amount\s+due|balance\s+due|importe\s+total|monto\s+total|\btotal\b)/i;
  const money = /[$€£]?\s*-?\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})|-?\d+(?:[,.]\d{2})/g;
  const labeled = lines
    .filter((line) => label.test(line))
    .flatMap((line) => Array.from(line.matchAll(money)).map((m) => parseMoney(m[0])).filter((n): n is number => n != null));
  if (labeled.length) return labeled.sort((a, b) => b - a)[0];
  const all = lines
    .slice(-12)
    .flatMap((line) => Array.from(line.matchAll(money)).map((m) => parseMoney(m[0])).filter((n): n is number => n != null))
    .filter((n) => n >= 0.5);
  return all.sort((a, b) => b - a)[0] ?? null;
};

const SYSTEM = `Eres un asistente experto en leer recibos, facturas y tickets en español o inglés.
Devuelve SIEMPRE solo JSON válido con esta forma:
{"vendor": string|null, "amount": number|string|null, "amount_candidates": string[], "subtotal": number|null, "tax": number|null, "spent_on": string|null, "category": string|null, "description": string|null, "payment_method": "cash"|"card"|"transfer"|"check"|"other"|null, "last4": string|null, "line_items": [{"description": string, "quantity": number|null, "unit_price": number|null, "total": number|null}], "confidence": number}

REGLAS PARA EL MONTO (CRÍTICO):
- "amount" debe ser el TOTAL FINAL pagado, no subtotal ni impuesto suelto.
- Busca etiquetas como: "TOTAL", "GRAN TOTAL", "TOTAL A PAGAR", "IMPORTE TOTAL", "MONTO TOTAL", "TOTAL DUE", "AMOUNT DUE", "BALANCE DUE", "GRAND TOTAL", "TOTAL PAID".
- Si no hay etiqueta clara, usa la cantidad mayor que aparezca cerca del final del recibo.
- Devuélvelo como número decimal SIN símbolos, sin comas como separador de miles. Ej: 1234.56.
- Si el recibo usa coma como decimal ("1.234,56"), conviértelo a punto decimal.
- NUNCA devuelvas amount=null si en el documento es visible cualquier número que pueda ser un total.

LINE ITEMS:
- Extrae cada producto/servicio del recibo con descripción, cantidad, precio unitario y total.
- Si solo hay un total general sin desglose, devuelve line_items: [].

OTROS CAMPOS:
- subtotal y tax: extráelos si son visibles, null si no.
- payment_method: detecta si menciona "EFECTIVO/CASH"=cash, "TARJETA/CREDIT/DEBIT/VISA/MC"=card, "TRANSFERENCIA"=transfer, "CHEQUE/CHECK"=check.
- last4: si pagó con tarjeta y se ven los últimos 4 dígitos (formato "**** 1234", "XXXX1234", "ending in 1234", "terminada en 1234"), devuelve solo esos 4 dígitos como string. Si no, null.
- vendor: nombre del comercio (sin sucursales ni RFC).
- spent_on: fecha en YYYY-MM-DD.
- category: etiqueta corta en español ("Materiales", "Combustible", "Comida", "Herramientas", "Transporte", "Ferretería", "Servicios"). Prefiere una de la lista conocida.
- description: resumen breve (máx 80 caracteres).
- confidence: 0..1.

Si el archivo claramente no es un recibo (foto random, captura sin datos), devuelve amount=null y confidence<0.2.`;


async function callGateway(
  model: string,
  fileDataUrl: string | null,
  ocrText: string | undefined,
  knownCategories: string[],
  knownVendors: string[],
  apiKey: string,
): Promise<Parsed> {
  const userText = `Extrae los datos de este recibo.
Categorías conocidas: ${knownCategories.join(", ") || "(ninguna)"}
Proveedores conocidos: ${knownVendors.join(", ") || "(ninguno)"}
Texto OCR del navegador si existe:
${ocrText || "(no disponible)"}`;

  const messageContent: Array<any> = [{ type: "text", text: userText }];
  if (fileDataUrl && /^data:image\/(png|jpe?g|webp);base64,/i.test(fileDataUrl)) {
    messageContent.push({ type: "image_url", image_url: { url: fileDataUrl } });
  }

  const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: messageContent,
        },
      ],
    }),
  });

  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("AI gateway error", model, aiResp.status, t);
    const err: any = new Error(`AI gateway ${aiResp.status}`);
    err.status = aiResp.status;
    throw err;
  }

  const data = await aiResp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No JSON output");
  const raw = typeof content === "string" ? JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) : content;

  const vendor = raw.vendor ?? null;
  const description = raw.description ?? null;
  const aiCategory = typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : null;
  return {
    vendor,
    amount: pickAmountFromCandidates(raw),
    subtotal: parseMoney(raw.subtotal),
    tax: parseMoney(raw.tax),
    spent_on: raw.spent_on ?? null,
    category: aiCategory ?? autoCategorize(vendor, description),
    description,
    payment_method: typeof raw.payment_method === "string" ? raw.payment_method.toLowerCase() : null,
    last4: extractLast4(raw, ocrText),
    line_items: Array.isArray(raw.line_items)
      ? raw.line_items.slice(0, 50).map((li: any) => ({
          description: String(li?.description ?? "").slice(0, 200),
          quantity: parseMoney(li?.quantity),
          unit_price: parseMoney(li?.unit_price),
          total: parseMoney(li?.total),
        })).filter((li: LineItem) => li.description)
      : [],
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
  };
}

const needsRetry = (p: Parsed) =>
  p.amount == null || p.spent_on == null || p.confidence < 0.5;

const MAX_DATA_URL_LEN = 15 * 1024 * 1024; // ~11 MB decoded
const ALLOWED_MIME = /^data:(image\/(png|jpe?g|webp|heic|heif)|application\/pdf);base64,/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const AI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!AI_KEY) throw new Error("OPENAI_API_KEY missing");

    // --- Auth: validate JWT + require company membership ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await authClient
      .from("profiles").select("company_id").eq("id", authData.user.id).maybeSingle();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "FORBIDDEN_NO_COMPANY" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.fileDataUrl || !ALLOWED_MIME.test(body.fileDataUrl)) {
      return new Response(JSON.stringify({ error: "INVALID_MIME" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.fileDataUrl.length > MAX_DATA_URL_LEN) {
      return new Response(JSON.stringify({ error: "PAYLOAD_TOO_LARGE" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const knownCategories = body.knownCategories ?? [];
    const knownVendors = body.knownVendors ?? [];

    let parsed: Parsed;
    let usedModel = "google/gemini-2.5-flash";
    try {
      parsed = await callGateway(usedModel, body.fileDataUrl, body.ocrText, knownCategories, knownVendors, AI_KEY);
    } catch (e: any) {
      if (e.status === 400 && body.ocrText) {
        console.warn("Vision failed; retrying receipt extraction with OCR text only");
        parsed = await callGateway(usedModel, null, body.ocrText, knownCategories, knownVendors, AI_KEY);
      } else {
      if (e.status === 429 || e.status === 402) {
        return new Response(
          JSON.stringify({
            error: e.status === 402
              ? "Sin créditos de IA. Contacta al administrador."
              : "Rate limit. Intenta de nuevo en un momento.",
          }),
          { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw e;
      }
    }

    // Auto-retry with stronger model if key fields are missing.
    if (needsRetry(parsed)) {
      try {
        const retryModel = "google/gemini-2.5-pro";
        console.log("Retrying with", retryModel, "first pass:", parsed);
        const retried = await callGateway(retryModel, body.fileDataUrl, body.ocrText, knownCategories, knownVendors, AI_KEY);
        // Prefer retried if it filled more fields or has higher confidence
        const score = (p: Parsed) =>
          (p.amount != null ? 2 : 0) + (p.spent_on != null ? 1 : 0) + (p.vendor != null ? 0.5 : 0) + p.confidence;
        if (score(retried) > score(parsed)) {
          parsed = retried;
          usedModel = retryModel;
        }
      } catch (e: any) {
        // If retry fails (rate/credits/etc), keep the first pass result
        console.warn("Retry failed, keeping first pass:", e?.message);
      }
    }

    const textAmount = extractLabeledAmountFromText(body.ocrText);
    if (textAmount && (parsed.amount == null || parsed.confidence < 0.5)) {
      parsed.amount = textAmount;
      parsed.confidence = Math.max(parsed.confidence, 0.62);
    }

    return new Response(JSON.stringify({ ...parsed, model: usedModel }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-receipt error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
