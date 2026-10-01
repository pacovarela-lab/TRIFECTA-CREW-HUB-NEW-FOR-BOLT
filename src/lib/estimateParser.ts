import Papa from "papaparse";
import * as XLSX from "xlsx";

export type RawRow = Record<string, string | number | null>;

export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
}

export const parseFile = async (file: File): Promise<ParsedFile> => {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || file.type === "text/csv") {
    return await parseCsv(file);
  }
  if (ext === "xlsx" || ext === "xls" || file.type.includes("sheet")) {
    return await parseExcel(file);
  }
  if (ext === "pdf" || file.type === "application/pdf") {
    // Basic placeholder — PDF parsing improved later.
    throw new Error("PDF parsing isn't supported yet. Please export to CSV or Excel from Handoff.ai for now.");
  }
  throw new Error("Unsupported file type. Upload CSV, Excel, or PDF.");
};

const parseCsv = (file: File): Promise<ParsedFile> =>
  new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        resolve({ headers, rows: res.data });
      },
      error: (e) => reject(e),
    });
  });

const parseExcel = async (file: File): Promise<ParsedFile> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  const headers = json.length > 0 ? Object.keys(json[0]) : [];
  return { headers, rows: json };
};

// Heuristic auto-mapping for common Handoff.ai column names
export type FieldKey = "description" | "category" | "quantity" | "unit" | "unit_price" | "total";

const HINTS: Record<FieldKey, string[]> = {
  description: ["description", "item", "name", "line item", "details", "service"],
  category: ["category", "type", "section", "group", "trade"],
  quantity: ["qty", "quantity", "count"],
  unit: ["unit", "uom", "measure"],
  unit_price: ["unit price", "rate", "price", "cost", "unit cost"],
  total: ["total", "amount", "subtotal", "line total", "extended"],
};

export const autoMap = (headers: string[]): Record<FieldKey, string | null> => {
  const result = { description: null, category: null, quantity: null, unit: null, unit_price: null, total: null } as Record<FieldKey, string | null>;
  for (const key of Object.keys(HINTS) as FieldKey[]) {
    const found = headers.find((h) => {
      const norm = h.toLowerCase().trim();
      return HINTS[key].some((hint) => norm === hint || norm.includes(hint));
    });
    result[key] = found ?? null;
  }
  return result;
};

export interface MappedItem {
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}

const num = (v: any): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};

export const applyMapping = (rows: RawRow[], mapping: Record<FieldKey, string | null>): MappedItem[] =>
  rows
    .map((r) => {
      const qty = mapping.quantity ? num(r[mapping.quantity]) : 1;
      const price = mapping.unit_price ? num(r[mapping.unit_price]) : 0;
      const totalRaw = mapping.total ? num(r[mapping.total]) : 0;
      const total = totalRaw || qty * price;
      return {
        description: String((mapping.description && r[mapping.description]) ?? "").trim(),
        category: String((mapping.category && r[mapping.category]) ?? "").trim(),
        quantity: qty || 1,
        unit: String((mapping.unit && r[mapping.unit]) ?? "").trim(),
        unit_price: price,
        total,
      };
    })
    .filter((i) => i.description.length > 0 || i.total > 0);
