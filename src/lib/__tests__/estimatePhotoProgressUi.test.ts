import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scan = readFileSync(join(process.cwd(), "src", "pages", "EstimatePhotoScan.tsx"), "utf8");

describe("progreso del análisis de fotos", () => {
  it("presenta las cuatro etapas en orden y termina listo para revisar", () => {
    const labels = ["Preparando foto", "Leyendo presupuesto", "Organizando partidas", "Listo para revisar"];
    expect(labels.map((label) => scan.indexOf(`label: "${label}"`))).toEqual([...labels.map((label) => scan.indexOf(`label: "${label}"`))].sort((a, b) => a - b));
    expect(scan).toContain('setAnalysisStage("ready")');
  });
  it("impide doble submit antes de esperar a React", () => {
    expect(scan).toContain("busy || submitLock.current");
    expect(scan).toContain("submitLock.current = true");
    expect(scan).toContain("submitLock.current = false");
  });
  it("hace una sola llamada al analizador y no usa polling", () => {
    expect(scan.match(/functions\.invoke\("estimate-photo-analyze"/g)).toHaveLength(1);
    expect(scan).not.toContain("setInterval");
  });
  it("detiene las etapas y conserva el borrador y fotos al fallar o reintentar", () => {
    expect(scan).toContain('setAnalysisStage("error")');
    expect(scan).toContain("Reintentar análisis (conserva el borrador y las fotos)");
    expect(scan).toContain("if (!currentEstimateId)");
  });
});
