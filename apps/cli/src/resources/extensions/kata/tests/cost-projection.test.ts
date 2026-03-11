/**
 * Contract tests for `formatCostProjection`.
 * Tests the pure function — no file I/O, no extension context.
 *
 * This test intentionally fails at import time (or on first assertion)
 * because `formatCostProjection` does not yet exist in metrics.ts.
 * That failure confirms the test runs against real code. (T01 state)
 */

import {
  type SliceAggregate,
  formatCostProjection,
} from "../metrics.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSliceAggregate(sliceId: string, cost: number): SliceAggregate {
  return {
    sliceId,
    units: 1,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost,
    duration: 1000,
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── formatCostProjection ─────────────────────────────────────────────────────

console.log("\n=== formatCostProjection ===");

// 1. Zero completed slices → empty result
{
  const result = formatCostProjection([], 3);
  assertEq(result.length, 0, "zero slices → empty array");
}

// 2. One slice → suppressed (need ≥2 to project reliably)
{
  const result = formatCostProjection([makeSliceAggregate("M001/S01", 0.10)], 3);
  assertEq(result.length, 0, "one slice → suppressed (no projection shown)");
}

// 3. Two slices → projection shown (result.length > 0)
{
  const slices = [
    makeSliceAggregate("M001/S01", 0.10),
    makeSliceAggregate("M001/S02", 0.10),
  ];
  const result = formatCostProjection(slices, 5);
  assert(result.length > 0, "two slices → projection shown");
}

// 4. Two-slice result: result[0] contains "$" (cost is formatted)
{
  const slices = [
    makeSliceAggregate("M001/S01", 0.10),
    makeSliceAggregate("M001/S02", 0.10),
  ];
  const result = formatCostProjection(slices, 5);
  assert(result.length > 0 && result[0].includes("$"), "projection line contains \"$\"");
}

// 5. Budget ceiling hit: total $0.20 >= ceiling $0.05 → line contains "ceiling"
{
  const slices = [
    makeSliceAggregate("M001/S01", 0.10),
    makeSliceAggregate("M001/S02", 0.10),
  ];
  const result = formatCostProjection(slices, 5, 0.05);
  const hasCeilingLine = result.some(
    line => line.toLowerCase().includes("ceiling")
  );
  assert(hasCeilingLine, "ceiling warning appears when total ($0.20) >= ceiling ($0.05)");
}

// 6. Budget ceiling not hit: total $0.20 < ceiling $100.00 → no ceiling line
{
  const slices = [
    makeSliceAggregate("M001/S01", 0.10),
    makeSliceAggregate("M001/S02", 0.10),
  ];
  const result = formatCostProjection(slices, 5, 100.00);
  const hasCeilingLine = result.some(
    line => line.toLowerCase().includes("ceiling")
  );
  assert(!hasCeilingLine, "no ceiling warning when total ($0.20) < ceiling ($100.00)");
}

// 7. No ceiling arg → no ceiling line
{
  const slices = [
    makeSliceAggregate("M001/S01", 0.10),
    makeSliceAggregate("M001/S02", 0.10),
  ];
  const result = formatCostProjection(slices, 5);
  const hasCeilingLine = result.some(
    line => line.toLowerCase().includes("ceiling")
  );
  assert(!hasCeilingLine, "no ceiling warning when no ceiling is set");
}

// 8. Rounding: avg $0.10 × 5 remaining = $0.50 → result[0] contains "$0.50"
{
  const slices = [
    makeSliceAggregate("M001/S01", 0.10),
    makeSliceAggregate("M001/S02", 0.10),
  ];
  const result = formatCostProjection(slices, 5);
  const hasRoundedCost = result.some(line => line.includes("$0.50"));
  assert(hasRoundedCost, "projected cost $0.50 (avg $0.10 × 5 remaining) appears in output");
}

// 9. Bare milestone entries excluded from average:
//    makeSliceAggregate('M001', 5.00) has no "/" in sliceId → excluded from avg calc.
//    Only M001/S01 ($0.10) and M001/S02 ($0.10) count → avg $0.10 × 3 remaining = $0.30
{
  const slices = [
    makeSliceAggregate("M001", 5.00),        // bare milestone — must be excluded
    makeSliceAggregate("M001/S01", 0.10),
    makeSliceAggregate("M001/S02", 0.10),
  ];
  const result = formatCostProjection(slices, 3);
  const hasCorrectProjection = result.some(line => line.includes("$0.30"));
  assert(
    hasCorrectProjection,
    "bare milestone entry excluded from avg: projection shows $0.30 (avg $0.10 × 3), not $1.83 (including $5.00 entry)"
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
