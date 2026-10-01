import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dryRunV10, parseV10Transactions, type V10Catalogs } from "../v10Import";
import {
  canonicalV10Project,
  distributeSplitComponents,
  isV10OwnerMovement,
  isV10ReviewFlagged,
  resolveV10ProjectKey,
  v10LedgerKey,
  isV10LedgerEligible,
  isV10ProfitabilityEligible,
} from "../v10Aliases";

const header = "Date,Bank Row,Project / Client,Vendor / Worker,Category,Type,Income,Cost,Source,Review Flag,Description,User Notes / Preserved Notes,Original Project / Client,Original Category,Traceability Status,Correction Reason";

const row = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    Date: "2026-07-01", "Bank Row": "44", "Project / Client": "PATRICK VYSATA-PV-001",
    "Vendor / Worker": "Proveedor", Category: "Materials", Type: "GASTO",
    Income: "0", Cost: "100", Source: "BANK_TAGGED", "Review Flag": "OK",
    Description: "Paint", "User Notes / Preserved Notes": "",
    "Original Project / Client": "", "Original Category": "",
    "Traceability Status": "CONFIRMED_BANK_MATCH", "Correction Reason": "",
    ...overrides,
  };
  return header.split(",").map((key) => values[key] ?? "").join(",");
};

const catalogs: V10Catalogs = {
  projects: [
    { id: "pv", name: "PATRICK VYSATA-PV-001", project_code: "PV-001" },
    { id: "ja", name: "JEKI ABRAHAM-JA-002", project_code: "JA-002" },
    { id: "nm", name: "NICK MENZA-NM-001", project_code: "NM-001" },
    { id: "jd", name: "JOEL DOWLING-JD-001", project_code: "JD-001" },
    { id: "rs", name: "Bathroom Ramsey (Silaba)", project_code: "BR-001" },
  ],
  categories: [{ id: "c1", name: "Materials" }],
};

const parse = (rows: string[]) => parseV10Transactions([header, ...rows].join("\n"), "co", catalogs);

describe("aliases de proyecto V10", () => {
  it.each([
    ["Patrick", "PATRICK VYSATA-PV-001"],
    ["PV-001", "PATRICK VYSATA-PV-001"],
    ["Patrick V", "PATRICK VYSATA-PV-001"],
    ["Patrick Visata", "PATRICK VYSATA-PV-001"],
    ["Jeki", "JEKI ABRAHAM-JA-002"],
    ["Nick", "NICK MENZA-NM-001"],
    ["Menza", "NICK MENZA-NM-001"],
    ["Joel", "JOEL DOWLING-JD-001"],
    ["Ramsey", "Bathroom Ramsey (Silaba)"],
    ["Silaba", "Bathroom Ramsey (Silaba)"],
    ["Bathroom Ramsey Silaba", "Bathroom Ramsey (Silaba)"],
  ])("%s resuelve a %s", (input, expected) => {
    expect(canonicalV10Project(input)).toBe(expected);
    expect(resolveV10ProjectKey(input)).toBe(resolveV10ProjectKey(expected));
  });

  it("asigna el proyecto por alias en el detalle", () => {
    const [parsed] = parse([row({ "Project / Client": "Jeki" })]);
    expect(parsed.projectId).toBe("ja");
    expect(parsed.issues).not.toContain("Proyecto no reconocido");
  });
});

describe("reglas de banco, ingresos, overhead y owner", () => {
  it("los ingresos no requieren categoría de gasto", () => {
    const [parsed] = parse([row({ Income: "500", Cost: "0", Category: "", Type: "INGRESO" })]);
    expect(parsed.issues).not.toContain("Categoría no reconocida");
    expect(parsed.affectsProfitability).toBe(true);
  });

  it("overhead y owner no requieren proyecto y owner no afecta rentabilidad", () => {
    const [overhead, owner] = parse([
      row({ "Project / Client": "GENERAL / OVERHEAD", "Traceability Status": "GENERAL_OVERHEAD_ALLOCATED" }),
      row({ "Project / Client": "OWNER / PARTNER TRANSACTIONS", Type: "OWNER / PARTNER", Category: "" }),
    ]);
    expect(overhead.issues).not.toContain("Proyecto no reconocido");
    expect(overhead.affectsProfitability).toBe(true);
    expect(owner.issues).not.toContain("Proyecto no reconocido");
    expect(owner.issues).not.toContain("Categoría no reconocida");
    expect(owner.isOwnerMovement).toBe(true);
    expect(owner.affectsProfitability).toBe(false);
    expect(isV10OwnerMovement("OWNER / PARTNER", "")).toBe(true);
  });

  it("conserva retiros de efectivo cero/cero sin efecto", () => {
    const [parsed] = parse([row({ Type: "RETIRO EFECTIVO", Income: "0", Cost: "0" })]);
    expect(parsed.issues).not.toContain("Monto inválido");
    expect(parsed.income).toBe(0);
    expect(parsed.cost).toBe(0);
  });
});

describe("splits legítimos y determinísticos", () => {
  it("suma al banco con el último componente absorbiendo el redondeo", () => {
    expect(distributeSplitComponents([33.333, 33.333, 33.333], 100)).toEqual([33.33, 33.33, 33.34]);
    expect(distributeSplitComponents([10.005, 20.004])).toEqual([10.01, 20]);
  });

  it("clasifica los componentes como split válido aunque no venga el monto bancario", () => {
    const rows = parse([
      row({ Source: "SPLIT_TRANSACTIONS", Cost: "33.33", Description: "Split ferretería" }),
      row({ Source: "SPLIT_TRANSACTIONS", Cost: "33.33", Description: "Split ferretería" }),
      row({ Source: "SPLIT_TRANSACTIONS", Cost: "33.34", Description: "Split ferretería" }),
    ]);
    expect(rows.every((item) => item.duplicateClassification === "legitimate_split")).toBe(true);
    expect(rows.every((item) => item.splitValidation === "valid")).toBe(true);
    expect(new Set(rows.map((item) => item.splitGroupId)).size).toBe(1);
    expect(rows[0].componentSum).toBe(100);
    expect(rows.flatMap((item) => item.issues)).not.toContain(
      "La suma del split no coincide con el monto bancario original",
    );
  });
});

describe("bandeja de duda real", () => {
  it.each([
    ["OK", false],
    ["FALTA INFORMACIÓN", true],
    ["REVISADO - FALTA EVIDENCIA", true],
    ["FALTA INFORMACIÓN | REVISADO - FALTA EVIDENCIA", true],
    ["PENDING BANK STATEMENT JUL06-JUL28", false],
  ])("%s → duda %s", (flag, expected) => {
    expect(isV10ReviewFlagged(flag)).toBe(expected);
  });

  it("separa duda, banco pendiente y ledger", () => {
    const result = dryRunV10({
      companyId: "co",
      catalogs,
      files: {
        "LOVABLE_TRANSACTIONS_V10.csv": [header,
          row(),
          row({ "Review Flag": "FALTA INFORMACIÓN", "Traceability Status": "NEEDS_PROJECT_REVIEW", "Project / Client": "UNASSIGNED EXPENSE" }),
          row({ "Review Flag": "PENDING BANK STATEMENT JUL06-JUL28", "Traceability Status": "PENDING_BANK_CONFIRMATION", Cost: "50" }),
        ].join("\n"),
        "PROJECT_SUMMARY_V10.csv": "Project / Client,Income,Total Cost\nPATRICK VYSATA-PV-001,0,250",
        "PENDING_REVIEW_V10.csv": header,
        "CORRECTIONS_APPLIED_V10.csv": "Reporting Row,Bank Row,Date,Reason",
        "HANDOFF_ADJUSTMENTS_V10.csv": "Project / Client,Labor Adjustment,Materials Adjustment,Rule",
        "BANK_RECON_CONTROL_V10.csv": "Control,Value\nCredits Difference,0\nDebits Difference,0",
      },
    });
    expect(result.reviewQueue).toBe(1);
    expect(result.pendingBank).toBe(1);
    expect(result.bankLedgerRows).toBe(2);
    expect(result.profitabilityRows).toBe(1);
    expect(result.pendingBankCost).toBe(50);
    expect(result.confirmedCost).toBe(200);
  });
});

describe("helpers compartidos", () => {
  it("mantiene paridad entre el frontend y la edge function", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/v10Aliases.ts"), "utf8");
    const edge = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/v10-aliases.ts"), "utf8");
    const strip = (value: string) => value.split("\n").slice(2).join("\n");
    expect(strip(edge)).toBe(strip(client));
  });

  it("el commit publica ledger sin proyecto y evita doble contabilización", () => {
    const commit = readFileSync(resolve(process.cwd(), "supabase/functions/import-commit/index.ts"), "utf8");
    expect(commit).toContain("ensureBankTransaction");
    expect(commit).toContain('.eq("external_ref", externalRef)');
    expect(commit).toContain("bank_transaction_id: bankTransactionId");
    expect(commit).not.toContain("r.affects_project_profitability === false ||");
  });
});

describe("ledger único por movimiento bancario", () => {
  it("colapsa componentes de split y filas que comparten Bank Row", () => {
    expect(v10LedgerKey("g1", "44", "sk1")).toBe(v10LedgerKey("g1", "45", "sk2"));
    expect(v10LedgerKey(null, "18", "sk1")).toBe(v10LedgerKey(null, " 18 ", "sk2"));
    expect(v10LedgerKey(null, "", "sk1")).toBe("sk1");
    expect(v10LedgerKey(null, "", null)).toBeNull();
    expect(v10LedgerKey(null, "18", "sk1")).not.toBe(v10LedgerKey(null, "19", "sk1"));
  });

  it("cuenta un movimiento por retiro de efectivo pareado con su gasto", () => {
    const result = dryRunV10({
      companyId: "co",
      catalogs,
      files: {
        "LOVABLE_TRANSACTIONS_V10.csv": [header,
          row({ "Bank Row": "18", Type: "RETIRO EFECTIVO", Cost: "0", Category: "" }),
          row({ "Bank Row": "18", Cost: "150", "Project / Client": "GENERAL / OVERHEAD", "Traceability Status": "GENERAL_OVERHEAD_ALLOCATED" }),
          row({ "Bank Row": "19", Cost: "20" }),
        ].join("\n"),
        "PROJECT_SUMMARY_V10.csv": "Project / Client,Income,Total Cost\nPATRICK VYSATA-PV-001,0,170",
        "PENDING_REVIEW_V10.csv": header,
        "CORRECTIONS_APPLIED_V10.csv": "Reporting Row,Bank Row,Date,Reason",
        "HANDOFF_ADJUSTMENTS_V10.csv": "Project / Client,Labor Adjustment,Materials Adjustment,Rule",
        "BANK_RECON_CONTROL_V10.csv": "Control,Value\nCredits Difference,0\nDebits Difference,0",
      },
    });
    expect(result.totalRows).toBe(3);
    expect(result.bankLedgerRows).toBe(3);
    expect(result.bankLedgerMovements).toBe(2);
    expect(result.zeroEffectRows).toBe(1);
    expect(result.totalCost).toBe(170);
  });
});

describe("contrato adversarial del commit", () => {
  const commit = readFileSync(resolve(process.cwd(), "supabase/functions/import-commit/index.ts"), "utf8");

  it("usa la clave de ledger compartida y tolera reintentos", () => {
    expect(commit).toContain('import { v10LedgerKey } from "../_shared/v10-aliases.ts"');
    expect(commit).toContain("v10LedgerKey(r.split_group_id, r.bank_row");
    expect(commit).toContain("const replay = await lookup()");
    expect(commit).toContain("cache.set(externalRef");
  });

  it("reencola filas fallidas para que el reintento complete lo faltante", () => {
    expect(commit).toContain('{ status: "confirmed", error_message: "row_failed" }');
    expect(commit).toContain('{ error_message: "row_failed" }');
  });

  it("separa ledger_eligible de profitability_eligible", () => {
    expect(commit).toContain('body.mode === "ledger_only"');
    expect(commit).toContain("claim_financial_ledger_rows");
    expect(commit).toContain("ledger_transaction_id: bankTransactionId");
    // ledger_only nunca crea gasto/pago ni cambia el estado de revisión
    const ledgerBlock = commit.slice(commit.indexOf('if (mode === "ledger_only")'), commit.indexOf("const overheadExpense"));
    expect(ledgerBlock).not.toContain('from("expenses")');
    expect(ledgerBlock).not.toContain('from("payments")');
    expect(ledgerBlock).not.toContain('status: "imported"');
  });

  it("no publica movimientos de importe cero ni pending bank", () => {
    expect(commit).toContain("if (!magnitude) return null;");
    expect(commit).toContain('r.traceability_status === "PENDING_BANK_CONFIRMATION"');
    expect(commit).toContain('r.traceability_status === "HANDOFF_ADJUSTMENT"');
  });

  it("publica overhead sin proyecto pero nunca un pago sin proyecto seguro", () => {
    expect(commit).toContain("const overheadExpense = r.traceability_status === \"GENERAL_OVERHEAD_ALLOCATED\" &&");
    expect(commit).toContain("(r.suggested_project_id != null || overheadExpense)");
    expect(commit).toMatch(/detected_type === "payment"[\s\S]{0,900}client_id: r\.suggested_client_id/);
  });

  it("mantiene aislamiento por compañía y cero service_role", () => {
    expect(commit).toContain("row.company_id !== profile.company_id");
    expect(commit).toContain('.eq("company_id", r.company_id)');
    expect(commit).not.toContain("SERVICE_ROLE");
  });
});

describe("elegibilidad ledger vs rentabilidad", () => {
  const review = { traceabilityStatus: "NEEDS_PROJECT_REVIEW", duplicateClassification: "unique", affectsProjectProfitability: false, projectId: null, amount: 120 };
  it("publica en ledger las filas de revisión pero no en rentabilidad", () => {
    expect(isV10LedgerEligible(review)).toBe(true);
    expect(isV10ProfitabilityEligible(review)).toBe(false);
  });
  it("nunca publica pending bank ni handoff", () => {
    expect(isV10LedgerEligible({ ...review, traceabilityStatus: "PENDING_BANK_CONFIRMATION" })).toBe(false);
    expect(isV10LedgerEligible({ ...review, traceabilityStatus: "HANDOFF_ADJUSTMENT" })).toBe(false);
  });
  it("excluye duplicados reales, splits inválidos y montos cero", () => {
    expect(isV10LedgerEligible({ ...review, duplicateClassification: "identical_duplicate" })).toBe(false);
    expect(isV10LedgerEligible({ ...review, duplicateClassification: "legitimate_split", splitValidation: "ambiguous" })).toBe(false);
    expect(isV10LedgerEligible({ ...review, duplicateClassification: "legitimate_split", splitValidation: "valid" })).toBe(true);
    expect(isV10LedgerEligible({ ...review, amount: 0 })).toBe(false);
  });
  it("permite rentabilidad sólo con proyecto seguro u overhead", () => {
    expect(isV10ProfitabilityEligible({ ...review, affectsProjectProfitability: true, projectId: "p1" })).toBe(true);
    expect(isV10ProfitabilityEligible({ ...review, affectsProjectProfitability: true, projectId: null })).toBe(false);
    expect(isV10ProfitabilityEligible({ ...review, affectsProjectProfitability: true, traceabilityStatus: "GENERAL_OVERHEAD_ALLOCATED" })).toBe(true);
  });
});
