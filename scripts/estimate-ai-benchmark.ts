/**
 * Reproducible AI Scan quality benchmark.
 *
 * Usage:
 *   npm run estimate-ai:benchmark
 *   npm run estimate-ai:benchmark -- --json out.json
 *   npm run estimate-ai:benchmark -- --compare-baseline docs/estimate-ai-quality-baseline.json
 *   npm run estimate-ai:gate   (falla si baja el total o suben las inventadas)
 *
 * Pure fixtures only: no network, no AI calls, no database access.
 * Exit code 0 when the benchmark ran; 1 when the dataset is empty or a file
 * argument is invalid (never gated on quality metrics in this iteration).
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import {
  runBenchmark,
  formatBenchmarkReport,
  toBaselineSnapshot,
  compareWithBaseline,
  evaluateBenchmarkGate,
  type BaselineSnapshot,
} from "../src/lib/estimateAiBenchmark.ts";
import { ESTIMATE_AI_GOLDEN_DATASET } from "../src/lib/estimateAiBenchmarkFixtures.ts";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const summary = runBenchmark(ESTIMATE_AI_GOLDEN_DATASET);
console.log(formatBenchmarkReport(summary));

const jsonPath = arg("--json");
if (jsonPath) {
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nJSON written to ${jsonPath}`);
}

const snapshotPath = arg("--snapshot");
if (snapshotPath) {
  writeFileSync(snapshotPath, `${JSON.stringify(toBaselineSnapshot(summary), null, 2)}\n`);
  console.log(`Snapshot written to ${snapshotPath}`);
}

const baselinePath = arg("--compare-baseline");
if (baselinePath) {
  if (!existsSync(baselinePath)) {
    console.error(`Baseline file not found: ${baselinePath}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(baselinePath, "utf8")) as BaselineSnapshot | { total_accuracy?: unknown };
  const previous = ("total_accuracy" in raw && typeof raw.total_accuracy === "object"
    ? toBaselineSnapshot(raw as unknown as ReturnType<typeof runBenchmark>)
    : raw) as BaselineSnapshot;
  console.log("\nBASELINE COMPARISON (informative only)");
  for (const row of compareWithBaseline(previous, toBaselineSnapshot(summary))) console.log(`  ${row}`);
}

const gatePath = arg("--gate");
if (gatePath) {
  if (!existsSync(gatePath)) {
    console.error(`Gate baseline file not found: ${gatePath}`);
    process.exit(1);
  }
  const rawGate = JSON.parse(readFileSync(gatePath, "utf8")) as BaselineSnapshot | { total_accuracy?: unknown };
  const gateBaseline = ("total_accuracy" in rawGate && typeof rawGate.total_accuracy === "object"
    ? toBaselineSnapshot(rawGate as unknown as ReturnType<typeof runBenchmark>)
    : rawGate) as BaselineSnapshot;
  const violations = evaluateBenchmarkGate(gateBaseline, toBaselineSnapshot(summary));
  console.log("\nCI GATE (total accuracy + hallucinated items)");
  if (violations.length === 0) {
    console.log("  PASS — el total no empeoró y no hay más partidas inventadas.");
  } else {
    for (const v of violations) console.error(`  FAIL — ${v.message}`);
    process.exit(1);
  }
}

if (summary.cases === 0) {
  console.error("\nEmpty dataset — nothing to measure.");
  process.exit(1);
}

process.exit(0);
