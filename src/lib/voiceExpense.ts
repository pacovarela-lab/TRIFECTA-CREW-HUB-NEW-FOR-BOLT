import { z } from "zod";

const nullableText = z.string().trim().nullable();
const confidence = z.number().finite().min(0).max(1).catch(0);

export const voiceExpenseSchema = z.object({
  transcript: z.string().trim().min(1),
  language: z.enum(["es", "en", "mixed"]).nullable(),
  vendor: z.object({ raw: nullableText, normalized: nullableText, confidence }),
  amount: z.object({
    value: z.number().finite().positive().nullable(),
    currency: nullableText,
    confidence,
  }),
  project: z.object({
    raw: nullableText,
    matched_id: nullableText,
    matched_code: nullableText,
    matched_name: nullableText,
    confidence,
    alternatives: z.array(z.object({
      id: z.string(),
      code: nullableText,
      name: z.string(),
      confidence,
    })).catch([]),
  }),
  category: z.object({
    raw: nullableText,
    matched_id: nullableText,
    matched_name: nullableText,
    confidence,
  }),
  subcategory: z.object({ raw: nullableText, matched_name: nullableText, confidence }),
  paid_by: z.object({
    raw: nullableText,
    matched_worker_id: nullableText,
    matched_name: nullableText,
    confidence,
  }),
  payment_method: z.object({ raw: nullableText, matched_value: nullableText, confidence }),
  description: z.object({ value: nullableText, confidence }),
  date: z.object({ value: nullableText, confidence }),
  needs_review: z.array(z.string()).catch([]),
  warnings: z.array(z.string()).catch([]),
});

export type VoiceExpense = z.infer<typeof voiceExpenseSchema>;

export type VoiceCatalogs = {
  projects: Array<{
    id: string;
    name: string;
    project_code?: string | null;
    address?: string | null;
    status?: string | null;
    updated_at?: string | null;
    division_id?: string | null;
    clients?: { name?: string | null; address?: string | null } | null;
  }>;
  workers: Array<{ id: string; name: string; active?: boolean | null }>;
  vendors: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  paymentMethods: Array<{ value: string; label: string }>;
};

export const normalizeVoiceText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeMatchText = (value: string) => {
  const digitWords: Record<string, string> = {
    zero: "0", cero: "0", one: "1", uno: "1", two: "2", dos: "2", three: "3", tres: "3",
    four: "4", cuatro: "4", five: "5", cinco: "5", six: "6", seis: "6", seven: "7", siete: "7",
    eight: "8", ocho: "8", nine: "9", nueve: "9",
  };
  return normalizeVoiceText(value)
    .split(" ")
    .map((token) => digitWords[token] ?? token)
    .join(" ")
    .replace(/(?<=\d)\s+(?=\d)/g, "");
};

const levenshteinRatio = (left: string, right: string) => {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const rows = Array.from({ length: left.length + 1 }, (_, i) =>
    Array.from({ length: right.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
  }
  return 1 - rows[left.length][right.length] / Math.max(left.length, right.length);
};

export const scoreVoiceMatch = (query: string, candidate: string) => {
  const q = normalizeMatchText(query);
  const c = normalizeMatchText(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return Math.min(0.96, 0.82 + Math.min(q.length, c.length) / Math.max(q.length, c.length) * 0.14);
  const qTokens = q.split(" ");
  const cTokens = new Set(c.split(" "));
  const overlap = qTokens.filter((token) => cTokens.has(token)).length / qTokens.length;
  return Math.max(levenshteinRatio(q, c) * 0.86, overlap * 0.9);
};

const rank = <T>(query: string | null, items: T[], searchable: (item: T) => string[]) => {
  if (!query) return [] as Array<{ item: T; score: number }>;
  return items
    .map((item) => ({
      item,
      score: Math.max(...searchable(item).filter(Boolean).map((text) => scoreVoiceMatch(query, text)), 0),
    }))
    .filter(({ score }) => score >= 0.58)
    .sort((a, b) => b.score - a.score);
};

const safePick = <T>(matches: Array<{ item: T; score: number }>) => {
  const first = matches[0];
  const second = matches[1];
  if (!first || first.score < 0.78 || (second && first.score - second.score < 0.08)) return null;
  return first;
};

export function resolveVoiceExpense(input: VoiceExpense, catalogs: VoiceCatalogs): VoiceExpense {
  const output = structuredClone(input);
  const review = new Set(output.needs_review);
  const warnings = new Set(output.warnings);

  const projects = rank(output.project.raw, catalogs.projects, (project) => [
    project.name,
    project.project_code ?? "",
    project.address ?? "",
    project.clients?.name ?? "",
    project.clients?.address ?? "",
  ]);
  const project = safePick(projects);
  output.project.matched_id = project?.item.id ?? null;
  output.project.matched_code = project?.item.project_code ?? null;
  output.project.matched_name = project?.item.name ?? null;
  output.project.confidence = project ? Math.min(output.project.confidence, project.score) : 0;
  output.project.alternatives = projects.slice(0, 3).map(({ item, score }) => ({
    id: item.id, code: item.project_code ?? null, name: item.name, confidence: score,
  }));
  if (!project) review.add("project");
  if (projects.length > 1 && projects[0].score - projects[1].score < 0.08) {
    warnings.add("El proyecto es ambiguo; selecciona uno antes de confirmar.");
  }

  const resolveEntity = <T extends { id: string; name: string }>(
    raw: string | null,
    items: T[],
  ) => safePick(rank(raw, items, (item) => [item.name]));

  const vendor = resolveEntity(output.vendor.raw, catalogs.vendors);
  output.vendor.normalized = vendor?.item.name ?? null;
  output.vendor.confidence = vendor ? Math.min(output.vendor.confidence, vendor.score) : 0;
  if (output.vendor.raw && !vendor) review.add("vendor");

  const category = resolveEntity(output.category.raw, catalogs.categories);
  output.category.matched_id = category?.item.id ?? null;
  output.category.matched_name = category?.item.name ?? null;
  output.category.confidence = category ? Math.min(output.category.confidence, category.score) : 0;
  if (!category) review.add("category");

  const worker = safePick(rank(output.paid_by.raw, catalogs.workers, (item) => [item.name]));
  output.paid_by.matched_worker_id = worker?.item.id ?? null;
  output.paid_by.matched_name = worker?.item.name ?? null;
  output.paid_by.confidence = worker ? Math.min(output.paid_by.confidence, worker.score) : 0;
  if (output.paid_by.raw && !worker) review.add("paid_by");

  const method = safePick(rank(output.payment_method.raw, catalogs.paymentMethods, (item) => [item.value, item.label]));
  output.payment_method.matched_value = method?.item.value ?? null;
  output.payment_method.confidence = method ? Math.min(output.payment_method.confidence, method.score) : 0;
  if (output.payment_method.raw && !method) review.add("payment_method");

  const fields: Array<[string, number, unknown]> = [
    ["amount", output.amount.confidence, output.amount.value],
    ["date", output.date.confidence, output.date.value],
    ["description", output.description.confidence, output.description.value],
    ["subcategory", output.subcategory.confidence, output.subcategory.matched_name],
  ];
  fields.forEach(([name, score, value]) => {
    if (value == null || score < 0.98) review.add(name);
  });
  if (output.amount.value == null) warnings.add("No se detectó un monto claro.");
  output.needs_review = [...review];
  output.warnings = [...warnings];
  return output;
}

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0, cero: 0, one: 1, uno: 1, una: 1, two: 2, dos: 2, three: 3, tres: 3,
  four: 4, cuatro: 4, five: 5, cinco: 5, six: 6, seis: 6, seven: 7, siete: 7,
  eight: 8, ocho: 8, nine: 9, nueve: 9, ten: 10, diez: 10, twenty: 20, veinte: 20,
  thirty: 30, treinta: 30, forty: 40, cuarenta: 40, fifty: 50, cincuenta: 50,
  sixty: 60, sesenta: 60, seventy: 70, setenta: 70, eighty: 80, ochenta: 80,
  ninety: 90, noventa: 90, hundred: 100, ciento: 100, cien: 100,
};

export function parseSpokenAmount(text: string): number | null {
  const normalized = normalizeVoiceText(text).replace(/\by\b/g, " ").replace(/\band\b/g, " ");
  const decimalParts = normalized.split(/\b(?:con|point|punto)\b/);
  const parsePart = (part: string) => {
    const numeric = Number(part.trim());
    if (Number.isFinite(numeric)) return numeric;
    let total = 0;
    let current = 0;
    for (const token of part.trim().split(/\s+/)) {
      if (token === "thousand" || token === "mil") {
        total += Math.max(current, 1) * 1000;
        current = 0;
      } else if (token === "hundred" || token === "ciento" || token === "cien") {
        current = Math.max(current, 1) * 100;
      } else if (token in SMALL_NUMBERS) current += SMALL_NUMBERS[token];
    }
    return total + current;
  };
  const whole = parsePart(decimalParts[0]);
  if (!whole && !decimalParts[0].match(/\b(?:zero|cero)\b/)) return null;
  if (decimalParts.length === 1) return whole;
  const decimal = parsePart(decimalParts[1]);
  const digits = decimalParts[1].trim().split(/\s+/).length === 1 && decimal < 10 ? decimal * 10 : decimal;
  return whole + digits / 100;
}
