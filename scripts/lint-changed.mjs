import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const gitLines = (...args) => execFileSync("git", args, { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const hasRef = (ref) => spawnSync("git", ["rev-parse", "--verify", "--quiet", ref]).status === 0;
const baseBranch = process.env.GITHUB_BASE_REF || "main";
const baseRef = `origin/${baseBranch}`;

if (!hasRef(baseRef)) {
  console.error(`No se encontró ${baseRef}. Asegúrate de hacer fetch de la rama base del PR.`);
  process.exit(1);
}

const branch = gitLines("branch", "--show-current")[0] ?? "(HEAD separado)";
const mergeBase = gitLines("merge-base", "HEAD", baseRef)[0];
if (!mergeBase) {
  console.error(`No se pudo determinar el merge-base entre HEAD y ${baseRef}.`);
  process.exit(1);
}

const files = gitLines("diff", "--name-only", "--diff-filter=ACMR", mergeBase, "HEAD")
  .filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file))
  .filter((file) => !/(?:^|\/)(?:dist|coverage|node_modules|tmp|temp|generated)(?:\/|$)/i.test(file));

console.log(`Rama: ${branch}`);
console.log(`Merge-base: ${mergeBase}`);
console.log(`ESLint de alcance: ${files.length} archivos`);
files.forEach((file) => console.log(`- ${file}`));

if (files.length === 0) {
  console.log(`No hay archivos JavaScript o TypeScript modificados respecto de ${baseRef}.`);
  process.exit(0);
}

const eslint = spawnSync(
  process.execPath,
  [resolve("node_modules/eslint/bin/eslint.js"), ...files],
  { stdio: "inherit" },
);
process.exit(eslint.status ?? 1);
