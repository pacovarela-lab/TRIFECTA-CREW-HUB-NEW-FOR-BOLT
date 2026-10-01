/**
 * Importación automática de CSV de conciliación bancaria.
 *
 * Uso: bun scripts/import-bank-csv.ts [archivo.csv ...]
 * Sin argumentos toma todos los .csv de imports/bank/ (sin entrar a processed/).
 *
 * Requiere en el entorno:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, IMPORT_USER_EMAIL, IMPORT_USER_PASSWORD
 *
 * No borra ni modifica movimientos existentes: sólo inserta lo nuevo.
 */
import { readdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseBofaCsv, detectFromDescription, type Detection } from "../src/lib/bankDetect";

const IMPORT_DIR = "imports/bank";

const need = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return value;
};

const collectFiles = (): string[] => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length) return args;
  try {
    return readdirSync(IMPORT_DIR)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .sort()
      .map((f) => join(IMPORT_DIR, f));
  } catch {
    return [];
  }
};

const naturalKey = (r: { posted_on: string; amount: number | string; description: string }) =>
  `${r.posted_on}|${Number(r.amount).toFixed(2)}|${String(r.description).trim()}`;

interface FileResult {
  file: string;
  imported: number;
  duplicates: number;
  pending: number;
  warnings: string[];
}

const main = async () => {
  const files = collectFiles();
  if (!files.length) {
    console.log("No hay archivos CSV nuevos en imports/bank/. Nada que importar.");
    writeSummary([], "sin-archivos");
    return;
  }

  const supabase = createClient(need("SUPABASE_URL"), need("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: need("IMPORT_USER_EMAIL"),
    password: need("IMPORT_USER_PASSWORD"),
  });
  if (authError || !auth?.user) {
    console.error("No se pudo iniciar sesión con la cuenta de importación.");
    process.exit(1);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", auth.user.id)
    .single();
  if (profileError || !profile?.company_id) {
    console.error("La cuenta de importación no tiene empresa asignada.");
    process.exit(1);
  }
  const companyId = profile.company_id as string;

  const [w, c, p] = await Promise.all([
    supabase.from("workers").select("id, name").eq("company_id", companyId),
    supabase.from("clients").select("id, name").eq("company_id", companyId),
    supabase.from("projects").select("id, name, project_code").eq("company_id", companyId),
  ]);
  const ctx = {
    workers: (w.data ?? []).filter((x: any) => x?.name),
    clients: (c.data ?? []).filter((x: any) => x?.name),
    projects: (p.data ?? []).filter((x: any) => x?.name),
  } as any;

  const results: FileResult[] = [];

  for (const file of files) {
    const parsed = parseBofaCsv(readFileSync(file, "utf8"));
    if (!parsed.rows.length) {
      results.push({ file, imported: 0, duplicates: 0, pending: 0, warnings: ["No se encontraron movimientos válidos"] });
      continue;
    }

    const inserts = parsed.rows.map((r) => {
      const detection = detectFromDescription(r.description, r.amount, ctx);
      const needsReview = (detection?.flags?.length ?? 0) > 0 || r.warnings.length > 0;
      return {
        company_id: companyId,
        posted_on: r.posted_on,
        description: r.description,
        amount: r.amount,
        running_balance: r.running_balance,
        source: "bofa",
        direction: r.amount < 0 ? "debit" : "credit",
        status: needsReview ? "review" : "unmatched",
        raw: { row: r.raw_row, parse_warnings: r.warnings, detection, imported_by: "github-action" },
      };
    });

    const dates = inserts.map((r) => r.posted_on).sort();
    const { data: existingRows, error: existingError } = await supabase
      .from("bank_transactions")
      .select("posted_on, amount, description")
      .eq("company_id", companyId)
      .gte("posted_on", dates[0])
      .lte("posted_on", dates[dates.length - 1]);
    if (existingError) throw existingError;

    const existingKeys = new Set((existingRows ?? []).map((r: any) => naturalKey(r)));
    const seen = new Set<string>();
    const fresh = inserts.filter((r) => {
      const key = naturalKey(r);
      if (existingKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const duplicates = inserts.length - fresh.length;

    let imported = 0;
    let pending = 0;
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      const { data, error } = await supabase
        .from("bank_transactions")
        .insert(chunk)
        .select("id, status");
      if (error) throw error;
      imported += data?.length ?? 0;
      pending += (data ?? []).filter((r: any) => r.status === "review").length;
    }

    results.push({ file, imported, duplicates, pending, warnings: parsed.warnings.slice(0, 5) });
    console.log(`${file}: ${imported} importados · ${duplicates} duplicados · ${pending} a revisar`);
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const totalDup = results.reduce((s, r) => s + r.duplicates, 0);
  const status = totalImported === 0 && totalDup > 0 ? "solo-duplicados" : "ok";
  writeSummary(results, status);
};

const writeSummary = (results: FileResult[], status: string) => {
  const totals = results.reduce(
    (acc, r) => ({
      imported: acc.imported + r.imported,
      duplicates: acc.duplicates + r.duplicates,
      pending: acc.pending + r.pending,
    }),
    { imported: 0, duplicates: 0, pending: 0 },
  );

  const lines =
    status === "sin-archivos"
      ? ["No había archivos CSV para importar."]
      : status === "solo-duplicados"
        ? [`Encontré ${totals.duplicates} duplicados y no se subió el archivo.`]
        : [`${totals.imported} importados · ${totals.duplicates} duplicados · ${totals.pending} a revisar.`];

  for (const r of results) {
    lines.push(`- ${r.file}: ${r.imported} importados, ${r.duplicates} duplicados, ${r.pending} a revisar`);
    for (const warn of r.warnings) lines.push(`  · aviso: ${warn}`);
  }

  const text = lines.join("\n");
  console.log(`\n${text}`);
  writeFileSync("bank-import-summary.txt", `${text}\n`);
  writeFileSync(
    "bank-import-summary.json",
    `${JSON.stringify({ status, totals, files: results }, null, 2)}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Importación de conciliación\n\n${text}\n`);
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `status=${status}\nimported=${totals.imported}\nduplicates=${totals.duplicates}\npending=${totals.pending}\n`,
    );
  }
};

main().catch((error) => {
  console.error("Falló la importación:", error instanceof Error ? error.message : error);
  process.exit(1);
});
