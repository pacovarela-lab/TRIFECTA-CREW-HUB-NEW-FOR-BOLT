import { toast } from "sonner";

/**
 * Mapea errores comunes (Supabase / red / storage) a mensajes accionables en español.
 */
export function describeError(e: unknown): { title: string; description?: string } {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : (e as any)?.message ?? "";
  const status = (e as any)?.status ?? (e as any)?.statusCode;
  const code = (e as any)?.code ?? "";
  const msg = (raw || "").toLowerCase();

  if (!navigator.onLine || msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return { title: "Sin conexión", description: "Revisa tu internet e intenta de nuevo." };
  }
  if (status === 413 || msg.includes("payload too large") || msg.includes("exceeds")) {
    return { title: "Archivo muy grande", description: "Máximo 10 MB. Toma la foto de nuevo." };
  }
  if (status === 401 || msg.includes("invalid jwt") || msg.includes("not authenticated")) {
    return { title: "Sesión expirada", description: "Vuelve a iniciar sesión." };
  }
  if (status === 403 || code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) {
    return { title: "Sin permisos", description: "Tu usuario no puede hacer esta acción." };
  }
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return { title: "Demasiadas solicitudes", description: "Espera unos segundos e intenta otra vez." };
  }
  if (msg.includes("402") || msg.includes("insufficient")) {
    return { title: "Sin créditos de IA", description: "Recarga el workspace para continuar." };
  }
  if (code === "23505" || msg.includes("duplicate key")) {
    return { title: "Ya existe", description: "Hay un registro con esos datos." };
  }
  return { title: raw || "Algo salió mal", description: "Intenta de nuevo." };
}

export function toastError(e: unknown, fallback?: string) {
  const { title, description } = describeError(e);
  toast.error(fallback ?? title, description ? { description } : undefined);
}
