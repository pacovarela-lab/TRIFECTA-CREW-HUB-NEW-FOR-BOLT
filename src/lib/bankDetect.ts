// Bank CSV parsing + entity detection for BofA reconciliation.
// Pure functions (no Supabase). Used by BankReconciliation.tsx.

import { csvToObjects } from "@/lib/csv";

// ============================================================
// Types
// ============================================================

export interface DetectionEntity {
  id: string;
  name: string;
  score: number; // 0..1 — how confident the match is
}

export type RawKind =
  | "zelle_out"
  | "zelle_in"
  | "venmo_out"
  | "venmo_in"
  | "cashapp_out"
  | "cashapp_in"
  | "card_purchase"
  | "ach_debit"
  | "ach_credit"
  | "wire_in"
  | "wire_out"
  | "check"
  | "fee"
  | "interest"
  | "transfer"
  | "deposit"
  | "withdrawal"
  | "unknown";

export interface Detection {
  vendor: string | null;            // best-effort vendor/payee name
  vendor_confidence: number;        // 0..1
  worker: DetectionEntity | null;   // for debits to a person
  worker_candidates: DetectionEntity[];
  client: DetectionEntity | null;   // for credits from a person/company
  client_candidates: DetectionEntity[];
  project: DetectionEntity | null;  // from explicit code or name
  project_candidates: DetectionEntity[];
  category_guess: string | null;    // from VENDOR_CATEGORY_RULES
  raw_kind: RawKind;
  flags: string[];                  // human-readable reasons to review
}

export interface ParsedRow {
  posted_on: string;          // YYYY-MM-DD
  description: string;
  amount: number;             // signed: negative=debit, positive=credit
  running_balance: number | null;
  raw_row: Record<string, string>;
  warnings: string[];         // per-row parse warnings
}

export interface ParseResult {
  rows: ParsedRow[];
  skipped: number;
  warnings: string[];         // file-level warnings
  header_found: boolean;
}

// ============================================================
// Date / amount helpers
// ============================================================

const pad2 = (s: string) => s.padStart(2, "0");

export const parseDate = (s: any): string | null => {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // MM/DD/YYYY or MM/DD/YY
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  // MM-DD-YYYY
  m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  // YYYY-MM-DD
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  return null;
};

export const parseAmount = (s: any): number | null => {
  if (s === null || s === undefined || s === "") return null;
  const str = String(s).trim();
  if (!str) return null;
  // (123.45) => negative
  const neg = /^\(.*\)$/.test(str);
  const cleaned = str.replace(/[(),$\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
};

// ============================================================
// Normalization
// ============================================================

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const PERSON_ALIASES: Record<string, string> = {
  nicolas: "nick",
  nicholas: "nick",
  nickolas: "nick",
};
const norm = (s: string) => stripAccents(String(s || "")).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const canonToken = (token: string) => PERSON_ALIASES[token] ?? token;
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length >= 2).map(canonToken);
const normWithAliases = (s: string) => tokens(s).join(" ");

const tokenJaccard = (a: string, b: string): number => {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
};

// Substring containment: 1 if all of B's tokens appear in A, partial otherwise
const containmentScore = (haystack: string, needle: string): number => {
  const H = normWithAliases(haystack);
  const N = tokens(needle);
  if (!N.length) return 0;
  let hit = 0;
  for (const t of N) if (H.includes(t)) hit++;
  return hit / N.length;
};

// ============================================================
// Vendor cleanup + raw kind detection
// ============================================================

const NOISE_RE = /\b(MOBILE PURCHASE|PURCHASE|DEBIT CARD|CKCD|DES:|ID:|INDN:|CO ID:|CCD|PPD|ACH|WITHDRWL|WITHDRAWAL|DEPOSIT|AUTHORIZED ON \d+\/\d+|CONF#|REF#|RECURRING|POS|ATM|FOREIGN TRANSACTION)\b/gi;

export const detectRawKind = (desc: string, amount: number): RawKind => {
  const d = desc.toUpperCase();
  if (/ZELLE\s+(PAYMENT|TRANSFER|TRANS\.?)\s+TO\b/.test(d)) return "zelle_out";
  if (/ZELLE\s+(PAYMENT|TRANSFER|TRANS\.?|DEPOSIT)\s+FROM\b/.test(d)) return "zelle_in";
  if (/\bVENMO\b.*\b(PAYMENT|TRANSFER)\b/.test(d) && amount < 0) return "venmo_out";
  if (/\bVENMO\b/.test(d) && amount > 0) return "venmo_in";
  if (/\bCASH\s*APP\b|CASHAPP/.test(d)) return amount < 0 ? "cashapp_out" : "cashapp_in";
  if (/\bWIRE\s+(TRANSFER|TYPE:WIRE)/.test(d)) return amount > 0 ? "wire_in" : "wire_out";
  if (/\bCHECK\b\s*#?\d/.test(d) || /^CHECK\b/.test(d)) return "check";
  if (/\b(SERVICE|MAINT(ENANCE)?|OVERDRAFT)\s+FEE\b/.test(d) || /\bFEE\b$/.test(d)) return "fee";
  if (/\bINTEREST\b/.test(d)) return "interest";
  if (/\b(TRANSFER|ONLINE BANKING TRANSFER)\b/.test(d)) return "transfer";
  if (/\bDEBIT CARD|MOBILE PURCHASE|PURCHASE\b/.test(d)) return "card_purchase";
  if (/\bACH\b/.test(d) || /\bDES:\b/.test(d)) return amount < 0 ? "ach_debit" : "ach_credit";
  if (amount > 0 && /\bDEPOSIT\b/.test(d)) return "deposit";
  if (amount < 0 && /\bWITHDRAWAL|WITHDRWL\b/.test(d)) return "withdrawal";
  return "unknown";
};

// Pull the most likely payee/vendor substring from the description.
export const extractPayeeName = (desc: string, kind: RawKind): { name: string | null; confidence: number } => {
  const d = String(desc || "").trim();
  if (!d) return { name: null, confidence: 0 };

  // Plastiq (ACH processor): the real payer/client is inside "PMT INFO:EST-#### [suffix] <Name> ..."
  // Example: "Plastiq Nicholas DES:PQ ... PMT INFO:EST-10211-2nd Nicholas Julian Remaining amount..."
  if (/\bplastiq\b/i.test(d)) {
    const pm = d.match(/PMT\s*INFO:\s*(?:EST-?\d+(?:-\w+)?\s+)?([A-Za-z][A-Za-z .'-]{2,60}?)(?=\s+(?:\d|for\b|Remaining\b|deposit\b|balance\b|payment\b|final\b|st\b|ave\b|rd\b|blvd\b|ln\b|dr\b|ct\b|pl\b|#)|$)/i);
    if (pm) return { name: cleanName(pm[1]), confidence: 0.9 };
    // Fallback: name after "INDN:" (originator name on ACH)
    const indn = d.match(/INDN:\s*([A-Za-z][A-Za-z .'&-]{2,60}?)(?=\s+CO\s+ID|\s+ID:|\s+CCD|\s+PPD|\s+PMT|$)/i);
    if (indn && !/trifecta/i.test(indn[1])) return { name: cleanName(indn[1]), confidence: 0.6 };
  }

  // Zelle/Venmo/Cashapp: explicit recipient/sender name
  let m: RegExpMatchArray | null;
  if (kind === "zelle_out") {
    m = d.match(/Zelle\s+(?:payment|transfer|trans\.?)\s+to\s+(.+?)(?:\s+(?:for|on|Conf#|Ref#|;)|$)/i);
    if (m) return { name: cleanName(m[1]), confidence: 0.95 };
  }
  if (kind === "zelle_in") {
    m = d.match(/Zelle\s+(?:payment|transfer|trans\.?|deposit)\s+from\s+(.+?)(?:\s+(?:for|on|Conf#|Ref#|;)|$)/i);
    if (m) return { name: cleanName(m[1]), confidence: 0.95 };
  }
  if (kind === "venmo_out" || kind === "venmo_in" || kind === "cashapp_out" || kind === "cashapp_in") {
    m = d.match(/(?:VENMO|CASH\s*APP|CASHAPP)[^A-Za-z]+([A-Za-z][A-Za-z .'-]{2,40})/i);
    if (m) return { name: cleanName(m[1]), confidence: 0.7 };
  }
  if (kind === "wire_in" || kind === "wire_out") {
    m = d.match(/(?:FROM|TO|BNF=|ORG=)\s*[:\/]?\s*([A-Za-z][A-Za-z0-9 .'&,-]{3,60})/i);
    if (m) return { name: cleanName(m[1]), confidence: 0.6 };
  }

  // Card purchase / generic: strip noise + tail metadata
  const cleaned = d
    .replace(NOISE_RE, "")
    .replace(/\*\d+/g, "")
    .replace(/\s+\d{2}\/\d{2}(?:\/\d{2,4})?.*/, "")
    .replace(/\s+\d{10,}.*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) return { name: null, confidence: 0 };
  const name = cleanName(cleaned.split(" ").slice(0, 5).join(" "));
  const confidence = kind === "card_purchase" ? 0.55 : kind === "ach_debit" || kind === "ach_credit" ? 0.45 : 0.35;
  return { name, confidence };
};

const cleanName = (raw: string) =>
  raw.replace(/[.;,]+$/g, "").replace(/\s+/g, " ").trim();

// ============================================================
// Vendor → category rules (mirrors process-receipt edge function)
// ============================================================

const VENDOR_CATEGORY_RULES: Array<{ patterns: RegExp[]; category: string }> = [
  { patterns: [/home\s*depot/i, /lowe'?s/i, /menards/i, /ferreter/i, /truper/i, /ace\s*hardware/i, /84\s*lumber/i, /sherwin\s*williams/i, /floor\s*&\s*decor/i], category: "Materiales" },
  { patterns: [/shell/i, /chevron/i, /pemex/i, /mobil/i, /exxon/i, /\bbp\b/i, /arco/i, /valero/i, /\b76\b/i, /gasoline/i, /gasolinera/i, /circle\s*k/i, /\b7-?eleven\b/i], category: "Combustible" },
  { patterns: [/uber/i, /lyft/i, /\btaxi\b/i, /\btoll\b/i, /peaje/i, /parking/i, /estacionamiento/i, /fastrak/i, /e-?zpass/i], category: "Transporte" },
  { patterns: [/mcdonald/i, /burger\s*king/i, /starbucks/i, /chipotle/i, /subway/i, /restaurante/i, /\bcafe\b/i, /taqueria/i, /pizzeria/i, /panda\s*express/i, /chick-?fil-?a/i, /\bdoordash\b/i, /\bgrubhub\b/i], category: "Comida" },
  { patterns: [/harbor\s*freight/i, /\bdewalt\b/i, /milwaukee/i, /makita/i, /herramienta/i, /northern\s*tool/i], category: "Herramientas" },
  { patterns: [/at&t/i, /verizon/i, /t-?mobile/i, /telcel/i, /movistar/i, /comcast/i, /xfinity/i, /spectrum/i, /\bpge\b|\bp\.g\.&e\.?\b/i, /\bedison\b/i], category: "Servicios" },
  { patterns: [/\busps\b/i, /\bups\b/i, /fedex/i, /\bdhl\b/i], category: "Envíos" },
];

const guessCategory = (vendor: string | null, description: string): string | null => {
  const haystack = `${vendor ?? ""} ${description}`;
  for (const rule of VENDOR_CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.category;
  }
  return null;
};

// ============================================================
// Entity matching
// ============================================================

const matchEntities = <T extends { id: string; name: string }>(
  candidates: T[],
  needle: string,
  minScore: number,
): DetectionEntity[] => {
  if (!needle) return [];
  const scored = candidates
    .map((c) => {
      const jacc = tokenJaccard(c.name, needle);
      const cont = containmentScore(needle, c.name);
      const score = Math.max(jacc, cont * 0.9);
      return { id: c.id, name: c.name, score };
    })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
};

const PROJECT_CODE_RE = /\b((?:TR|JOB|PRJ|PROJ)[-_ ]?\d{2,6}|#\s*\d{3,6})\b/i;

const matchProject = (desc: string, projects: { id: string; name: string; project_code?: string | null }[]): DetectionEntity[] => {
  const codeMatch = desc.match(PROJECT_CODE_RE);
  if (codeMatch) {
    const code = codeMatch[1].replace(/\s+/g, "").replace(/^#/, "");
    const direct = projects.find((p) => {
      const pc = (p.project_code || "").replace(/\s+/g, "");
      return pc && (pc.toLowerCase() === code.toLowerCase() || pc.toLowerCase().endsWith(code.toLowerCase()));
    });
    if (direct) return [{ id: direct.id, name: direct.project_code || direct.name, score: 0.98 }];
  }
  // Fall back to name fuzzy
  return matchEntities(projects, desc, 0.5);
};

// ============================================================
// Main detection
// ============================================================

export interface DetectionContext {
  workers: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; project_code?: string | null }[];
}

export const detectFromDescription = (
  description: string,
  amount: number,
  ctx: DetectionContext,
): Detection => {
  const flags: string[] = [];
  const isDebit = amount < 0;
  const kind = detectRawKind(description, amount);
  const { name: vendor, confidence: vendorConf } = extractPayeeName(description, kind);

  if (!vendor) flags.push("Sin vendor/payee identificable");
  else if (vendorConf < 0.5) flags.push("Vendor extraído con baja confianza");

  // Worker (only on debits)
  let workerCandidates: DetectionEntity[] = [];
  if (isDebit && vendor && (kind === "zelle_out" || kind === "venmo_out" || kind === "cashapp_out" || kind === "check")) {
    workerCandidates = matchEntities(ctx.workers, vendor, 0.45);
    if (workerCandidates.length > 1 && workerCandidates[0].score - workerCandidates[1].score < 0.1) {
      flags.push(`Múltiples trabajadores posibles (${workerCandidates.length})`);
    }
    if (!workerCandidates.length && kind === "zelle_out") flags.push("Pago Zelle sin trabajador reconocido");
  }

  // Client (only on credits)
  let clientCandidates: DetectionEntity[] = [];
  if (!isDebit && vendor && (kind === "zelle_in" || kind === "venmo_in" || kind === "cashapp_in" || kind === "wire_in" || kind === "ach_credit" || kind === "deposit")) {
    clientCandidates = matchEntities(ctx.clients, vendor, 0.45);
    if (clientCandidates.length > 1 && clientCandidates[0].score - clientCandidates[1].score < 0.1) {
      flags.push(`Múltiples clientes posibles (${clientCandidates.length})`);
    }
    if (!clientCandidates.length && (kind === "zelle_in" || kind === "wire_in")) flags.push("Depósito sin cliente reconocido");
  }

  // Project — try description as a whole, then vendor
  const projectCandidates = matchProject(description, ctx.projects);

  // Category
  const category = guessCategory(vendor, description);
  if (isDebit && kind === "card_purchase" && !category) flags.push("Compra sin categoría sugerida");

  // Amount sanity
  if (Math.abs(amount) >= 10000) flags.push("Monto > $10,000 — revisa");
  if (Math.abs(amount) < 1 && Math.abs(amount) > 0) flags.push("Monto muy pequeño — revisa");

  return {
    vendor,
    vendor_confidence: vendor ? vendorConf : 0,
    worker: workerCandidates[0] ?? null,
    worker_candidates: workerCandidates,
    client: clientCandidates[0] ?? null,
    client_candidates: clientCandidates,
    project: projectCandidates[0] ?? null,
    project_candidates: projectCandidates,
    category_guess: category,
    raw_kind: kind,
    flags,
  };
};

// ============================================================
// Parser (BofA-only, single Amount column)
// ============================================================

const isBalanceLine = (desc: string) =>
  /^(beginning|ending|starting|previous|current)\s+(balance|bal\.?)/i.test(desc.trim());

const csvCell = (raw: string): string => {
  let s = (raw ?? "").trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
  return s.replace(/""/g, '"').trim();
};

const escapeCsvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

// BofA exports embed unescaped double quotes inside the description
// (e.g. Zelle payment to X for "Week"; Conf# ...), which breaks strict CSV
// parsing and shifts the Amount/Running Bal. columns. Re-emit each data line
// as valid CSV by anchoring on the leading date and the two trailing numbers.
export const repairBofaLine = (line: string): string | null => {
  const m = line.match(
    /^\s*"?(\d{1,2}\/\d{1,2}\/\d{2,4})"?\s*,(.*?),\s*("?-?[\d,]+\.\d{2}"?|)\s*,\s*("?-?[\d,]+\.\d{2}"?|)\s*$/,
  );
  if (!m) return null;
  const [, date, descRaw, amountRaw, balRaw] = m;
  return [
    date,
    escapeCsvCell(csvCell(descRaw)),
    escapeCsvCell(csvCell(amountRaw)),
    escapeCsvCell(csvCell(balRaw)),
  ].join(",");
};

export const parseBofaCsv = (text: string): ParseResult => {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);
  // BofA: 5 summary rows + blank + header "Date,Description,Amount,Running Bal."
  const hdrIdx = lines.findIndex((l) => /^\s*"?date"?\s*,\s*"?description"?\s*,\s*"?amount"?/i.test(l));
  const header_found = hdrIdx >= 0;
  if (!header_found) warnings.push("No se encontró el header 'Date,Description,Amount'. Intentando parsear igualmente.");

  const bodyLines = hdrIdx >= 0 ? lines.slice(hdrIdx) : lines;
  const body = bodyLines
    .map((l, idx) => (idx === 0 && hdrIdx >= 0 ? l : repairBofaLine(l) ?? l))
    .join("\n");
  const rows = csvToObjects(body);


  const result: ParsedRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    const dateRaw = r["Date"] ?? r["date"] ?? r["Posted Date"] ?? r["Posting Date"];
    const desc = String(r["Description"] ?? r["description"] ?? "").trim();
    const amt = parseAmount(r["Amount"] ?? r["amount"]);
    const bal = parseAmount(r["Running Bal."] ?? r["Running Balance"] ?? r["running_bal"]);
    const posted = parseDate(dateRaw);

    if (!desc) { skipped++; continue; }
    if (isBalanceLine(desc)) { skipped++; continue; }
    if (!posted) { skipped++; warnings.push(`Fila descartada: fecha no reconocida "${dateRaw}"`); continue; }
    if (amt === null || amt === 0) { skipped++; continue; }

    const rowWarnings: string[] = [];
    // Reject obviously broken dates (e.g. year < 2000 or > +1y)
    const y = Number(posted.slice(0, 4));
    const now = new Date().getUTCFullYear();
    if (y < 2000 || y > now + 1) rowWarnings.push("Fecha fuera de rango razonable");

    result.push({
      posted_on: posted,
      description: desc,
      amount: amt,
      running_balance: bal,
      raw_row: r,
      warnings: rowWarnings,
    });
  }

  return { rows: result, skipped, warnings, header_found };
};

// ============================================================
// Matching (strict)
// ============================================================

export interface MatchCandidate {
  id: string;
  amount: number;
  date: string;            // YYYY-MM-DD
  vendor_name?: string | null;
  client_name?: string | null;
  description?: string | null;
  project_id?: string | null;
}

export interface MatchResult {
  candidate: MatchCandidate | null;
  confidence: number;
  breakdown: { amount: number; date: number; vendor: number; project: number };
  status: "matched" | "suggested" | "none";
  alternatives: { id: string; confidence: number }[];
}

export const STRICT_TOLERANCES = {
  amount: 0.01,
  daysWindow: 2,
  matchedThreshold: 0.85,
  suggestThreshold: 0.5,
};

export const scoreMatch = (
  tx: { amount: number; posted_on: string },
  detection: Detection,
  cand: MatchCandidate,
): { confidence: number; breakdown: { amount: number; date: number; vendor: number; project: number } } => {
  const amtDiff = Math.abs(cand.amount - Math.abs(tx.amount));
  if (amtDiff > STRICT_TOLERANCES.amount) return { confidence: 0, breakdown: { amount: 0, date: 0, vendor: 0, project: 0 } };

  const days = Math.abs((new Date(cand.date).getTime() - new Date(tx.posted_on).getTime()) / 86400000);
  if (days > STRICT_TOLERANCES.daysWindow) return { confidence: 0, breakdown: { amount: 0, date: 0, vendor: 0, project: 0 } };

  const amountScore = 0.50;
  const dateScore = days <= 0.5 ? 0.20 : days <= 1.5 ? 0.13 : 0.07;

  // Vendor / client similarity
  let vendorScore = 0;
  const candName = cand.vendor_name || cand.client_name || "";
  if (detection.vendor && candName) {
    const j = tokenJaccard(detection.vendor, candName);
    const c = containmentScore(detection.vendor, candName);
    vendorScore = Math.min(0.25, Math.max(j, c) * 0.25);
  }

  // Project match
  let projectScore = 0;
  if (detection.project && cand.project_id && detection.project.id === cand.project_id) {
    projectScore = 0.10;
  }

  const confidence = Math.min(1, amountScore + dateScore + vendorScore + projectScore);
  return { confidence, breakdown: { amount: amountScore, date: dateScore, vendor: vendorScore, project: projectScore } };
};

export const pickBestMatch = (
  tx: { amount: number; posted_on: string },
  detection: Detection,
  candidates: MatchCandidate[],
): MatchResult => {
  const scored = candidates
    .map((c) => ({ c, ...scoreMatch(tx, detection, c) }))
    .filter((x) => x.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  if (!scored.length) return { candidate: null, confidence: 0, breakdown: { amount: 0, date: 0, vendor: 0, project: 0 }, status: "none", alternatives: [] };
  const top = scored[0];
  const status: MatchResult["status"] =
    top.confidence >= STRICT_TOLERANCES.matchedThreshold ? "matched"
    : top.confidence >= STRICT_TOLERANCES.suggestThreshold ? "suggested"
    : "none";

  return {
    candidate: top.c,
    confidence: top.confidence,
    breakdown: top.breakdown,
    status,
    alternatives: scored.slice(1, 4).map((s) => ({ id: s.c.id, confidence: s.confidence })),
  };
};
