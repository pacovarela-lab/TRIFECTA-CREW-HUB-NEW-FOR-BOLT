import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const encode = (data: object) => btoa(JSON.stringify(data)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-fixture", exp: expiresAt, role: "authenticated" })}.fixture`;
const user = { id: "user-fixture", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: token, refresh_token: "refresh-fixture", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user };
const storageKey = "sb-example-auth-token";
let client: SupabaseClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  window.history.replaceState({}, "", "/login");
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return new Response(JSON.stringify(user), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
    throw new Error("Unexpected request in isolated Auth test");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await client?.auth.stopAutoRefresh();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("native Supabase session storage (real SDK, mocked network)", () => {
  it("restores the existing browser storage key and clears it on logout without a broker", async () => {
    localStorage.setItem(storageKey, JSON.stringify(session));
    const postMessage = vi.spyOn(window.parent, "postMessage");
    client = (await import("@/integrations/supabase/client")).supabase;
    const restored = await client.auth.getSession();
    expect(restored.data.session?.user.id).toBe(user.id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await client.auth.signOut()).error).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });

  it("consumes an OAuth callback, persists the session, and removes the URL token", async () => {
    window.history.replaceState({}, "", `/login#access_token=${token}&refresh_token=refresh-fixture&token_type=bearer&expires_in=3600`);
    client = (await import("@/integrations/supabase/client")).supabase;
    const restored = await client.auth.getSession();
    expect(restored.error).toBeNull();
    expect(restored.data.session?.user.id).toBe(user.id);
    expect(JSON.parse(localStorage.getItem(storageKey)!).access_token).toBe(token);
    expect(window.location.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("has no frontend Lovable package or integration dependency", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => name.includes("lovable"))).toEqual([]);
    expect(readFileSync("package-lock.json", "utf8")).not.toContain("@lovable.dev/");
    expect(readFileSync("src/integrations/supabase/client.ts", "utf8")).not.toMatch(/previewAuthStorage|brokeredPreviewStorage/);
  });
});
