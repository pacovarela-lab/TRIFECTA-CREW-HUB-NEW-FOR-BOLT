import { describe, expect, it } from "vitest";
import {
  authorizeV10Import,
  dryRunV10,
  normalizeV10,
  parseV10Money,
  stableV10Key,
  type V10Catalogs,
} from "@/lib/v10Import";

const header = "Date,Bank Row,Project / Client,Vendor / Worker,Category,Type,Income,Cost,Source,Review Flag,Description,User Notes / Preserved Notes,Original Project / Client,Original Category,Traceability Status,Correction Reason";
const row = (overrides: Partial<Record<string, string>> = {}) => {
  const values = {
    Date: "2026-07-01", "Bank Row": "44", "Project / Client": "PV-001",
    "Vendor / Worker": "Home Depot", Category: "Materials", Type: "GASTO",
    Income: "0", Cost: "100", Source: "BANK_TAGGED", "Review Flag": "OK",
    Description: "Paint", "User Notes / Preserved Notes": "", "Original Project / Client": "PV-001",
    "Original Category": "Materials", "Traceability Status": "CONFIRMED_BANK_MATCH", "Correction Reason": "",
    ...overrides,
  };
  return header.split(",").map((key) => values[key as keyof typeof values] ?? "").join(",");
};

const catalogs: V10Catalogs = {
  projects: [{ id: "p1", name: "Patrick", project_code: "PV-001" }],
  categories: [{ id: "c1", name: "Materials" }],
};

const files = (transactionRows: string[]) => ({
  "LOVABLE_TRANSACTIONS_V10.csv": [header, ...transactionRows].join("\n"),
  "PROJECT_SUMMARY_V10.csv": "Project / Client,Income,Labor,Materials,Other Direct,Overhead,Total Cost,Gross Profit,Margin %\nPV-001,0,0,100,0,0,100,-100,0",
  "PENDING_REVIEW_V10.csv": header,
  "CORRECTIONS_APPLIED_V10.csv": "Reporting Row,Bank Row,Date,Old Project,New Project,Old Category,New Category,User Note,Reason",
  "HANDOFF_ADJUSTMENTS_V10.csv": "Project / Client,Handoff Labor Budget,Actual Labor Before Handoff Adj,Labor Adjustment,Handoff Materials Budget,Actual Materials Before Handoff Adj,Materials Adjustment,Rule",
  "BANK_RECON_CONTROL_V10.csv": "Control,Value,Expected/Notes\nCredits Difference,0,Should be 0.00\nDebits Difference,0,Should be 0.00",
});

const splitHeader = `${header},Original Bank Amount`;
const splitFiles = (transactionRows: string[]) => ({
  ...files(transactionRows),
  "LOVABLE_TRANSACTIONS_V10.csv": [splitHeader, ...transactionRows].join("\n"),
});

describe("importador financiero V10", () => {
  it("normaliza acentos, puntuación y caracteres dañados", () => {
    expect(normalizeV10("  EQUIPMENT RENTAL� / ÁREA ")).toBe("equipment rental area");
  });

  it("valida montos sin convertir texto inválido en cero", () => {
    expect(parseV10Money("$1,234.50")).toBe(1234.5);
    expect(parseV10Money("monto desconocido")).toBeNull();
  });

  it("incluye compañía y Bank Row en la clave idempotente", () => {
    const base = { bankRow: "44", date: "2026-07-01", income: 0, cost: 100, description: "Paint", type: "GASTO", source: "BANK_TAGGED", project: "PV-001", category: "Materials" };
    expect(stableV10Key("co-1", base)).not.toBe(stableV10Key("co-2", base));
  });

  it("aprueba un dry run cuadrado", () => {
    const result = dryRunV10({ files: files([row()]), companyId: "co", catalogs });
    expect(result.canImport).toBe(true);
    expect(result.totalCost).toBe(100);
    expect(result.summaryCostDifference).toBe(0);
    expect(result.recognizedProjects).toBe(1);
  });

  it("detecta una segunda importación mediante stable_key", () => {
    const first = dryRunV10({ files: files([row()]), companyId: "co", catalogs });
    const second = dryRunV10({
      files: files([row()]),
      companyId: "co",
      catalogs: { ...catalogs, existingStableKeys: [first.rows[0].stableKey] },
    });
    expect(second.existingRows).toBe(1);
    expect(second.rows[0].duplicateClassification).toBe("existing_transaction");
  });

  it("rechaza usuario no autenticado", () => {
    expect(authorizeV10Import({
      userId: null, profileCompanyId: null, expectedCompanyId: "co", roles: [],
    })).toBe("unauthorized");
  });

  it("rechaza usuario sin rol administrativo", () => {
    expect(authorizeV10Import({
      userId: "u1", profileCompanyId: "co", expectedCompanyId: "co", roles: ["member"],
    })).toBe("forbidden");
  });

  it("rechaza company_id de otra compañía", () => {
    expect(authorizeV10Import({
      userId: "u1", profileCompanyId: "co-a", expectedCompanyId: "co-b", roles: ["admin"],
    })).toBe("company_mismatch");
  });

  it("mantiene pendientes y proyectos desconocidos en revisión", () => {
    const pending = row({
      "Project / Client": "Proyecto dudoso",
      "Traceability Status": "NEEDS_PROJECT_REVIEW",
      "Review Flag": "FALTA INFORMACIÓN",
    });
    const pendingFile = [header, pending].join("\n");
    const packageFiles = { ...files([pending]), "PENDING_REVIEW_V10.csv": pendingFile };
    const result = dryRunV10({ files: packageFiles, companyId: "co", catalogs });
    expect(result.needsProjectReview).toBe(1);
    expect(result.rows[0].projectId).toBeNull();
  });

  it("bloquea fechas y montos inválidos", () => {
    const invalid = row({ Date: "2026-02-31", Cost: "abc" });
    const result = dryRunV10({ files: files([invalid]), companyId: "co", catalogs });
    expect(result.canImport).toBe(false);
    expect(result.invalidDates).toBe(1);
    expect(result.invalidAmounts).toBe(1);
  });

  it("detecta duplicados internos sin sumar movimientos nuevos", () => {
    const result = dryRunV10({ files: files([row(), row()]), companyId: "co", catalogs });
    expect(result.internalDuplicates).toBe(1);
  });

  it("no incluye handoff en los totales bancarios", () => {
    const packageFiles = {
      ...files([row()]),
      "HANDOFF_ADJUSTMENTS_V10.csv": "Project / Client,Handoff Labor Budget,Actual Labor Before Handoff Adj,Labor Adjustment,Handoff Materials Budget,Actual Materials Before Handoff Adj,Materials Adjustment,Rule\nPV-001,1000,500,500,1000,400,600,Cap",
    };
    const result = dryRunV10({ files: packageFiles, companyId: "co", catalogs });
    expect(result.handoffAdjustments).toBe(1);
    expect(result.totalCost).toBe(100);
  });

  it("conserva owner/partner fuera de una asignación comercial", () => {
    const owner = row({
      "Project / Client": "OWNER / PARTNER TRANSACTIONS",
      Category: "Owner / Partner Personal",
      Type: "OWNER / PARTNER",
    });
    const result = dryRunV10({ files: files([owner]), companyId: "co", catalogs });
    expect(result.rows[0].projectId).toBeNull();
  });

  it("mantiene overhead fuera de proyectos comerciales", () => {
    const overhead = row({
      "Project / Client": "GENERAL / OVERHEAD",
      "Traceability Status": "GENERAL_OVERHEAD_ALLOCATED",
    });
    const result = dryRunV10({ files: files([overhead]), companyId: "co", catalogs });
    expect(result.rows[0].projectId).toBeNull();
  });

  it("conserva un split válido con grupo, índice y suma", () => {
    const first = `${row({ "Bank Row": "77", Cost: "50", Source: "SPLIT_TRANSACTIONS" })},100`;
    const second = `${row({
      "Bank Row": "77", Cost: "50", Source: "SPLIT_TRANSACTIONS",
      "Project / Client": "PV-002",
    })},100`;
    const result = dryRunV10({
      files: splitFiles([first, second]),
      companyId: "co",
      catalogs: { ...catalogs, projects: [...catalogs.projects, { id: "p2", name: "Second", project_code: "PV-002" }] },
    });
    expect(result.rows.map((item) => item.componentIndex)).toEqual([1, 2]);
    expect(result.rows[0].componentSum).toBe(100);
    expect(result.rows[0].splitValidation).toBe("valid");
    expect(new Set(result.rows.map((item) => item.stableKey)).size).toBe(2);
  });

  it("manda a revisión un split cuya suma no cuadra", () => {
    const first = `${row({ "Bank Row": "78", Cost: "50", Source: "SPLIT_TRANSACTIONS" })},90`;
    const second = `${row({ "Bank Row": "78", Cost: "50", Source: "SPLIT_TRANSACTIONS" })},90`;
    const result = dryRunV10({ files: splitFiles([first, second]), companyId: "co", catalogs });
    expect(result.rows[0].splitValidation).toBe("mismatch");
    expect(result.rows[0].issues).toContain("La suma del split no coincide con el monto bancario original");
  });

  it("clasifica un duplicado exacto sin descartarlo silenciosamente", () => {
    const duplicate = row({ Cost: "50" });
    const result = dryRunV10({ files: files([duplicate, duplicate]), companyId: "co", catalogs });
    expect(result.rows.every((item) => item.duplicateClassification === "identical_duplicate")).toBe(true);
    expect(result.rows.every((item) => item.issues.includes("Posible duplicado pendiente de revisión"))).toBe(true);
  });

  it("clasifica una coincidencia no idéntica como posible duplicado", () => {
    const first = row({ Cost: "50" });
    const second = row({ Cost: "50", "Project / Client": "PV-002" });
    const result = dryRunV10({
      files: files([first, second]),
      companyId: "co",
      catalogs: { ...catalogs, projects: [...catalogs.projects, { id: "p2", name: "Second", project_code: "PV-002" }] },
    });
    expect(result.rows.every((item) => item.duplicateClassification === "possible_duplicate")).toBe(true);
  });

  it("detecta la categoría dañada y no la asigna automáticamente", () => {
    const damaged = row({ Category: "Equipment Rental�" });
    const result = dryRunV10({
      files: files([damaged]),
      companyId: "co",
      catalogs: { ...catalogs, categories: [...catalogs.categories, { id: "c2", name: "Equipment Rental" }] },
    });
    expect(result.rows[0].categoryId).toBeNull();
    expect(result.damagedCategories[0]).toMatchObject({
      original: "Equipment Rental�",
      proposed: "Equipment Rental",
    });
  });
});
