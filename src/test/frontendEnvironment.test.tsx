import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIGURATION_ERROR, readFrontendConfig } from "@/integrations/supabase/frontendConfig";
import { FrontendEnvironmentGate } from "@/components/FrontendEnvironmentGate";

const valid = { VITE_SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock("@supabase/supabase-js"); });

describe("frontend environment boundary", () => {
  it.each([{}, { VITE_SUPABASE_URL: valid.VITE_SUPABASE_URL }, { VITE_SUPABASE_PUBLISHABLE_KEY: valid.VITE_SUPABASE_PUBLISHABLE_KEY }])("rejects missing configuration without leaking values", (env) => {
    expect(() => readFrontendConfig(env)).toThrow(CONFIGURATION_ERROR);
  });

  it.each(["not-a-url", "http://remote.example", "https://user:password@example.com", "https://example.com/?key=secret"])("rejects unsafe URL %s", (url) => {
    expect(() => readFrontendConfig({ ...valid, VITE_SUPABASE_URL: url })).toThrow(CONFIGURATION_ERROR);
  });

  it("rejects service-role and secret keys", () => {
    for (const key of ["sb_secret_do_not_expose", `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`]) {
      expect(() => readFrontendConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(CONFIGURATION_ERROR);
    }
  });

  it("accepts public configuration and local development", () => {
    expect(readFrontendConfig(valid)).toEqual({ url: valid.VITE_SUPABASE_URL, publishableKey: valid.VITE_SUPABASE_PUBLISHABLE_KEY });
    expect(readFrontendConfig({ ...valid, VITE_SUPABASE_URL: "http://127.0.0.1:54321/" }).url).toBe("http://127.0.0.1:54321");
    const anon = `header.${btoa(JSON.stringify({ role: "anon" }))}.signature`;
    expect(readFrontendConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: anon }).publishableKey).toBe(anon);
  });

  it("renders a controlled configuration failure before loading the application", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    render(<FrontendEnvironmentGate />);
    expect(screen.getByRole("alert")).toHaveTextContent(CONFIGURATION_ERROR);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("initializes Supabase with exactly the public environment values", async () => {
    const createClient = vi.fn(() => ({}));
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    vi.stubEnv("VITE_SUPABASE_URL", valid.VITE_SUPABASE_URL);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", valid.VITE_SUPABASE_PUBLISHABLE_KEY);
    await import("@/integrations/supabase/client");
    expect(createClient).toHaveBeenCalledWith(valid.VITE_SUPABASE_URL, valid.VITE_SUPABASE_PUBLISHABLE_KEY, expect.objectContaining({ auth: expect.objectContaining({ persistSession: true, autoRefreshToken: true }) }));
  });

  it("does not construct a client when required configuration is absent", async () => {
    const createClient = vi.fn();
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    vi.stubEnv("VITE_SUPABASE_URL", "");
    await expect(import("@/integrations/supabase/client")).rejects.toThrow(CONFIGURATION_ERROR);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps real project references and credentials out of active frontend source/config", () => {
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (["test", "__tests__"].includes(entry.name)) return [];
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : /\.(ts|tsx|js|json)$/.test(path) ? [path] : [];
    });
    const files = [...walk(resolve("src")), resolve("vite.config.ts"), resolve(".env.example"), resolve("index.html")];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const project of ["jejuyjesfhwkzfgfuozb", "ufzqonxjgmwyutljhbfw", "0ec90b57d6e95fcbda19832f"]) expect(content, file).not.toContain(project);
      expect(content, file).not.toMatch(/eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
    }
    expect(readFileSync("vite.config.ts", "utf8")).not.toMatch(/loadEnv|SUPABASE_ANON_KEY|SUPABASE_URL/);
  });
});
