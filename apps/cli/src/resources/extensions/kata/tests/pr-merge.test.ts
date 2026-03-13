/**
 * Tests for `parseCIChecks` and `updateSliceInRoadmap` in pr-merge-utils.
 *
 * These tests FAIL until T02 creates `pr-merge-utils.ts` and exports
 * `parseCIChecks` and `updateSliceInRoadmap`. The top-level import throws
 * MODULE_NOT_FOUND until T02 ships the implementation.
 *
 * Expected failure: Cannot find module '../../pr-lifecycle/pr-merge-utils.js'
 */

import test from "node:test";
import assert from "node:assert/strict";

// This import intentionally fails until T02 creates the file.
// The test runner reports the error; do not suppress it.
const { parseCIChecks, updateSliceInRoadmap } = await import(
  "../../pr-lifecycle/pr-merge-utils.js"
);

// ---------------------------------------------------------------------------
// parseCIChecks — 4 tests
// ---------------------------------------------------------------------------

test("parseCIChecks returns allPassing:true for empty JSON array", () => {
  const result = parseCIChecks(JSON.stringify([]));
  assert.equal(result.allPassing, true, "empty checks should be allPassing");
  assert.deepEqual(result.failing, [], "failing should be empty");
  assert.deepEqual(result.pending, [], "pending should be empty");
});

test("parseCIChecks returns allPassing:true when all checks have success conclusion and completed status", () => {
  const checks = [
    { name: "build", status: "completed", conclusion: "success" },
    { name: "test", status: "completed", conclusion: "success" },
  ];
  const result = parseCIChecks(JSON.stringify(checks));
  assert.equal(result.allPassing, true, "all-success checks should be allPassing");
  assert.deepEqual(result.failing, [], "failing should be empty");
  assert.deepEqual(result.pending, [], "pending should be empty");
});

test("parseCIChecks returns allPassing:false with failing name when one check has failure conclusion", () => {
  const checks = [
    { name: "build", status: "completed", conclusion: "success" },
    { name: "test-suite", status: "completed", conclusion: "failure" },
  ];
  const result = parseCIChecks(JSON.stringify(checks));
  assert.equal(result.allPassing, false, "should not be allPassing when failure present");
  assert.deepEqual(result.failing, ["test-suite"], "failing should contain the failed check name");
  assert.deepEqual(result.pending, [], "pending should be empty");
});

test("parseCIChecks returns allPassing:false with pending name when one check status is not completed", () => {
  const checks = [
    { name: "build", status: "completed", conclusion: "success" },
    { name: "deploy-preview", status: "in_progress", conclusion: null },
  ];
  const result = parseCIChecks(JSON.stringify(checks));
  assert.equal(result.allPassing, false, "should not be allPassing when pending check present");
  assert.deepEqual(result.failing, [], "failing should be empty");
  assert.deepEqual(result.pending, ["deploy-preview"], "pending should contain the in-progress check name");
});

// ---------------------------------------------------------------------------
// updateSliceInRoadmap — 3 tests
// ---------------------------------------------------------------------------

test("updateSliceInRoadmap flips the target slice checkbox from [ ] to [x]", () => {
  const before = [
    "## Slices",
    "",
    "- [x] **S01: PR Creation** `risk:medium`",
    "- [x] **S02: Reviewer Subagents** `risk:high`",
    "- [ ] **S03: Address Review Comments** `risk:low`",
    "- [ ] **S04: Merge & Slice Completion** `risk:low`",
  ].join("\n");

  const after = updateSliceInRoadmap(before, "S04");
  assert.ok(
    after.includes("- [x] **S04:"),
    `S04 should be checked in:\n${after}`,
  );
});

test("updateSliceInRoadmap leaves other slice checkboxes untouched", () => {
  const before = [
    "## Slices",
    "",
    "- [x] **S01: PR Creation** `risk:medium`",
    "- [ ] **S03: Address Review Comments** `risk:low`",
    "- [ ] **S04: Merge & Slice Completion** `risk:low`",
  ].join("\n");

  const after = updateSliceInRoadmap(before, "S04");
  assert.ok(
    after.includes("- [ ] **S03:"),
    `S03 should remain unchecked in:\n${after}`,
  );
  assert.ok(
    after.includes("- [x] **S01:"),
    `S01 should remain checked in:\n${after}`,
  );
});

test("updateSliceInRoadmap is a no-op when the target slice is already [x]", () => {
  const before = [
    "## Slices",
    "",
    "- [x] **S04: Merge & Slice Completion** `risk:low`",
  ].join("\n");

  const after = updateSliceInRoadmap(before, "S04");
  assert.equal(after, before, "content should be unchanged when already checked");
});
