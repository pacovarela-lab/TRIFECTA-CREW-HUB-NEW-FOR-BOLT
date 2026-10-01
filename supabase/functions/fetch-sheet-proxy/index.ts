// Downloads a Google Sheets xlsx export server-side and returns it as base64.
// Requires an authenticated caller. Only accepts Google Sheets URLs, enforces
// an HTTPS hostname allowlist, follows redirects manually with the same host +
// IP checks, and blocks private / link-local / cloud-metadata destinations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HOST_ALLOWLIST = [
  "docs.google.com",
  "drive.google.com",
  "sheets.google.com",
  "accounts.google.com",
];
// Google redirects the export URL through this signed subdomain family.
const HOST_ALLOWLIST_SUFFIXES = [".googleusercontent.com", ".google.com"];

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function isPrivateIp(host: string): boolean {
  // IPv4 literal
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true; // loopback
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 (metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  // IPv6 literal
  if (host.startsWith("[") || host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
    return false;
  }
  return false;
}

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (HOST_ALLOWLIST.includes(h)) return true;
  return HOST_ALLOWLIST_SUFFIXES.some((s) => h.endsWith(s)) && !h.includes("..");
}

async function safeUrlOk(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, reason: "invalid_url" }; }
  if (url.protocol !== "https:") return { ok: false, reason: "https_required" };
  const host = url.hostname;
  if (isPrivateIp(host)) return { ok: false, reason: "blocked_host" };
  if (!hostAllowed(host)) return { ok: false, reason: "host_not_allowed" };
  // Best-effort DNS check via Google DoH (blocks DNS rebinding to private IPs
  // for hostnames that pass the string allowlist).
  try {
    const dohRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    });
    if (dohRes.ok) {
      const dns = await dohRes.json();
      const answers: Array<{ type: number; data: string }> = dns.Answer ?? [];
      const ips = answers.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
      if (ips.some((ip) => isPrivateIp(ip))) return { ok: false, reason: "blocked_resolved_ip" };
    }
  } catch { /* DoH best-effort */ }
  return { ok: true, url };
}

async function fetchWithGuards(startUrl: string): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await safeUrlOk(current);
    if (!check.ok) throw new Error(`blocked:${check.reason}`);
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Trifecta OS import)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      // Resolve relative redirects against the current URL.
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("too_many_redirects");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData.user) return json({ error: "UNAUTHORIZED" }, 401);

    // Require the caller to be a member of a company (blocks orphan accounts).
    const { data: profile } = await authClient
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!profile?.company_id) return json({ error: "FORBIDDEN_NO_COMPANY" }, 403);

    const { url } = await req.json();
    if (!url || typeof url !== "string") return json({ error: "url required" }, 400);
    const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) {
      return json({ error: "Solo se aceptan enlaces HTTPS de Google Sheets (docs.google.com/spreadsheets/...)." }, 400);
    }
    // Build the export URL ourselves — never trust the caller's full URL.
    const exportUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`;

    let res: Response;
    try {
      res = await fetchWithGuards(exportUrl);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.startsWith("blocked:")) return json({ error: "Destino no permitido." }, 400);
      if (msg === "too_many_redirects") return json({ error: "Demasiadas redirecciones." }, 502);
      return json({ error: "No se pudo descargar el archivo." }, 502);
    }
    if (!res.ok) {
      return json({ error: `No pude descargar el Google Sheet (${res.status}). Verifica que el enlace sea correcto y que el archivo esté compartido como "cualquiera con el enlace puede ver".` }, 502);
    }

    // MIME + size guard on response.
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const allowedMime = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", "application/zip"];
    if (contentType.includes("text/html")) {
      return json({ error: "Google no devolvió un Excel válido. Abre el Sheet, usa Share, cambia el acceso a 'Anyone with the link can view' y vuelve a pegar el enlace." }, 502);
    }
    const contentLen = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (contentLen && contentLen > MAX_BYTES) return json({ error: "El archivo excede el tamaño permitido." }, 413);

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return json({ error: "El archivo excede el tamaño permitido." }, 413);
    const isZipXlsx = buf[0] === 0x50 && buf[1] === 0x4b;
    if (!isZipXlsx && !allowedMime.some((m) => contentType.startsWith(m))) {
      return json({ error: "Formato de archivo no permitido." }, 415);
    }

    // Convert to base64 in chunks (avoid stack overflow on large arrays)
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const b64 = btoa(bin);
    return json({ base64: b64, size: buf.length, contentType });
  } catch (err: any) {
    console.error("fetch-sheet-proxy error_code", err?.name ?? "unknown");
    return json({ error: "Solicitud inválida." }, 500);
  }
});
