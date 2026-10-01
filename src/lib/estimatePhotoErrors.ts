/**
 * Traducción explícita de códigos de error del análisis de Foto de presupuesto.
 * Nunca mostramos el código técnico ni "non-2xx status code" al usuario.
 */
const MESSAGES: Record<string, string> = {
  unauthorized: "Tu sesión expiró. Inicia sesión de nuevo para continuar.",
  membership_required: "Tu usuario aún no pertenece a una compañía.",
  estimate_forbidden: "Este presupuesto no pertenece a tu compañía.",
  trial_expired: "Tu período de prueba terminó. Contacta al administrador.",
  analysis_in_progress: "Ya hay un análisis en curso para estas fotos. Espera unos segundos.",
  request_key_conflict: "Detectamos otro análisis con la misma clave. Vuelve a intentarlo.",
  analysis_already_exists: "Ya existe un análisis para estas fotos.",
  retry_not_available: "No pudimos reintentar ahora mismo. Intenta de nuevo en un momento.",
  gateway_timeout: "El análisis tardó demasiado. Reintenta con la misma foto.",
  gateway_rate_limited: "Hay mucha demanda en este momento. Espera un minuto y reintenta.",
  gateway_unavailable: "El servicio de análisis no está disponible temporalmente. Reintenta.",
  gateway_payment_required: "El servicio de análisis no está disponible en este momento. Intenta nuevamente más tarde.",
  gateway_access_denied: "El servicio de análisis no está disponible en este momento. Intenta nuevamente más tarde.",
  no_extractable_content: "No pudimos leer datos en la foto. Toma la foto más cerca, con buena luz y sin sombras.",
  malformed_ai_json: "La lectura no se pudo interpretar. Reintenta con la misma foto.",
  conflicting_currency_evidence: "La foto muestra dos monedas distintas. Aclara la moneda y vuelve a intentar.",
  currency_evidence_mismatch: "La moneda detectada no coincide con lo escrito en la foto. Revisa la foto.",
  invalid_decimal: "Algunos importes no se leyeron con claridad. Reintenta con una foto más nítida.",
  analysis_failed: "No pudimos completar el análisis. Reintenta sin volver a crear el borrador.",
};

const SCHEMA_FALLBACK = "La lectura salió incompleta. Reintenta: no se pierde el borrador ni las fotos.";

export function analysisErrorMessage(code: string | null | undefined): string {
  if (!code) return MESSAGES.analysis_failed;
  if (MESSAGES[code]) return MESSAGES[code];
  if (/^(invalid_|unreadable_)/.test(code)) return SCHEMA_FALLBACK;
  return MESSAGES.analysis_failed;
}

/** Reintentar es seguro para estos códigos (mismo borrador, mismas fotos, misma request_key). */
export function analysisErrorIsRetryable(code: string | null | undefined): boolean {
  if (!code) return true;
  return !["unauthorized", "membership_required", "estimate_forbidden", "trial_expired", "conflicting_currency_evidence", "currency_evidence_mismatch", "gateway_payment_required", "gateway_access_denied"].includes(code);
}

/** Extrae el código sanitizado del cuerpo del error de la Edge Function. */
export async function extractAnalysisErrorCode(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown } | null)?.context;
  const response = context as Response | undefined;
  if (response && typeof (response as Response).clone === "function") {
    try {
      const body = await (response as Response).clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch { /* cuerpo no JSON */ }
  }
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/[a-z_]{4,}/);
  return match && MESSAGES[match[0]] ? match[0] : null;
}
