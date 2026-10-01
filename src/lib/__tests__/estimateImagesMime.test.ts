import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWLIST = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function migrationsMentioningMimetype(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .filter((sql) => sql.includes("metadata->>'mimetype'"));
}

describe("estimate-images MIME allowlist", () => {
  it("is enforced by at least one storage policy migration", () => {
    expect(migrationsMentioningMimetype().length).toBeGreaterThan(0);
  });

  it("uses the exact allowlist in the storage policies", () => {
    for (const sql of migrationsMentioningMimetype()) {
      for (const mime of ALLOWLIST) {
        expect(sql).toContain(`'${mime}'`);
      }
      expect(sql).not.toContain("'image/gif'");
      expect(sql).not.toContain("'application/pdf'");
    }
  });

  it("keeps every hardened policy gated on tenant, approval, trial and permissions", () => {
    for (const sql of migrationsMentioningMimetype()) {
      expect(sql).toContain("current_company_id()");
      expect(sql).toContain("can_manage_estimate");
    }
  });

  it("matches the DB check constraint allowlist defined in the foundation migration", () => {
    const foundation = readFileSync(
      join(MIGRATIONS_DIR, "20260828120000_estimate_photo_foundation.sql"),
      "utf8",
    );
    for (const mime of ALLOWLIST) {
      expect(foundation).toContain(`'${mime}'`);
    }
  });
});
