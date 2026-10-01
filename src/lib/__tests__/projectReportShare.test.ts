import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("jspdf", () => ({
  default: class MockJsPDF {
    internal = { pageSize: { getWidth: () => 612, getHeight: () => 792 }, getNumberOfPages: () => 1 };
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    roundedRect() {}
    rect() {}
    text() {}
    addPage() {}
    setPage() {}
    save() {}
    output() { return new Blob(["mock-pdf"], { type: "application/pdf" }); }
    getNumberOfPages() { return 1; }
  },
}));

vi.mock("jspdf-autotable", () => ({ default: () => {} }));

import { generateProjectReportPdf, downloadProjectReportPdf, shareProjectReportWhatsApp } from "@/lib/projectReportPdf";

const mockProject = { name: "Cocina Lopez", clients: { name: "Maria Lopez" } };
const mockFin = { estimateTotal: 5000, spent: 2000, collected: 3000, profit: 1000 };
const mockExpenses = [
  { spent_on: "2026-01-15", amount: 100, categories: { name: "Materiales" }, vendors: { name: "Home Depot" } },
];
const mockPayments = [
  { received_on: "2026-01-10", amount: 3000, method: "transfer", clients: { name: "Maria Lopez" } },
];

describe("projectReportPdf — generar y compartir", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("generateProjectReportPdf devuelve blob y fileName", () => {
    const result = generateProjectReportPdf(mockProject as any, mockFin, mockExpenses, mockPayments);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("application/pdf");
    expect(result.fileName).toMatch(/^reporte_Cocina_Lopez_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("downloadProjectReportPdf descarga el archivo", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadProjectReportPdf(mockProject as any, mockFin, mockExpenses, mockPayments);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("shareProjectReportWhatsApp usa Web Share API si esta disponible", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, canShare: () => true, share: shareSpy });

    await shareProjectReportWhatsApp(mockProject as any, mockFin, mockExpenses, mockPayments);

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].type).toBe("application/pdf");
    expect(arg.title).toContain("Cocina Lopez");
  });

  it("shareProjectReportWhatsApp hace fallback a descarga + WhatsApp si no hay Web Share", async () => {
    const openSpy = vi.fn();
    vi.stubGlobal("window", { ...window, open: openSpy });
    vi.stubGlobal("navigator", { ...navigator, canShare: undefined });

    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    await shareProjectReportWhatsApp(mockProject as any, mockFin, mockExpenses, mockPayments);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.mock.calls[0][0];
    expect(url).toContain("wa.me");
    expect(url).toContain(encodeURIComponent("Cocina Lopez"));
  });
});
