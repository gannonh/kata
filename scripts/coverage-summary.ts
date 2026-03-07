#!/usr/bin/env bun
/**
 * Coverage Summary Script
 * Aggregates bun test coverage output by module area.
 *
 * Usage: bun run scripts/coverage-summary.ts
 */

import { $ } from "bun";

interface CoverageEntry {
  file: string;
  functions: number;
  lines: number;
}

interface AreaSummary {
  area: string;
  files: number;
  avgFunctions: number;
  avgLines: number;
  target: number;
  pass: boolean;
}

// Current thresholds (prevent regression)
// Aspirational targets from UAT: mermaid 95%, shared 60%, ui 80%, electron 70%, overall 70%
const THRESHOLDS: Record<string, number> = {
  "packages/mermaid": 90,  // Currently ~95%, threshold prevents major regression
  "packages/shared": 20,   // Currently ~26%, low threshold allows incremental improvement
  "packages/ui": 50,       // Currently ~56%, threshold prevents major regression
  "apps/electron": 0,      // Currently ~0%, renderer lib only - E2E coverage primary
};

const OVERALL_THRESHOLD = 40;  // Currently ~45%, threshold prevents major regression

async function main() {
  console.log("Running coverage analysis...\n");

  // Run coverage and capture output
  const result = await $`bun test --coverage ./packages/ ./apps/electron/src/renderer/lib/ 2>&1`.text();

  // Parse the coverage table (lines starting with file paths and containing |)
  const lines = result.split("\n");
  const entries: CoverageEntry[] = [];

  let inTable = false;
  for (const line of lines) {
    // Detect table start
    if (line.includes("File") && line.includes("% Funcs") && line.includes("% Lines")) {
      inTable = true;
      continue;
    }

    // Skip separator lines
    if (line.startsWith("---")) continue;

    // Parse data rows
    if (inTable && line.includes("|")) {
      const parts = line.split("|").map(p => p.trim());
      if (parts.length >= 3 && parts[0] && !parts[0].startsWith("All files")) {
        const file = parts[0];
        const funcs = parseFloat(parts[1]) || 0;
        const lns = parseFloat(parts[2]) || 0;
        entries.push({ file, functions: funcs, lines: lns });
      }
    }

    // Detect table end
    if (inTable && line.trim() === "") {
      inTable = false;
    }
  }

  if (entries.length === 0) {
    console.error("No coverage data parsed. Test execution may have failed.");
    console.error("Run `bun test --coverage` directly to diagnose.");
    process.exit(1);
  }

  // Aggregate by area
  const areas = new Map<string, CoverageEntry[]>();

  for (const entry of entries) {
    let area = "other";
    if (entry.file.startsWith("packages/mermaid")) area = "packages/mermaid";
    else if (entry.file.startsWith("packages/shared")) area = "packages/shared";
    else if (entry.file.startsWith("packages/ui")) area = "packages/ui";
    else if (entry.file.startsWith("apps/electron")) area = "apps/electron";

    if (!areas.has(area)) areas.set(area, []);
    areas.get(area)!.push(entry);
  }

  // Calculate summaries
  const summaries: AreaSummary[] = [];
  let totalFuncs = 0;
  let totalLines = 0;
  let totalFiles = 0;

  for (const [area, files] of areas) {
    if (area === "other") continue;

    const avgFuncs = files.reduce((sum, f) => sum + f.functions, 0) / files.length;
    const avgLines = files.reduce((sum, f) => sum + f.lines, 0) / files.length;
    const target = THRESHOLDS[area] ?? 0;

    summaries.push({
      area,
      files: files.length,
      avgFunctions: Math.round(avgFuncs * 100) / 100,
      avgLines: Math.round(avgLines * 100) / 100,
      target,
      pass: avgFuncs >= target,
    });

    totalFuncs += files.reduce((sum, f) => sum + f.functions, 0);
    totalLines += files.reduce((sum, f) => sum + f.lines, 0);
    totalFiles += files.length;
  }

  const overallFuncs = totalFiles > 0 ? totalFuncs / totalFiles : 0;
  const overallLines = totalFiles > 0 ? totalLines / totalFiles : 0;

  // Output summary
  console.log("+-----------------------------------------------------------------+");
  console.log("|                    COVERAGE SUMMARY                             |");
  console.log("+------------------+-------+----------+---------+--------+--------+");
  console.log("| Area             | Files | Funcs %  | Lines % | Target | Status |");
  console.log("+------------------+-------+----------+---------+--------+--------+");

  for (const s of summaries.sort((a, b) => a.area.localeCompare(b.area))) {
    const status = s.pass ? "PASS" : "FAIL";
    const areaCol = s.area.padEnd(16);
    const filesCol = String(s.files).padStart(5);
    const funcsCol = s.avgFunctions.toFixed(1).padStart(7) + "%";
    const linesCol = s.avgLines.toFixed(1).padStart(6) + "%";
    const targetCol = (s.target + "%").padStart(6);
    console.log(`| ${areaCol} |${filesCol} | ${funcsCol} | ${linesCol} |${targetCol} | ${status.padStart(4)}   |`);
  }

  console.log("+------------------+-------+----------+---------+--------+--------+");
  const overallPass = overallFuncs >= OVERALL_THRESHOLD;
  const overallStatus = overallPass ? "PASS" : "FAIL";
  console.log(`| OVERALL          |${String(totalFiles).padStart(5)} | ${overallFuncs.toFixed(1).padStart(7)}% | ${overallLines.toFixed(1).padStart(6)}% |${(OVERALL_THRESHOLD + "%").padStart(6)} | ${overallStatus.padStart(4)}   |`);
  console.log("+------------------+-------+----------+---------+--------+--------+");

  // Check for failures
  const failures = summaries.filter(s => !s.pass);
  if (failures.length > 0 || !overallPass) {
    console.log("\nCoverage below threshold:");
    for (const f of failures) {
      console.log(`   - ${f.area}: ${f.avgFunctions.toFixed(1)}% < ${f.target}% target`);
    }
    if (!overallPass) {
      console.log(`   - Overall: ${overallFuncs.toFixed(1)}% < ${OVERALL_THRESHOLD}% target`);
    }
    process.exit(1);
  }

  console.log("\nAll coverage thresholds met");
  process.exit(0);
}

main().catch(err => {
  console.error("Coverage analysis failed:", err);
  process.exit(1);
});
