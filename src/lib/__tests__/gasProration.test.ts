import { describe, it, expect } from "vitest";
import { computeGasProration, isGasCategory, type GasProject } from "@/lib/gasProration";

describe("isGasCategory", () => {
  it("detecta gasolina", () => {
    expect(isGasCategory("Gasolina")).toBe(true);
  });
  it("detecta combustible", () => {
    expect(isGasCategory("Combustible")).toBe(true);
  });
  it("detecta vehiculo sin acento", () => {
    expect(isGasCategory("Vehiculo")).toBe(true);
  });
  it("detecta vehículo con acento", () => {
    expect(isGasCategory("Vehículo")).toBe(true);
  });
  it("detecta gas station", () => {
    expect(isGasCategory("Gas Station")).toBe(true);
  });
  it("detecta fuel", () => {
    expect(isGasCategory("Fuel")).toBe(true);
  });
  it("no detecta otros", () => {
    expect(isGasCategory("Materiales")).toBe(false);
    expect(isGasCategory(null)).toBe(false);
    expect(isGasCategory(undefined)).toBe(false);
    expect(isGasCategory("")).toBe(false);
  });
});

describe("computeGasProration", () => {
  const projects: GasProject[] = [
    { id: "p1", name: "Proyecto A", estimated_total: 10000 },
    { id: "p2", name: "Proyecto B", estimated_total: 30000 },
    { id: "p3", name: "Proyecto C", estimated_total: 60000 },
  ];

  it("prorratea proporcionalmente al valor de contrato", () => {
    const total = 1000;
    const { splits, error } = computeGasProration(total, projects);
    expect(error).toBeNull();
    expect(splits).toHaveLength(3);

    // p1: 10000/100000 = 10% → 100
    // p2: 30000/100000 = 30% → 300
    // p3: 60000/100000 = 60% → 600
    expect(splits[0].amount).toBe(100);
    expect(splits[1].amount).toBe(300);
    expect(splits[2].amount).toBe(600);

    expect(splits[0].percentage).toBe(10);
    expect(splits[1].percentage).toBe(30);
    expect(splits[2].percentage).toBe(60);
  });

  it("la suma de asignaciones es exactamente igual al gasto original", () => {
    const total = 333.33;
    const { splits, error } = computeGasProration(total, projects);
    expect(error).toBeNull();
    const sum = splits.reduce((s, r) => s + r.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(333.33);
  });

  it("la diferencia por redondeo se resuelve en la ultima asignacion", () => {
    const total = 100;
    const projects2: GasProject[] = [
      { id: "a", name: "A", estimated_total: 1 },
      { id: "b", name: "B", estimated_total: 1 },
      { id: "c", name: "C", estimated_total: 1 },
    ];
    const { splits, error } = computeGasProration(total, projects2);
    expect(error).toBeNull();
    const sum = splits.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(100);
    // 100/3 = 33.33 each, last one should be 33.34
    expect(splits[0].amount).toBe(33.33);
    expect(splits[1].amount).toBe(33.33);
    expect(splits[2].amount).toBe(33.34);
  });

  it("retorna error si no hay proyectos activos", () => {
    const { splits, error } = computeGasProration(500, []);
    expect(splits).toHaveLength(0);
    expect(error).toContain("No hay trabajos activos");
  });

  it("retorna error si todos los proyectos tienen contrato 0", () => {
    const zeroProjects: GasProject[] = [
      { id: "p1", name: "A", estimated_total: 0 },
      { id: "p2", name: "B", estimated_total: 0 },
    ];
    const { splits, error } = computeGasProration(500, zeroProjects);
    expect(splits).toHaveLength(0);
    expect(error).toContain("No hay trabajos activos");
  });

  it("retorna error si el monto es 0", () => {
    const { splits, error } = computeGasProration(0, projects);
    expect(splits).toHaveLength(0);
    expect(error).toContain("mayor a 0");
  });

  it("filtra proyectos sin estimated_total", () => {
    const mixed: GasProject[] = [
      { id: "p1", name: "A", estimated_total: 5000 },
      { id: "p2", name: "B", estimated_total: null },
      { id: "p3", name: "C", estimated_total: 0 },
    ];
    const { splits, error } = computeGasProration(200, mixed);
    expect(error).toBeNull();
    expect(splits).toHaveLength(1);
    expect(splits[0].project_id).toBe("p1");
    expect(splits[0].amount).toBe(200);
    expect(splits[0].percentage).toBe(100);
  });
});
