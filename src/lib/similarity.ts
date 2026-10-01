// Lightweight similarity helpers for client/worker dedupe.

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
const digits = (s?: string | null) => (s ?? "").replace(/\D+/g, "");

export interface ContactLike {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface Match<T extends ContactLike> {
  record: T;
  reasons: string[];
  score: number; // 0..1
}

const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

const nameOverlap = (a: string, b: string): number => {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  A.forEach((t) => B.has(t) && hit++);
  return hit / Math.max(A.size, B.size);
};

export const findSimilar = <T extends ContactLike>(
  candidates: T[],
  input: { name?: string; email?: string | null; phone?: string | null; address?: string | null },
): Match<T>[] => {
  const matches: Match<T>[] = [];
  const inName = norm(input.name);
  const inEmail = norm(input.email);
  const inPhone = digits(input.phone);
  const inAddr = norm(input.address);

  for (const c of candidates) {
    const reasons: string[] = [];
    let score = 0;
    if (inEmail && norm(c.email) && norm(c.email) === inEmail) {
      reasons.push("Same email"); score += 1;
    }
    if (inPhone && digits(c.phone) && digits(c.phone) === inPhone) {
      reasons.push("Same phone"); score += 1;
    }
    if (inName) {
      const overlap = nameOverlap(inName, c.name);
      if (norm(c.name) === inName) { reasons.push("Same name"); score += 1; }
      else if (overlap >= 0.6) { reasons.push("Similar name"); score += overlap; }
    }
    if (inAddr && norm(c.address) && norm(c.address) === inAddr) {
      reasons.push("Same address"); score += 0.5;
    }
    if (reasons.length > 0) {
      matches.push({ record: c, reasons, score: Math.min(1, score) });
    }
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
};
