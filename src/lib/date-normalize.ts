// Normalize a date value coming from OCR / AI to a local YYYY-MM-DD string.
// Accepts: ISO ("2026-04-23", "2026-04-23T12:34:56Z"), US ("4/23/2026", "04-23-2026"),
// EU ("23/04/2026", "23-04-2026"), long form ("April 23, 2026", "23 abr 2026"), Date objects.
// Returns null if it can't confidently parse the input.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, set: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

const toLocalISO = (y: number, m: number, d: number): string | null => {
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  // Validate the date is real (e.g. Feb 30 -> reject)
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  // Reject obviously wrong years (typos, 2-digit overflow already handled below)
  if (y < 1970 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

const expandYear = (y: number): number => {
  if (y < 100) return y >= 70 ? 1900 + y : 2000 + y;
  return y;
};

export function normalizeReceiptDate(input: unknown): string | null {
  if (input == null) return null;

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return toLocalISO(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }

  let raw = String(input).trim();
  if (!raw) return null;

  // Pure ISO date YYYY-MM-DD — keep as-is (no timezone shift)
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return toLocalISO(+isoDate[1], +isoDate[2], +isoDate[3]);
  }

  // ISO datetime — extract calendar date in UTC to avoid local-tz day shifts
  const isoDateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/);
  if (isoDateTime) {
    return toLocalISO(+isoDateTime[1], +isoDateTime[2], +isoDateTime[3]);
  }

  // Numeric separators: M/D/Y, D/M/Y, Y/M/D with - . or /
  const numeric = raw.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (numeric) {
    let [, a, b, c] = numeric;
    const ai = +a, bi = +b, ci = +c;
    // Y-M-D when first part is 4 digits
    if (a.length === 4) {
      return toLocalISO(ai, bi, ci);
    }
    // Y at end
    const year = expandYear(ci);
    // Heuristic: if first > 12, it must be day -> D/M/Y (EU)
    if (ai > 12) return toLocalISO(year, bi, ai);
    // If second > 12, it must be day -> M/D/Y (US)
    if (bi > 12) return toLocalISO(year, ai, bi);
    // Ambiguous: default to M/D/Y (US format, common in receipts)
    return toLocalISO(year, ai, bi);
  }

  // Long form: "April 23, 2026" / "23 de abril de 2026" / "23-Apr-2026"
  const lower = raw.toLowerCase().replace(/[,.]/g, " ").replace(/\s+de\s+/g, " ");
  const monthFirst = lower.match(/^([a-záéíóúñ]+)\s+(\d{1,2})\s+(\d{2,4})$/);
  if (monthFirst) {
    const m = MONTHS[monthFirst[1]];
    if (m) return toLocalISO(expandYear(+monthFirst[3]), m, +monthFirst[2]);
  }
  const dayFirst = lower.match(/^(\d{1,2})[\s\-]+([a-záéíóúñ]+)[\s\-]+(\d{2,4})$/);
  if (dayFirst) {
    const m = MONTHS[dayFirst[2]];
    if (m) return toLocalISO(expandYear(+dayFirst[3]), m, +dayFirst[1]);
  }

  // Last resort: let Date parse it, then take LOCAL components
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return toLocalISO(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return null;
}

// Reject dates that are clearly out-of-range for a real receipt.
// Returns the normalized date if plausible, otherwise null.
export function plausibleReceiptDate(input: unknown): string | null {
  const norm = normalizeReceiptDate(input);
  if (!norm) return null;
  const dt = new Date(`${norm}T00:00:00`);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
  if (dt > tomorrow) return null; // future-dated receipt
  if (dt < tenYearsAgo) return null; // suspiciously old
  return norm;
}
