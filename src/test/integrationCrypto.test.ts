import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../../supabase/functions/_shared/crypto";

const key = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
const wrongKey = "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk";

/**
 * base64url sin padding: el último carácter puede portar bits no significativos,
 * por lo que cambiarlo NO garantiza mutar los bytes reales. Mutamos el byte crudo.
 */
function tamperCiphertext(payload: string): string {
  const [version, keyId, iv, ciphertext] = payload.split(".");
  const padded = ciphertext.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(ciphertext.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  bytes[0] ^= 0xff;
  let mutated = "";
  for (const byte of bytes) mutated += String.fromCharCode(byte);
  return [version, keyId, iv, btoa(mutated).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")].join(".");
}


describe("integration secret encryption", () => {
  it("round-trips without storing plaintext and uses unique IVs", async () => {
    const first = await encryptSecret("refresh-token-value", key);
    const second = await encryptSecret("refresh-token-value", key);
    expect(first).not.toContain("refresh-token-value");
    expect(first).not.toBe(second);
    await expect(decryptSecret(first, key)).resolves.toBe("refresh-token-value");
  });

  it("rejects tampering and a different key", async () => {
    const encrypted = await encryptSecret("refresh-token-value", key);
    const tampered = tamperCiphertext(encrypted);
    expect(tampered).not.toBe(encrypted);
    await expect(decryptSecret(tampered, key)).rejects.toThrow();
    await expect(decryptSecret(encrypted, wrongKey)).rejects.toThrow();
  });
});
