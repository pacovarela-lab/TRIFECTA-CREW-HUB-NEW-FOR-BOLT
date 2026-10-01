// Fuzzy project matching for voice-extracted project names.
// Recognizes variations like "Paco" ↔ "Paco01" ↔ "Paco Varela" ↔ "PAco".

export interface ProjectLike {
  id: string;
  name: string;
  status?: string | null;
  division_id?: string | null;
  client_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface ProjectMatch<T extends ProjectLike> {
  project: T;
  score: number; // 0..1
  reason: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Strip trailing version-ish suffixes (numbers, "-", "_", "01", "v2", etc.)
const stripSuffix = (s: string) => s.replace(/\s*(v?\d+|\(.*\))$/i, "").trim();

const tokens = (s: string) =>
  norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);

// Levenshtein-based ratio for short strings (cheap enough for client lists)
function ratio(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  const dp = Array.from({ length: la + 1 }, () => new Array<number>(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[la][lb];
  return 1 - dist / Math.max(la, lb);
}

function scoreOne(query: string, candidate: string): { score: number; reason: string } {
  const qN = norm(query);
  const cN = norm(candidate);
  const qBase = stripSuffix(qN);
  const cBase = stripSuffix(cN);

  if (qN === cN) return { score: 1, reason: "exact" };
  if (qBase && qBase === cBase) return { score: 0.97, reason: "exact base" };
  if (cBase.startsWith(qBase) || qBase.startsWith(cBase)) return { score: 0.94, reason: "base prefix" };
  if (cN.includes(qN)) return { score: 0.92, reason: "contains" };
  if (qN.includes(cN)) return { score: 0.88, reason: "contained in query" };

  const qTok = tokens(query);
  const cTok = tokens(candidate);
  if (qTok.length && cTok.length) {
    const setC = new Set(cTok);
    let hit = 0;
    for (const t of qTok) if (setC.has(t)) hit++;
    // Strong signal: every query token appears in candidate
    if (hit === qTok.length) {
      return { score: 0.85, reason: "all tokens" };
    }
    if (hit > 0) {
      const tokScore = (hit / qTok.length) * 0.7;
      // Combine with fuzzy similarity for partial matches
      const r = ratio(qBase, cBase);
      return { score: Math.max(tokScore, r * 0.75), reason: "partial tokens" };
    }
  }

  // Pure fuzzy fallback (typos, casing)
  const r = ratio(qBase || qN, cBase || cN);
  return { score: r * 0.7, reason: "fuzzy" };
}

export function matchProjects<T extends ProjectLike>(
  query: string | null | undefined,
  candidates: T[],
  limit = 5,
): ProjectMatch<T>[] {
  if (!query || !query.trim() || !candidates.length) return [];
  const scored = candidates
    .map((project) => {
      const { score, reason } = scoreOne(query, project.name);
      return { project, score, reason };
    })
    .filter((m) => m.score > 0.45)
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
      // Tie-break: active first, then most recently updated
      const aActive = a.project.status === "active" ? 1 : 0;
      const bActive = b.project.status === "active" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (b.project.updated_at ?? "").localeCompare(a.project.updated_at ?? "");
    })
    .slice(0, limit);
  return scored;
}

export interface MatchDecision<T extends ProjectLike> {
  pick: T | null;       // auto-picked project (if confident)
  needsChoice: boolean; // true => UI should ask the user
  candidates: ProjectMatch<T>[];
}

export function decideProjectMatch<T extends ProjectLike>(
  query: string | null | undefined,
  candidates: T[],
): MatchDecision<T> {
  const matches = matchProjects(query, candidates);
  if (!matches.length) return { pick: null, needsChoice: false, candidates: [] };
  const top = matches[0];
  const second = matches[1];
  // High confidence: top score >= 0.9 OR clear gap to the next candidate
  const clearWinner = top.score >= 0.9 || !second || top.score - second.score >= 0.2;
  if (clearWinner && top.score >= 0.7) {
    return { pick: top.project, needsChoice: false, candidates: matches };
  }
  return { pick: null, needsChoice: true, candidates: matches };
}
