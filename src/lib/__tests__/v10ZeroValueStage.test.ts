import { describe, expect, it } from "vitest";
import { isAllowedZeroCashWithdrawal } from "../../../supabase/functions/_shared/v10-zero-value";

const allowedStatuses = new Set([
  "CONFIRMED_BANK_MATCH",
  "CONFIRMED_BY_USER_NOTE",
  "GENERAL_OVERHEAD_ALLOCATED",
  "HANDOFF_ADJUSTMENT",
  "PENDING_BANK_CONFIRMATION",
  "NEEDS_PROJECT_REVIEW",
]);
const normalizeText = (value: unknown) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const row = (overrides: Record<string, string> = {}) => ({
  Type: "RETIRO EFECTIVO",
  "Bank Row": "123",
  "Traceability Status": "CONFIRMED_BANK_MATCH",
  Income: "0",
  Cost: "0",
  ...overrides,
});

describe("hotfix de staging para RETIRO EFECTIVO con valor cero", () => {
  it("acepta únicamente RETIRO EFECTIVO exacto normalizado con Bank Row", () => {
    expect(isAllowedZeroCashWithdrawal(row(), normalizeText, allowedStatuses)).toBe(true);
  });

  it("rechaza RETIRO EFECTIVO sin Bank Row", () => {
    expect(isAllowedZeroCashWithdrawal(
      row({ "Bank Row": "  " }), normalizeText, allowedStatuses,
    )).toBe(false);
  });

  it("rechaza otro tipo con valor cero", () => {
    expect(isAllowedZeroCashWithdrawal(
      row({ Type: "RETIRO" }), normalizeText, allowedStatuses,
    )).toBe(false);
  });

  it("rechaza texto parecido como CASH WITHDRAWAL", () => {
    expect(isAllowedZeroCashWithdrawal(
      row({ Type: "CASH WITHDRAWAL" }), normalizeText, allowedStatuses,
    )).toBe(false);
  });

  it("rechaza RETIRO EFECTIVO con estado desconocido", () => {
    expect(isAllowedZeroCashWithdrawal(
      row({ "Traceability Status": "UNKNOWN" }), normalizeText, allowedStatuses,
    )).toBe(false);
  });

  it("acepta las 15 filas cero sin cambiar ingresos ni costos y conserva estados", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, index) =>
        row({ "Bank Row": `review-${index}`, "Traceability Status": "NEEDS_PROJECT_REVIEW" })),
      ...Array.from({ length: 7 }, (_, index) =>
        row({ "Bank Row": `confirmed-${index}`, "Traceability Status": "CONFIRMED_BANK_MATCH" })),
    ];
    expect(rows.filter((item) =>
      isAllowedZeroCashWithdrawal(item, normalizeText, allowedStatuses))).toHaveLength(15);
    expect(rows.filter((item) => item["Traceability Status"] === "NEEDS_PROJECT_REVIEW")).toHaveLength(8);
    expect(rows.filter((item) => item["Traceability Status"] === "CONFIRMED_BANK_MATCH")).toHaveLength(7);
    expect(rows.reduce((sum, item) => sum + Number(item.Income), 0)).toBe(0);
    expect(rows.reduce((sum, item) => sum + Number(item.Cost), 0)).toBe(0);
  });
});
