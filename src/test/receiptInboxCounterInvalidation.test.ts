import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regresión: el contador "Recibos · N por revisar" usa la key ["receipts-inbox-count"],
// que NO es prefijo de ["receipts"]. Toda mutación que invalida ["receipts"] debe
// invalidar también el contador, o se queda desactualizado tras revisar/convertir.
describe("receipts inbox counter invalidation", () => {
  const src = readFileSync("src/hooks/useTrifectaData.ts", "utf8");
  it("invalida el contador junto con cada invalidación de recibos", () => {
    const receipts = src.match(/queryKey: \["receipts"\] \}\);/g)?.length ?? 0;
    const counter = src.match(/queryKey: \["receipts-inbox-count"\] \}\);/g)?.length ?? 0;
    expect(receipts).toBeGreaterThan(0);
    expect(counter).toBe(receipts);
  });
});
