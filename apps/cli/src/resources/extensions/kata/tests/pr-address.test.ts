/**
 * Tests for `summarizeComments` in pr-address-utils.
 *
 * These tests FAIL until T02 creates `pr-address-utils.ts` and exports
 * `summarizeComments`. The top-level import throws MODULE_NOT_FOUND until
 * T02 ships the implementation.
 *
 * Expected failure: Cannot find module '../../pr-lifecycle/pr-address-utils.js'
 */

import assert from "node:assert/strict";

// This import intentionally fails until T02 creates the file.
// The test runner reports the error; do not suppress it.
const { summarizeComments } = await import("../../pr-lifecycle/pr-address-utils.js");

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

/** Returns a minimal valid pull_request meta object. */
function makePr() {
  return {
    number: 1,
    url: "https://github.com/owner/repo/pull/1",
    title: "feat: test PR",
    state: "OPEN",
    owner: "owner",
    repo: "repo",
  };
}

/** Returns a minimal valid review_threads node with optional overrides. */
function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "PRRT_test001",
    isResolved: false,
    isOutdated: false,
    path: "src/index.ts",
    line: 42,
    comments: {
      nodes: [
        {
          id: "PRRC_test001",
          body: "Please fix this.",
          author: { login: "reviewer1" },
          createdAt: "2026-03-12T10:00:00Z",
          updatedAt: "2026-03-12T10:00:00Z",
        },
      ],
    },
    ...overrides,
  };
}

/** Returns a minimal valid conversation comment node. */
function makeConversationComment(overrides: Record<string, unknown> = {}) {
  return {
    id: "IC_test001",
    body: "General comment.",
    author: { login: "commenter1" },
    createdAt: "2026-03-12T09:00:00Z",
    updatedAt: "2026-03-12T09:00:00Z",
    ...overrides,
  };
}

/** Returns a minimal valid review node. */
function makeReview(overrides: Record<string, unknown> = {}) {
  return {
    id: "PRR_test001",
    state: "COMMENTED",
    body: "Looks mostly good, one nit.",
    author: { login: "reviewer2" },
    submittedAt: "2026-03-12T09:30:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// summarizeComments — 4 tests
// ---------------------------------------------------------------------------

test("summarizeComments returns empty result for empty input", () => {
  const result = summarizeComments({
    pull_request: makePr(),
    conversation_comments: [],
    reviews: [],
    review_threads: [],
  });
  assert.equal(result.totalCount, 0, "totalCount should be 0 for empty input");
  assert.equal(result.actionableCount, 0, "actionableCount should be 0 for empty input");
  assert.equal(result.numbered.length, 0, "numbered should be empty for empty input");
});

test("summarizeComments marks resolved thread with isResolved and excludes from actionableCount", () => {
  const result = summarizeComments({
    pull_request: makePr(),
    conversation_comments: [],
    reviews: [],
    review_threads: [makeThread({ isResolved: true, isOutdated: false })],
  });
  assert.equal(result.numbered.length, 1, "should produce one numbered entry");
  assert.equal(
    result.numbered[0].isResolved,
    true,
    "isResolved should be true for a resolved thread",
  );
  assert.equal(
    result.actionableCount,
    0,
    "resolved thread should not count as actionable",
  );
});

test("summarizeComments marks outdated thread with isOutdated and excludes from actionableCount", () => {
  const result = summarizeComments({
    pull_request: makePr(),
    conversation_comments: [],
    reviews: [],
    review_threads: [makeThread({ isResolved: false, isOutdated: true })],
  });
  assert.equal(result.numbered.length, 1, "should produce one numbered entry");
  assert.equal(
    result.numbered[0].isOutdated,
    true,
    "isOutdated should be true for an outdated thread",
  );
  assert.equal(
    result.actionableCount,
    0,
    "outdated thread should not count as actionable",
  );
});

test("summarizeComments assigns sequential n values starting at 1 across mixed types", () => {
  const result = summarizeComments({
    pull_request: makePr(),
    conversation_comments: [makeConversationComment()],
    reviews: [makeReview()],
    review_threads: [makeThread({ isResolved: false, isOutdated: false })],
  });
  assert.equal(result.totalCount, 3, "totalCount should be 3 for 3 mixed entries");
  assert.equal(result.actionableCount, 1, "actionableCount should be 1 (only the unresolved non-outdated thread)");
  assert.equal(result.numbered[0].n, 1, "first entry should have n === 1");
  assert.equal(result.numbered[1].n, 2, "second entry should have n === 2");
  assert.equal(result.numbered[2].n, 3, "third entry should have n === 3");
});
