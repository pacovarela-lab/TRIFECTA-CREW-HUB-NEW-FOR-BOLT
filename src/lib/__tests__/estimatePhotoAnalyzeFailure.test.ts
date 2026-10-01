import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analysisHttpStatus, parseGatewayJson, safeAnalysisError, sanitizeExtractionCandidate, validateEstimatePhotoExtraction } from "../../../supabase/functions/_shared/estimate-photo-contract";
import { hasChargeAmountConflict } from "../../../supabase/functions/_shared/estimate-photo-contract";
import { chargeConfirmationPending } from "@/lib/estimatePhotoReview";
import { analysisErrorIsRetryable, analysisErrorMessage, extractAnalysisErrorCode } from "@/lib/estimatePhotoErrors";

const item = (over: Record<string, unknown> = {}) => ({
  description_original: "Roof labor", description_normalized: "Roof labor", quantity: "2", unit: "hr",
  client_price: "1250.00", planned_cost: null, item_type: "labor", confidence: 0.8,
  extraction_status: "confirmed", provenance: "observed", source_text: "Roof labor", source_image_index: 1, ...over,
});
const field = (over: Record<string, unknown> = {}) => ({
  key: "charge_amount", source_text: "$8,500", normalized_text: "8500", value: "8500.00", confidence: 0.6,
  status: "uncertain", reason: null, provenance: "observed", image_index: 1, ...over,
});

describe("causa raíz: desviaciones del modelo ya no rompen el análisis", () => {
  it("mapea claves fuera del catálogo en lugar de fallar (total -> charge_amount)", () => {
    const clean = sanitizeExtractionCandidate({ schema_version: "estimate-photo-v1", currency_code: "USD", fields: [field({ key: "total" })], items: [item()], uncertainties: [], warnings: [] }, 1) as { fields: { key: string }[] };
    expect(clean.fields[0].key).toBe("charge_amount");
    expect(validateEstimatePhotoExtraction(clean, 1).schema_version).toBe("estimate-photo-v1");
  });

  it("descarta claves extra en items (reason) sin perder la partida", () => {
    const clean = sanitizeExtractionCandidate({ schema_version: "estimate-photo-v1", currency_code: "USD", fields: [field()], items: [item({ reason: "guessed" })], uncertainties: [], warnings: [] }, 1) as { items: Record<string, unknown>[] };
    expect(clean.items[0]).not.toHaveProperty("reason");
    expect(() => validateEstimatePhotoExtraction(clean, 1)).not.toThrow();
  });

  it("normaliza importes numéricos y con símbolos sin inventar valores", () => {
    const clean = sanitizeExtractionCandidate({ currency_code: "USD", fields: [], items: [item({ client_price: 1250, quantity: "2 hr", planned_cost: "$300.50" })], uncertainties: [], warnings: [] }, 1) as { items: { client_price: string; quantity: string | null; planned_cost: string }[] };
    expect(clean.items[0].client_price).toBe("1250");
    expect(clean.items[0].quantity).toBeNull();
    expect(clean.items[0].planned_cost).toBe("300.50");
  });

  it("nunca convierte lo ilegible en cero y descarta provenance recomendada", () => {
    const clean = sanitizeExtractionCandidate({ currency_code: "USD", fields: [field({ status: "unreadable", value: "0" })], items: [item({ provenance: "recommended" })], uncertainties: [], warnings: [] }, 1) as { fields: { value: null }[]; items: unknown[]; warnings: string[] };
    expect(clean.fields[0].value).toBeNull();
    expect(clean.items).toHaveLength(0);
    expect(clean.warnings.join(" ")).toContain("dropped_unrecognized_items");
  });

  it("rechaza con código propio cuando no hay nada legible", () => {
    expect(() => sanitizeExtractionCandidate({ currency_code: "USD", fields: [], items: [] }, 1)).toThrow("no_extractable_content");
    expect(safeAnalysisError(new Error("no_extractable_content")).code).toBe("no_extractable_content");
  });

  it("acepta la respuesta real que producía el 502 en producción", () => {
    const raw = JSON.stringify({ schema_version: "estimate-photo-v1", currency_code: "USD", fields: [field({ key: "client_price" }), field({ key: "total", value: 8500 })], items: [item({ reason: "handwriting" })], uncertainties: ["monto dudoso"], warnings: [] });
    expect(parseGatewayJson(raw, 1).items).toHaveLength(1);
  });
});

describe("estado HTTP exacto por código", () => {
  it.each([["gateway_rate_limited", 429], ["gateway_timeout", 504], ["gateway_unavailable", 502], ["invalid_field_value", 422], ["no_extractable_content", 422], ["analysis_failed", 500]])("%s -> %i", (code, status) => expect(analysisHttpStatus(code as string)).toBe(status));
});

describe("mensajes en español y reintento", () => {
  it("nunca muestra el código técnico", () => {
    for (const code of ["invalid_field_value", "no_extractable_content", "gateway_timeout", "analysis_failed", "desconocido"]) {
      const message = analysisErrorMessage(code);
      expect(message).not.toContain(code);
      expect(message).not.toMatch(/non-2xx|Edge Function/i);
    }
  });
  it("permite reintentar fallos técnicos y no los que requieren decisión humana", () => {
    expect(analysisErrorIsRetryable("invalid_field_value")).toBe(true);
    expect(analysisErrorIsRetryable("gateway_timeout")).toBe(true);
    expect(analysisErrorIsRetryable("conflicting_currency_evidence")).toBe(false);
    expect(analysisErrorIsRetryable("trial_expired")).toBe(false);
  });
  it("extrae el código sanitizado del cuerpo de la Edge Function", async () => {
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: new Response(JSON.stringify({ error: "no_extractable_content" }), { status: 422 }) });
    expect(await extractAnalysisErrorCode(error)).toBe("no_extractable_content");
  });
});

describe("reintento idempotente en el servidor", () => {
  const source = readFileSync(resolve(process.cwd(), "supabase/functions/estimate-photo-analyze/index.ts"), "utf8");
  it("reutiliza el run fallido en lugar de crear otro", () => expect(source).toContain('status: "running", attempts: (prior.attempts ?? 0) + 1'));
  it("reintenta una vez la desviación de esquema del modelo", () => expect(source).toContain("SCHEMA_FAILURE_CODES.has(code)"));
  it("devuelve el estado HTTP exacto", () => expect(source).toContain("analysisHttpStatus(safe.code)"));
});

describe("editar nunca confirma (nivel presupuesto)", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/estimates/EstimatePhotoReview.tsx"), "utf8");
  it("el título y el precio limpian la confirmación al editar", () => {
    expect(source).toContain('editEstimateField({ title: event.target.value }, "title")');
    expect(source).toContain('}, "charge_amount")');
    expect(source).not.toMatch(/onChange=\{\(event\) => updateEstimateField\(/);
  });
  it("updateEstimateField solo se usa para confirmar explícitamente", () => {
    expect(source).toContain("updateEstimateField({}, field)");
  });
});

describe("auditoría final: total global vs precio de partida", () => {
  const base = (fields: unknown[], items: unknown[]) =>
    sanitizeExtractionCandidate({ schema_version: "estimate-photo-v1", currency_code: "USD", fields, items, uncertainties: [], warnings: [] }, 1) as {
      fields: { key: string; value: string | null }[];
      items: { client_price: string | null }[];
      warnings: string[];
    };

  it("C. total global 6785 gana sobre client_price de partida 600", () => {
    const clean = base(
      [field({ key: "client_price", value: "600", source_text: "600", normalized_text: "600" }), field({ key: "total", value: "6785", source_text: "$6,785", normalized_text: "6785" })],
      [item({ client_price: "600", source_text: "600" })],
    );
    const charge = clean.fields.filter((f) => f.key === "charge_amount");
    expect(charge).toHaveLength(1);
    expect(charge[0].value).toBe("6785");
    expect(clean.items[0].client_price).toBe("600");
  });

  it("A. client_price/price/subtotal ya no son aliases globales", () => {
    for (const key of ["client_price", "price", "subtotal", "foo"]) {
      const clean = base([field({ key, value: "600" })], [item()]);
      expect(clean.fields.filter((f) => f.key === "charge_amount")).toHaveLength(0);
      expect(clean.warnings.some((w) => w.startsWith("dropped_unrecognized_fields"))).toBe(true);
    }
  });

  it("A. dos aliases globales dejan solo el de mayor precedencia con warning", () => {
    const clean = base([field({ key: "charge", value: "100" }), field({ key: "total", value: "6785" })], [item()]);
    expect(clean.fields.filter((f) => f.key === "charge_amount").map((f) => f.value)).toEqual(["6785"]);
    expect(clean.warnings).toContain("dropped_duplicate_charge_amount:1");
  });

  it("D/E. normalización decimal controlada; lo ambiguo queda en null", () => {
    const cases: [string, string | null][] = [
      ["6785", "6785"], ["$6,785", "6785"], ["6,785.00", "6785.00"], ["6785 dlls", "6785"], ["USD 6785", "6785"],
      ["6.785", null], ["6,7O5", null], ["aprox 6800?", null], ["", null],
    ];
    for (const [input, expected] of cases) {
      const clean = base([field({ key: "total", value: input })], [item()]);
      expect(clean.fields.filter((f) => f.key === "charge_amount")[0]?.value ?? null).toBe(expected);
    }
  });

  it("F. no_extractable_content no se reintenta (política de retry)", () => {
    const retryable = (code: string) =>
      ["gateway_timeout", "gateway_rate_limited", "gateway_unavailable"].includes(code)
      || (analysisHttpStatus(code) === 422 && !["conflicting_currency_evidence", "currency_evidence_mismatch", "no_extractable_content"].includes(code));
    expect(retryable("no_extractable_content")).toBe(false);
    expect(retryable("invalid_field_value")).toBe(true);
  });
});

describe("hardening final: totales globales conflictivos", () => {
  const clean = (fields: unknown[]) =>
    sanitizeExtractionCandidate({ schema_version: "estimate-photo-v1", currency_code: "USD", fields, items: [item()], uncertainties: [], warnings: [] }, 1) as {
      fields: { key: string; value: string | null; status: string }[];
      items: { client_price: string | null }[];
      warnings: string[];
    };

  it("total=6785 + grand_total=6785 => 6785 sin conflicto", () => {
    const out = clean([field({ key: "total", value: "6785", status: "confirmed" }), field({ key: "grand_total", value: "6785", status: "confirmed" })]);
    const charge = out.fields.filter((f) => f.key === "charge_amount");
    expect(charge).toHaveLength(1);
    expect(charge[0].value).toBe("6785");
    expect(charge[0].status).not.toBe("uncertain");
    expect(hasChargeAmountConflict(out.warnings)).toBe(false);
  });

  it("total=6785 + grand_total=6485 => provisional 6785 + uncertain + aprobación bloqueada", () => {
    const out = clean([field({ key: "total", value: "6785", status: "confirmed" }), field({ key: "grand_total", value: "6485", status: "confirmed" })]);
    const charge = out.fields.filter((f) => f.key === "charge_amount");
    expect(charge).toHaveLength(1);
    expect(charge[0].value).toBe("6785");
    expect(charge[0].status).toBe("uncertain");
    expect(hasChargeAmountConflict(out.warnings)).toBe(true);
    expect(out.warnings.join(" ")).not.toContain("6485");
    const estimate = { id: "e", title: "t", charge_amount: 6785, status: "reviewed", human_confirmed_fields: [] } as never;
    expect(chargeConfirmationPending(estimate, out.warnings)).toBe(true);
    expect(chargeConfirmationPending({ ...(estimate as object), human_confirmed_fields: ["charge_amount"] } as never, out.warnings)).toBe(false);
  });

  it("total=6785 + item.client_price=600 => total global gana y la partida conserva 600", () => {
    const out = clean([field({ key: "total", value: "6785" })]);
    expect(out.fields.filter((f) => f.key === "charge_amount")[0].value).toBe("6785");
    expect(out.items[0].client_price).toBe("1250.00");
  });

  it("charge_amount canónico ilegible no borra el total legible del alias", () => {
    const out = clean([field({ key: "charge_amount", value: null, status: "unreadable" }), field({ key: "total", value: "6785", status: "confirmed" })]);
    const charge = out.fields.filter((f) => f.key === "charge_amount");
    expect(charge).toHaveLength(1);
    expect(charge[0].value).toBe("6785");
    expect(hasChargeAmountConflict(out.warnings)).toBe(false);
  });

  it("charge_amount canónico con valor no normalizable cede ante el alias legible", () => {
    const out = clean([field({ key: "charge_amount", value: "aprox 6800?" }), field({ key: "grand_total", value: "6785" })]);
    expect(out.fields.filter((f) => f.key === "charge_amount")[0].value).toBe("6785");
  });

  it("si ningún candidato es legible se conserva el canónico en null", () => {
    const out = clean([field({ key: "charge_amount", value: "6.785" }), field({ key: "total", value: "6,7O5" })]);
    const charge = out.fields.filter((f) => f.key === "charge_amount");
    expect(charge).toHaveLength(1);
    expect(charge[0].value).toBeNull();
  });
});

describe("hardening final: aliases no monetarios restringidos", () => {
  const keys = (raw: string) =>
    (sanitizeExtractionCandidate({ currency_code: "USD", fields: [field({ key: raw, value: "x" })], items: [item()], uncertainties: [], warnings: [] }, 1) as { fields: { key: string }[] }).fields.map((f) => f.key);

  it('name="Bathroom remodel" no produce client_observed', () => expect(keys("name")).not.toContain("client_observed"));
  it('description="Paint walls" no produce title global', () => expect(keys("description")).not.toContain("title"));
  it("aliases específicos siguen funcionando", () => {
    for (const raw of ["client", "customer", "client_name"]) expect(keys(raw)).toContain("client_observed");
    for (const raw of ["job", "project", "job_title"]) expect(keys(raw)).toContain("title");
  });
});

describe("hardening final: gateway 402/403", () => {
  it("no colapsa a 500 y conserva estado exacto", () => {
    expect(analysisHttpStatus("gateway_payment_required")).toBe(402);
    expect(analysisHttpStatus("gateway_access_denied")).toBe(403);
    expect(safeAnalysisError(new Error("gateway_payment_required")).code).toBe("gateway_payment_required");
    expect(safeAnalysisError(new Error("gateway_access_denied")).code).toBe("gateway_access_denied");
  });
  it("mensaje interno en español sin detalle técnico y sin reintento", () => {
    for (const code of ["gateway_payment_required", "gateway_access_denied"]) {
      const message = analysisErrorMessage(code);
      expect(message).toBe("El servicio de análisis no está disponible en este momento. Intenta nuevamente más tarde.");
      expect(analysisErrorIsRetryable(code)).toBe(false);
    }
  });
  it("la función solo registra upstream_status, nunca el body", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/functions/estimate-photo-analyze/index.ts"), "utf8");
    expect(source).toContain("`upstream_status=${upstreamStatus}`");
    expect(source).not.toMatch(/console\.(log|warn|error)/);
  });
});
