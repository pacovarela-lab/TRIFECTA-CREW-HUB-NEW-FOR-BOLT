import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/import-v10-stage/index.ts"),
  "utf8",
);
const commitSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/import-commit/index.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260728090000_v10_financial_import.sql"),
  "utf8",
);

describe("contrato de integración del importador V10", () => {
  it("deriva company_id del perfil y rechaza otra compañía", () => {
    expect(edgeSource).toContain('.from("profiles")');
    expect(edgeSource).toContain("body.expected_company_id !== companyId");
    expect(edgeSource).not.toMatch(/companyId\s*=\s*["'][0-9a-f-]{20,}/i);
  });

  it("exige autenticación y rol admin o manager", () => {
    expect(edgeSource).toContain('error: "unauthorized"');
    expect(edgeSource).toContain('item.role === "admin" || item.role === "manager"');
    expect(edgeSource).toContain('error: "forbidden"');
  });

  it("valida nombres y límites del paquete en servidor", () => {
    expect(edgeSource).toContain("unexpected_file");
    expect(edgeSource).toContain("MAX_FILE_BYTES");
    expect(edgeSource).toContain("MAX_PACKAGE_BYTES");
    expect(edgeSource).toContain("package_too_large");
  });

  it("evita una segunda importación completa mediante package_hash", () => {
    expect(edgeSource).toContain('eq("package_hash", packageHash)');
    expect(edgeSource).toContain("idempotent_replay: true");
    expect(migration).toContain("import_files_company_package_hash_uniq");
  });

  it("limita lotes de stable_key para no exceder el URL de PostgREST", () => {
    expect(edgeSource).toContain("const stableKeyBatchSize = 50");
    expect(edgeSource).toContain("offset += stableKeyBatchSize");
    expect(edgeSource).toContain("offset + stableKeyBatchSize");
  });

  it("mantiene handoff separado y bloquea splits no comprobados", () => {
    expect(edgeSource).toContain('.from("handoff_adjustments")');
    expect(edgeSource).not.toMatch(/handoff[\s\S]{0,300}\.from\("bank_transactions"\)/);
    expect(commitSource).toContain('r.split_validation !== "valid"');
  });

  it("propone RLS por compañía y auditoría por archivo y fila", () => {
    expect(migration).toContain("public.is_company_member(company_id)");
    expect(migration).toContain("public.has_role(auth.uid(), company_id, 'admin')");
    expect(migration).toContain("public.has_role(auth.uid(), company_id, 'manager')");
    expect(edgeSource).toContain("financial_import.v10_staged");
    expect(edgeSource).toContain("financial_import.row_staged");
  });

  it("no expone service role al frontend ni a la función", () => {
    expect(edgeSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(edgeSource).toContain("SUPABASE_ANON_KEY");
  });

  it("rechaza JWT ausente o inválido y deriva la compañía en servidor", () => {
    expect(edgeSource).toContain("Bearer");
    expect(edgeSource).toContain("authError");
    expect(edgeSource).toContain('.from("profiles")');
    expect(edgeSource).toContain('.from("user_roles")');
    expect(commitSource).toContain("Bearer");
    expect(commitSource).toContain("profile.company_id");
    expect(commitSource).not.toMatch(/company_id\s*:\s*body\./);
  });

  it("limita tamaño, filas, campos, encabezados y fórmulas CSV", () => {
    expect(edgeSource).toContain("MAX_FILE_BYTES");
    expect(edgeSource).toContain("MAX_ROWS_PER_FILE");
    expect(edgeSource).toContain("MAX_TOTAL_ROWS");
    expect(edgeSource).toContain("MAX_FIELD_LENGTH");
    expect(edgeSource).toContain("invalid_headers");
    expect(edgeSource).toContain("unsafe_csv_formula");
    expect(edgeSource).toContain("MAX_ABSOLUTE_AMOUNT");
    expect(edgeSource).toContain("processing_timeout");
  });

  it("reclama filas atómicamente y bloquea replay, splits y pendientes", () => {
    expect(commitSource).toContain("claim_financial_import_rows");
    expect(commitSource).toContain("new Set(rowIds).size !== rowIds.length");
    expect(commitSource).toContain("rows_unavailable");
    expect(commitSource).toContain('r.split_validation !== "valid"');
    expect(commitSource).toContain('r.traceability_status === "PENDING_BANK_CONFIRMATION"');
    expect(commitSource).toContain('r.traceability_status === "HANDOFF_ADJUSTMENT"');
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("r.status = 'confirmed'");
    expect(migration).toContain("SET status = 'suggested'");
  });

  it("impide relaciones cross-tenant mediante claves compuestas", () => {
    expect(migration).toContain("import_rows_file_same_company_fk");
    expect(migration).toContain("import_rows_project_same_company_fk");
    expect(migration).toContain("import_row_suggestions_row_same_company_fk");
    expect(migration).toContain("handoff_project_same_company_fk");
    expect(migration).toContain("FOREIGN KEY (suggested_project_id, company_id)");
    expect(migration).toContain("FOREIGN KEY (import_file_id, company_id)");
  });

  it("restringe SECURITY DEFINER y valida usuario, rol e importación", () => {
    expect(migration).toContain("claim_financial_import_rows");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("'admin'::public.app_role");
    expect(migration).toContain("'manager'::public.app_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.claim_financial_import_rows");
    expect(migration).toContain("f.status IN ('staged', 'reviewing')");
  });

  it("no filtra detalles internos en respuestas de commit", () => {
    expect(commitSource).toContain('error: "commit_failed"');
    expect(commitSource).toContain('error: "row_failed"');
    expect(commitSource).not.toContain("JSON.stringify({ error: String");
  });
});
