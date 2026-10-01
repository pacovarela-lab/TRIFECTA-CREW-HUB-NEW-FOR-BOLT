import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  authorizeV10Import,
  dryRunV10,
  type V10Catalogs,
} from "../src/lib/v10Import.ts";

const header = "Date,Bank Row,Project / Client,Vendor / Worker,Category,Type,Income,Cost,Source,Review Flag,Description,User Notes / Preserved Notes,Original Project / Client,Original Category,Traceability Status,Correction Reason";
const makeRow = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    Date: "2026-07-01", "Bank Row": "44", "Project / Client": "PV-001",
    "Vendor / Worker": "Proveedor", Category: "Materials", Type: "GASTO",
    Income: "0", Cost: "100", Source: "BANK_TAGGED", "Review Flag": "OK",
    Description: "Paint", "User Notes / Preserved Notes": "",
    "Original Project / Client": "PV-001", "Original Category": "Materials",
    "Traceability Status": "CONFIRMED_BANK_MATCH", "Correction Reason": "",
    ...overrides,
  };
  return header.split(",").map((key) => values[key] ?? "").join(",");
};
const catalogs: V10Catalogs = {
  projects: [
    { id: "p1", name: "One", project_code: "PV-001" },
    { id: "p2", name: "Two", project_code: "PV-002" },
  ],
  categories: [{ id: "c1", name: "Materials" }, { id: "c2", name: "Equipment Rental" }],
};
const packageFor = (rows: string[], transactionsHeader = header) => ({
  "LOVABLE_TRANSACTIONS_V10.csv": [transactionsHeader, ...rows].join("\n"),
  "PROJECT_SUMMARY_V10.csv": "Project / Client,Income,Labor,Materials,Other Direct,Overhead,Total Cost,Gross Profit,Margin %\nPV-001,0,0,100,0,0,100,-100,0",
  "PENDING_REVIEW_V10.csv": header,
  "CORRECTIONS_APPLIED_V10.csv": "Reporting Row,Bank Row,Date,Old Project,New Project,Old Category,New Category,User Note,Reason",
  "HANDOFF_ADJUSTMENTS_V10.csv": "Project / Client,Handoff Labor Budget,Actual Labor Before Handoff Adj,Labor Adjustment,Handoff Materials Budget,Actual Materials Before Handoff Adj,Materials Adjustment,Rule",
  "BANK_RECON_CONTROL_V10.csv": "Control,Value,Expected/Notes\nCredits Difference,0,ok\nDebits Difference,0,ok",
});

let passed = 0;
const check = (name: string, test: () => void) => {
  test();
  passed++;
  console.log(`PASS ${name}`);
};

const initial = dryRunV10({ files: packageFor([makeRow()]), companyId: "co", catalogs });
check("importación inicial", () => assert.equal(initial.canImport, true));
check("segunda importación idempotente", () => {
  const replay = dryRunV10({
    files: packageFor([makeRow()]), companyId: "co",
    catalogs: { ...catalogs, existingStableKeys: [initial.rows[0].stableKey] },
  });
  assert.equal(replay.existingRows, 1);
});
check("usuario no autenticado", () => assert.equal(authorizeV10Import({
  userId: null, profileCompanyId: null, expectedCompanyId: "co", roles: [],
}), "unauthorized"));
check("usuario sin rol", () => assert.equal(authorizeV10Import({
  userId: "u", profileCompanyId: "co", expectedCompanyId: "co", roles: ["member"],
}), "forbidden"));
check("otra compañía", () => assert.equal(authorizeV10Import({
  userId: "u", profileCompanyId: "a", expectedCompanyId: "b", roles: ["admin"],
}), "company_mismatch"));
check("movimiento pendiente", () => {
  const pending = makeRow({ "Traceability Status": "PENDING_BANK_CONFIRMATION" });
  const files = { ...packageFor([pending]), "PENDING_REVIEW_V10.csv": [header, pending].join("\n") };
  assert.equal(dryRunV10({ files, companyId: "co", catalogs }).pendingBank, 1);
});
check("owner/partner", () => assert.equal(dryRunV10({
  files: packageFor([makeRow({ Type: "OWNER / PARTNER", "Project / Client": "OWNER / PARTNER TRANSACTIONS" })]),
  companyId: "co", catalogs,
}).rows[0].projectId, null));
check("overhead", () => assert.equal(dryRunV10({
  files: packageFor([makeRow({ "Project / Client": "GENERAL / OVERHEAD", "Traceability Status": "GENERAL_OVERHEAD_ALLOCATED" })]),
  companyId: "co", catalogs,
}).rows[0].projectId, null));
check("handoff separado", () => {
  const files = {
    ...packageFor([makeRow()]),
    "HANDOFF_ADJUSTMENTS_V10.csv": "Project / Client,Handoff Labor Budget,Actual Labor Before Handoff Adj,Labor Adjustment,Handoff Materials Budget,Actual Materials Before Handoff Adj,Materials Adjustment,Rule\nPV-001,1,1,0,1,1,0,Cap",
  };
  const result = dryRunV10({ files, companyId: "co", catalogs });
  assert.equal(result.handoffAdjustments, 1);
  assert.equal(result.totalCost, 100);
});
const splitHeader = `${header},Original Bank Amount`;
check("split válido", () => {
  const rows = [
    `${makeRow({ Cost: "50", Source: "SPLIT_TRANSACTIONS" })},100`,
    `${makeRow({ Cost: "50", Source: "SPLIT_TRANSACTIONS", "Project / Client": "PV-002" })},100`,
  ];
  const result = dryRunV10({ files: packageFor(rows, splitHeader), companyId: "co", catalogs });
  assert.equal(result.rows[0].splitValidation, "valid");
  assert.deepEqual(result.rows.map((row) => row.componentIndex), [1, 2]);
});
check("split descuadrado", () => {
  const rows = [
    `${makeRow({ Cost: "50", Source: "SPLIT_TRANSACTIONS" })},90`,
    `${makeRow({ Cost: "50", Source: "SPLIT_TRANSACTIONS" })},90`,
  ];
  assert.equal(dryRunV10({
    files: packageFor(rows, splitHeader), companyId: "co", catalogs,
  }).rows[0].splitValidation, "mismatch");
});
check("duplicado exacto", () => {
  const repeated = makeRow({ Cost: "50" });
  assert.equal(dryRunV10({
    files: packageFor([repeated, repeated]), companyId: "co", catalogs,
  }).rows[0].duplicateClassification, "identical_duplicate");
});
check("posible duplicado", () => {
  const result = dryRunV10({
    files: packageFor([
      makeRow({ Cost: "50" }),
      makeRow({ Cost: "50", "Project / Client": "PV-002" }),
    ]),
    companyId: "co", catalogs,
  });
  assert.equal(result.rows[0].duplicateClassification, "possible_duplicate");
});
check("categoría dañada", () => {
  const result = dryRunV10({
    files: packageFor([makeRow({ Category: "Equipment Rental�" })]), companyId: "co", catalogs,
  });
  assert.equal(result.rows[0].categoryId, null);
  assert.equal(result.damagedCategories[0].proposed, "Equipment Rental");
});
check("fecha inválida", () => assert.equal(dryRunV10({
  files: packageFor([makeRow({ Date: "2026-02-31" })]), companyId: "co", catalogs,
}).invalidDates, 1));
check("monto inválido", () => assert.equal(dryRunV10({
  files: packageFor([makeRow({ Cost: "abc" })]), companyId: "co", catalogs,
}).invalidAmounts, 1));
check("contrato servidor/RLS", () => {
  const edge = readFileSync(resolve("supabase/functions/import-v10-stage/index.ts"), "utf8");
  const migration = readFileSync(resolve("supabase/migrations/20260728090000_v10_financial_import.sql"), "utf8");
  assert.match(edge, /package_too_large/);
  assert.match(edge, /financial_import\.row_staged/);
  assert.match(migration, /is_company_member\(company_id\)/);
});

console.log(`RESULTADO: ${passed}/${passed} pruebas aprobadas`);
