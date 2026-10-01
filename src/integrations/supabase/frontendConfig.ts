type FrontendEnvironment = {
  readonly [key: string]: unknown;
};

export const CONFIGURATION_ERROR =
  "La configuración de conexión no está disponible. Contacta al administrador para configurar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.";

/** Public Vite configuration only; never fall back to server credentials. */
export function readFrontendConfig(env: FrontendEnvironment) {
  const read = (key: string) => (typeof env[key] === "string" ? (env[key] as string).trim() : undefined);
  const url = read("VITE_SUPABASE_URL");
  const publishableKey = read("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !publishableKey) throw new Error(CONFIGURATION_ERROR);
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
        parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
      throw new Error();
    }
    if (publishableKey.startsWith("sb_secret_")) throw new Error();
    // Legacy public anon JWTs are supported, but server-role JWTs are not.
    if (publishableKey.split(".").length === 3) {
      const payload = JSON.parse(atob(publishableKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role !== "anon") throw new Error();
    }
    return { url: parsed.origin, publishableKey };
  } catch {
    // Do not echo URLs or credentials into errors or the UI.
    throw new Error(CONFIGURATION_ERROR);
  }
}
