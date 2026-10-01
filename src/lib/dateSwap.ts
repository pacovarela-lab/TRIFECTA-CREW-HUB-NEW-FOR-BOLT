// Swap day/month in an ISO date "YYYY-MM-DD". Returns null if invalid or would produce invalid date.
export function swapDayMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dNum = parseInt(mo, 10); // new day
  const moNum = parseInt(d, 10); // new month
  if (moNum < 1 || moNum > 12 || dNum < 1 || dNum > 31) return null;
  // validate real date
  const dt = new Date(+y, moNum - 1, dNum);
  if (dt.getFullYear() !== +y || dt.getMonth() !== moNum - 1 || dt.getDate() !== dNum) return null;
  return `${y}-${String(moNum).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
}

// Detect whether at least one row has an ambiguous raw date (both interpretations valid and different)
export function hasAmbiguousDates(rawDates: (string | null | undefined)[]): boolean {
  for (const raw of rawDates) {
    if (!raw) continue;
    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a !== b && a <= 12 && b <= 12) return true;
  }
  return false;
}
