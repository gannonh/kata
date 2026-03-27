import assert from "node:assert/strict";

const { composePRBody } = await import("../../pr-lifecycle/pr-body-composer.js");

const MINIMAL_SLICE_PLAN = `# S01: PR Creation & Body Composition

**Goal:** Deliver foundational pr-lifecycle tooling.
**Demo:** \`kata_create_pr\` tool creates a PR with a well-formed body.

## Must-Haves

- PR body contains slice goal
- PR body contains task list

## Tasks

- [ ] **T01: Do the thing** \`est:30m\`
  Build the core scaffolding for the PR lifecycle extension.
`;

const MINIMAL_SUMMARY = `---
id: S01
parent: M001
milestone: M001
---

# S01 Summary

**Implemented PR body composition scaffolding.**
`;

test("composePRBody returns a non-empty string", async () => {
  const result = await composePRBody("M001", "S01", process.cwd(), {
    linearDocuments: { PLAN: MINIMAL_SLICE_PLAN, SUMMARY: MINIMAL_SUMMARY },
  });

  assert.equal(typeof result, "string", "composePRBody should return a string");
  assert.ok(result.length > 0, "result should be non-empty");
});

test("composePRBody output contains markdown headings", async () => {
  const result = await composePRBody("M001", "S01", process.cwd(), {
    linearDocuments: { PLAN: MINIMAL_SLICE_PLAN, SUMMARY: MINIMAL_SUMMARY },
  });

  assert.ok(result.includes("## What Changed"));
  assert.ok(result.includes("## Must-Haves"));
});

test("composePRBody output references must-haves or task titles", async () => {
  const result = await composePRBody("M001", "S01", process.cwd(), {
    linearDocuments: { PLAN: MINIMAL_SLICE_PLAN, SUMMARY: MINIMAL_SUMMARY },
  });

  const hasExpectedContent =
    result.includes("PR body contains slice goal") ||
    result.includes("Do the thing") ||
    result.includes("PR Creation");

  assert.ok(
    hasExpectedContent,
    `result should reference slice must-have text or task title, got:\n${result}`,
  );
});

test("composePRBody works for arbitrary slice IDs", async () => {
  const result = await composePRBody("M002", "S03", process.cwd(), {
    linearDocuments: {
      PLAN: `# S03: Different Slice\n\n## Must-Haves\n\n- Works for M002/S03\n\n## Tasks\n\n- [ ] **T01: Some task** \`est:20m\`\n  Do the work.\n`,
    },
  });

  assert.equal(typeof result, "string", "result should be a string for M002/S03");
  assert.ok(result.length > 0, "result should be non-empty for M002/S03");
  assert.ok(result.includes("S03"), "result should reference slice id/title");
});
