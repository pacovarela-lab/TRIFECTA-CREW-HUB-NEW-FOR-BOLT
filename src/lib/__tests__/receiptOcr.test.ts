import { describe, expect, it } from "vitest";
import { parseReceiptOcrResponse } from "@/lib/receiptOcr";

describe("parseReceiptOcrResponse", () => {
  it("conserva solamente valores confiables y válidos", () => {
    expect(parseReceiptOcrResponse({
      vendor: " Ferretería Central ",
      amount: "125.40",
      spent_on: "2026-07-23",
      confidence: 1.4,
      payment_method: "CARD",
      last4: "**** 9876",
    })).toMatchObject({
      vendor: "Ferretería Central",
      amount: 125.4,
      spent_on: "2026-07-23",
      confidence: 1,
      payment_method: "card",
      last4: "9876",
    });
  });

  it("no inventa monto, fecha ni proveedor cuando la respuesta es incompleta", () => {
    expect(parseReceiptOcrResponse({
      amount: -10,
      spent_on: "2026-02-31",
      confidence: "alta",
    })).toMatchObject({
      vendor: null,
      amount: null,
      spent_on: null,
      confidence: 0,
    });
  });

  it("rechaza respuestas inválidas y errores del proveedor", () => {
    expect(() => parseReceiptOcrResponse(null)).toThrow("respuesta inválida");
    expect(() => parseReceiptOcrResponse({ error: "Servicio no disponible" })).toThrow("Servicio no disponible");
  });
});
