/**
 * Tests for PR reviewer scoping and aggregation utilities.
 *
 * These tests FAIL until T02 creates `pr-review-utils.ts` and exports
 * `scopeReviewers`, `buildReviewerTaskPrompt`, and `aggregateFindings`.
 * The top-level import throws MODULE_NOT_FOUND until T02 ships the implementation.
 *
 * Expected failure: Cannot find module '../../pr-lifecycle/pr-review-utils.js'
 */

import assert from "node:assert/strict";

// This import intentionally fails until T02 creates the file.
// The test runner reports the error; do not suppress it.
const { scopeReviewers, buildReviewerTaskPrompt, aggregateFindings } =
  await import("../../pr-lifecycle/pr-review-utils.js");

// ---------------------------------------------------------------------------
// scopeReviewers — 5 tests
// ---------------------------------------------------------------------------

test("scopeReviewers always includes pr-code-reviewer", () => {
  const reviewers = scopeReviewers({
    diff: "const x = 1;",
    changedFiles: [],
  });
  assert.ok(
    reviewers.includes("pr-code-reviewer"),
    `expected pr-code-reviewer in [${reviewers.join(", ")}]`,
  );
});

test("scopeReviewers includes pr-failure-finder when diff contains try {", () => {
  const reviewers = scopeReviewers({
    diff: "function foo() {\n  try {\n    doSomething();\n  } catch (e) { throw e; }\n}",
    changedFiles: [],
  });
  assert.ok(
    reviewers.includes("pr-failure-finder"),
    `expected pr-failure-finder in [${reviewers.join(", ")}]`,
  );
});

test("scopeReviewers includes pr-test-analyzer when changedFiles contains a test file", () => {
  const reviewers = scopeReviewers({
    diff: "const x = 2;",
    changedFiles: ["src/foo.test.ts"],
  });
  assert.ok(
    reviewers.includes("pr-test-analyzer"),
    `expected pr-test-analyzer in [${reviewers.join(", ")}]`,
  );
});

test("scopeReviewers excludes pr-code-simplifier for a short diff (< 30 lines)", () => {
  const shortDiff = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
  const reviewers = scopeReviewers({
    diff: shortDiff,
    changedFiles: [],
  });
  assert.ok(
    !reviewers.includes("pr-code-simplifier"),
    `expected pr-code-simplifier to be absent in [${reviewers.join(", ")}]`,
  );
});

test("scopeReviewers includes pr-code-simplifier for a large diff (> 100 lines)", () => {
  const largeDiff = "line\n".repeat(101);
  const reviewers = scopeReviewers({
    diff: largeDiff,
    changedFiles: [],
  });
  assert.ok(
    reviewers.includes("pr-code-simplifier"),
    `expected pr-code-simplifier in [${reviewers.join(", ")}]`,
  );
});

// ---------------------------------------------------------------------------
// buildReviewerTaskPrompt — 1 test
// ---------------------------------------------------------------------------

test("buildReviewerTaskPrompt returns a non-empty string containing the PR title", () => {
  const prTitle = "feat: add reviewer scoping logic";
  const prompt = buildReviewerTaskPrompt({
    reviewer: "pr-code-reviewer",
    prTitle,
    prNumber: 42,
    diff: "const x = 1;",
    changedFiles: ["src/index.ts"],
  });
  assert.equal(typeof prompt, "string", "buildReviewerTaskPrompt should return a string");
  assert.ok(prompt.length > 0, "prompt should be non-empty");
  assert.ok(
    prompt.includes(prTitle),
    `prompt should include PR title "${prTitle}", got:\n${prompt}`,
  );
});

// ---------------------------------------------------------------------------
// aggregateFindings — 2 tests
// ---------------------------------------------------------------------------

test("aggregateFindings includes Critical and Important headings from fixture outputs", () => {
  const findings = [
    "## Review Findings\n\nCritical: **src/foo.ts:42** — null dereference possible",
    "## Review Findings\n\nImportant: **src/bar.ts:10** — missing validation",
  ];
  const result = aggregateFindings(findings);
  assert.equal(typeof result, "string", "aggregateFindings should return a string");
  assert.ok(
    result.includes("Critical"),
    `result should contain "Critical", got:\n${result}`,
  );
  assert.ok(
    result.includes("Important"),
    `result should contain "Important", got:\n${result}`,
  );
});

test("aggregateFindings deduplicates repeated file references", () => {
  const findings = [
    "## Review Findings\n\nCritical: **src/foo.ts:42** — null dereference possible",
    "## Review Findings\n\nCritical: **src/foo.ts:42** — same issue flagged again",
  ];
  const result = aggregateFindings(findings);
  // Count occurrences of the deduplicated reference
  const occurrences = (result.match(/src\/foo\.ts:42/g) ?? []).length;
  assert.equal(
    occurrences,
    1,
    `"src/foo.ts:42" should appear exactly once after deduplication, found ${occurrences} times in:\n${result}`,
  );
});
