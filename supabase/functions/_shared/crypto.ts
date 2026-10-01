const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function keyMaterial(secret: string): Promise<Uint8Array<ArrayBuffer>> {
  const trimmed = secret.trim();
  // 64 hex chars -> 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const bytes = new Uint8Array(new ArrayBuffer(32));
    for (let i = 0; i < 32; i += 1) bytes[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  // valid base64/base64url decoding to exactly 32 bytes
  if (/^[A-Za-z0-9_\-+/]+=*$/.test(trimmed)) {
    try {
      const bytes = fromB64url(trimmed);
      if (bytes.byteLength === 32) return bytes;
    } catch {
      // fall through to derivation
    }
  }
  // fallback: derive a deterministic 32-byte key from any passphrase
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(trimmed));
  return new Uint8Array(digest as ArrayBuffer);
}

async function aesKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("missing_encryption_key");
  const raw = await keyMaterial(secret);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}


export async function encryptSecret(plaintext: string, secret: string, keyId = "primary"): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), encoder.encode(plaintext));
  return `v1.${keyId}.${b64url(iv)}.${b64url(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(payload: string, secret: string): Promise<string> {
  const [version, , encodedIv, encodedCiphertext, extra] = payload.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext || extra) throw new Error("invalid_ciphertext_format");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64url(encodedIv) },
    await aesKey(secret),
    fromB64url(encodedCiphertext),
  );
  return decoder.decode(plaintext);
}

export async function sha256(value: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function signState(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export function encodeState(value: unknown): string {
  return b64url(encoder.encode(JSON.stringify(value)));
}

export function decodeState<T>(value: string): T {
  return JSON.parse(decoder.decode(fromB64url(value))) as T;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < a.byteLength; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
