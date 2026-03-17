/**
 * Tests for the PR body composer.
 *
 * These tests FAIL until T03 creates `pr-body-composer.ts` and exports
 * `composePRBody`. The import itself will throw MODULE_NOT_FOUND until T03
 * ships the implementation.
 *
 * Expected failure: Cannot find module '../../extensions/pr-lifecycle/pr-body-composer.js'
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// This import intentionally fails until T03 creates the file.
// The test runner reports the error; do not suppress it.
const { composePRBody } = await import(
  "../../pr-lifecycle/pr-body-composer.js"
);

const MINIMAL_SLICE_PLAN = `# S01: PR Creation & Body Composition

**Goal:** Deliver foundational pr-lifecycle tooling.
**Demo:** \`kata_create_pr\` tool creates a PR with a well-formed body.

## Must-Haves

- PR body contains slice goal
- PR body contains task list

## Tasks

- [ ] **T01: Do the thing** \`est:30m\`
  Build the core scaffolding for the PR lifecycle extension.

## Files Likely Touched

- \`src/resources/extensions/pr-lifecycle/index.ts\`
`;

const MINIMAL_TASK_PLAN = `---
estimated_steps: 3
estimated_files: 2
---

# T01: Do the thing

**Slice:** S01 — PR Creation & Body Composition
**Milestone:** M001

## Description

Build the core scaffolding for the PR lifecycle extension.

## Steps

1. Create the index stub
2. Write failing tests
3. Verify the tests fail correctly

## Must-Haves

- [ ] index.ts exists
- [ ] tests exist and fail
`;

/**
 * Creates a minimal .kata milestone/slice/task fixture in a temp directory.
 */
function createFixture(
  tmpDir: string,
  milestoneId: string,
  sliceId: string,
): void {
  const sliceDir = join(
    tmpDir,
    ".kata",
    "milestones",
    milestoneId,
    "slices",
    sliceId,
  );
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  writeFileSync(join(sliceDir, `${sliceId}-PLAN.md`), MINIMAL_SLICE_PLAN, "utf-8");
  writeFileSync(join(tasksDir, "T01-PLAN.md"), MINIMAL_TASK_PLAN, "utf-8");
}

test("composePRBody returns a non-empty string", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "kata-pr-body-"));
  createFixture(tmpDir, "M001", "S01");

  const result = await composePRBody("M001", "S01", tmpDir);

  assert.equal(typeof result, "string", "composePRBody should return a string");
  assert.ok(result.length > 0, "result should be non-empty");
});

test("composePRBody output contains at least one markdown heading", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "kata-pr-body-"));
  createFixture(tmpDir, "M001", "S01");

  const result = await composePRBody("M001", "S01", tmpDir);

  assert.ok(
    result.includes("##"),
    `result should contain at least one ## heading, got:\n${result}`,
  );
});

test("composePRBody output references the slice goal or task title", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "kata-pr-body-"));
  createFixture(tmpDir, "M001", "S01");

  const result = await composePRBody("M001", "S01", tmpDir);

  const hasMustHave = result.includes("PR body contains slice goal") ||
    result.includes("Do the thing") ||
    result.includes("PR Creation");

  assert.ok(
    hasMustHave,
    `result should reference slice must-have text or task title, got:\n${result}`,
  );
});

test("composePRBody works for different milestone and slice IDs", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "kata-pr-body-"));
  createFixture(tmpDir, "M002", "S03");

  // Write fixture for M002/S03
  const sliceDir = join(tmpDir, ".kata", "milestones", "M002", "slices", "S03");
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(sliceDir, "S03-PLAN.md"),
    `# S03: Different Slice

**Goal:** Test that composePRBody works for arbitrary slice IDs.
**Demo:** Result is valid.

## Must-Haves

- Works for M002/S03

## Tasks

- [ ] **T01: Some task** \`est:20m\`
  Do the work.
`,
    "utf-8",
  );
  writeFileSync(
    join(tasksDir, "T01-PLAN.md"),
    `# T01: Some task

## Description

Do the work.

## Steps

1. Step one
`,
    "utf-8",
  );

  const result = await composePRBody("M002", "S03", tmpDir);

  assert.equal(typeof result, "string", "result should be a string for M002/S03");
  assert.ok(result.length > 0, "result should be non-empty for M002/S03");
});
