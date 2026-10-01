/** Normaliza nombres para comparación: minúsculas, sin acentos, espacios colapsados. */
export const normalizeName = (s: string | null | undefined): string =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Encuentra un registro existente cuyo `name` normalizado coincide con `candidate`. */
export const findByNormalizedName = <T extends { name?: string | null }>(
  list: T[] | undefined | null,
  candidate: string | null | undefined,
): T | undefined => {
  if (!candidate) return undefined;
  const target = normalizeName(candidate);
  if (!target) return undefined;
  return (list ?? []).find((it) => normalizeName(it.name) === target);
};

/** Normaliza fecha a YYYY-MM-DD. Acepta ISO, MM/DD/YYYY, DD/MM/YYYY, etc. Devuelve null si inválida. */
export const normalizeDate = (input: string | null | undefined): string | null => {
  if (!input) return null;
  const s = input.toString().trim();
  if (!s) return null;
  // ISO YYYY-MM-DD ya formado
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // numérico con separadores
  const m = s.match(/^(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})$/);
  if (m) {
    let [_, a, b, c] = m;
    let yyyy: string, mm: string, dd: string;
    if (a.length === 4) {
      yyyy = a; mm = b.padStart(2, "0"); dd = c.padStart(2, "0");
    } else if (c.length === 4) {
      // Asume MM/DD/YYYY (US, BofA, recibos USA). Si mes > 12, intercambia.
      let mi = parseInt(a, 10), di = parseInt(b, 10);
      if (mi > 12 && di <= 12) { [mi, di] = [di, mi]; }
      yyyy = c; mm = String(mi).padStart(2, "0"); dd = String(di).padStart(2, "0");
    } else {
      return null;
    }
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
    return `${yyyy}-${mm}-${dd}`;
  }
  // último intento: Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
};
