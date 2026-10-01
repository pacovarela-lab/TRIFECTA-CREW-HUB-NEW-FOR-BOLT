import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const REMINDER_MESSAGE = "¿Terminaste por hoy? 🚛 Toma una foto de tus recibos o usa la voz para registrar los pagos de hoy en 1 minuto.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const currentTime = `${String(utcHours).padStart(2, "0")}:${String(utcMinutes).padStart(2, "0")}`;

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, daily_reminder_enabled, daily_reminder_time")
      .eq("daily_reminder_enabled", true)
      .eq("daily_reminder_time", currentTime);

    if (error) throw error;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    for (const profile of profiles) {
      const { data: subs, error: subError } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", profile.id);

      if (subError || !subs || subs.length === 0) continue;

      for (const sub of subs) {
        try {
          await sendPushNotification(supabase, sub.endpoint, sub.p256dh, sub.auth);
          sent++;
        } catch {
          // subscription may be expired — delete it
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    return new Response(JSON.stringify({ sent, checked: profiles.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendPushNotification(supabase: ReturnType<typeof createClient>, endpoint: string, p256dh: string, auth: string): Promise<void> {
  const { data: secretRow, error: secretErr } = await supabase
    .rpc("vault_read_secret", { secret_name: "VAPID_PRIVATE_KEY" })
    .maybeSingle();
  if (secretErr || !secretRow) throw new Error("VAPID_PRIVATE_KEY not found in vault");
  const vapidPrivateKey = secretRow;

  const payload = JSON.stringify({
    title: "Crew Hub",
    body: REMINDER_MESSAGE,
    url: "/",
  });

  const key = await importVapidKey(vapidPrivateKey);
  const vapidHeaders = await generateVapidHeaders(key, endpoint);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization": vapidHeaders.authorization,
      "Crypto-Key": vapidHeaders.cryptoKey,
    },
    body: await encryptPayload(payload, p256dh, auth),
  });

  if (!response.ok && response.status === 410) {
    throw new Error("Subscription expired");
  }
}

async function importVapidKey(jwkB64: string): Promise<CryptoKey> {
  const jwk = JSON.parse(atob(jwkB64));
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function generateVapidHeaders(key: CryptoKey, endpoint: string): Promise<{ authorization: string; cryptoKey: string }> {
  const aud = new URL(endpoint).origin;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const payload = {
    aud,
    exp: expiry,
    sub: "mailto:crewhub@example.com",
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("SHA-256", key, payloadBytes);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  const publicJwk = await crypto.subtle.exportKey("jwk", key);
  // We need the public key in raw format for the Crypto-Key header
  const pubKey = await crypto.subtle.exportKey("raw", await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]));
  const pubKeyB64 = btoa(String.fromCharCode(...new Uint8Array(pubKey)));
  return {
    authorization: `vapid t=${sigB64}, k=${pubKeyB64}`,
    cryptoKey: `p256ecdsa=${pubKeyB64}`,
  };
}

async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<ArrayBuffer> {
  // Web Push encryption using aes128gcm
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(payload);

  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPublicKey = await crypto.subtle.exportKey("raw", serverKeys.publicKey);

  const clientPublicKey = Uint8Array.from(atob(p256dh), c => c.charCodeAt(0));
  const clientAuthSecret = Uint8Array.from(atob(auth), c => c.charCodeAt(0));

  const importedClientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: importedClientKey },
    serverKeys.privateKey,
    256,
  );

  const authInfo = encoder.encode("Content-Encoding: auth\0");
  const prkKeyInfo = concatBuffers(clientAuthSecret, new Uint8Array(sharedSecret));
  const prk = await hkdf(prkKeyInfo, authInfo, 32);

  const context = encoder.encode("P-256\0");
  const contextBuffer = concatBuffers(
    context,
    new Uint8Array([0, clientPublicKey.byteLength]),
    clientPublicKey,
    new Uint8Array([0, serverPublicKey.byteLength]),
    new Uint8Array(serverPublicKey),
  );

  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdf(prk, concatBuffers(cekInfo, contextBuffer), 16);

  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  const nonce = await hkdf(prk, concatBuffers(nonceInfo, contextBuffer), 12);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]),
    plaintext,
  );

  const padding = new Uint8Array(1).fill(2);
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, encrypted.byteLength + padding.byteLength + 16 + 1, false);

  const header = concatBuffers(
    new Uint8Array(serverPublicKey.byteLength + 1),
    new Uint8Array(serverPublicKey),
    new Uint8Array([0]),
    recordSize,
    new Uint8Array([1]),
  );

  return concatBuffers(header, new Uint8Array(encrypted), padding).buffer;
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.byteLength;
  }
  return result;
}

async function hkdf(ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
    key,
    length * 8,
  );
  return new Uint8Array(derived);
}
