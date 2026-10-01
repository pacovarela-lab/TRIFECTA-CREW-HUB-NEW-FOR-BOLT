const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  company_membership_required: "No encontramos una empresa activa para tu usuario.",
  company_context_required: "Tu usuario pertenece a más de una empresa. Selecciona una empresa antes de conectar Google Calendar.",
  google_not_configured: "Google Calendar todavía no está configurado por el administrador.",
  oauth_error: "No pudimos iniciar la conexión con Google Calendar. Intenta nuevamente.",
  oauth_state_not_found: "Esta conexión de Google expiró o ya fue utilizada. Intenta conectar nuevamente.",
  oauth_state_expired: "Esta conexión de Google expiró o ya fue utilizada. Intenta conectar nuevamente.",
  oauth_state_already_used: "Esta conexión de Google expiró o ya fue utilizada. Intenta conectar nuevamente.",
  oauth_state_invalid: "Esta conexión de Google expiró o ya fue utilizada. Intenta conectar nuevamente.",
  oauth_refresh_token_missing: "Cambiaste de cuenta de Google. Vuelve a conectar y acepta los permisos para enlazar el calendario de la nueva cuenta.",
};

type FunctionError = Error & { context?: Response };

export async function googleCalendarErrorMessage(error: unknown) {
  const context = (error as FunctionError | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: string };
      if (payload.error && CALENDAR_ERROR_MESSAGES[payload.error]) return CALENDAR_ERROR_MESSAGES[payload.error];
    } catch {
      // A network or non-JSON response is intentionally mapped to a safe message below.
    }
  }
  return "No pudimos comunicarnos con el servicio de Google Calendar. Reintenta.";
}

export function googleCalendarStateErrorMessage(code: string | null) {
  return code ? CALENDAR_ERROR_MESSAGES[code] ?? null : null;
}
