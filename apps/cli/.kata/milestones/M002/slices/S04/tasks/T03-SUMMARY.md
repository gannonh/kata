---
id: T03
parent: S04
milestone: M002
provides:
  - document-storage.integration.test.ts with 6 integration test cases validating R103
  - Documented Linear API normalization: `- ` bullets stored as `* `; trailing newline stripped
key_files:
  - src/resources/extensions/linear/tests/document-storage.integration.test.ts
key_decisions:
  - Use `* ` (asterisk) bullets in test content — Linear normalizes `- ` → `* ` on storage; tests must match API's canonical form for byte-identical assertions
  - Omit trailing newlines from test content strings — Linear strips a single trailing newline on storage
patterns_established:
  - Integration test content strings should use Linear's canonical markdown form (`* ` bullets, no trailing newline) to achieve true byte-identical round-trip assertions
  - Use `Promise.allSettled` for parallel document cleanup in after() — tolerates individual deletion failures without aborting the rest of cleanup
observability_surfaces:
  - Integration test logs `document.id` at each write step — primary evidence of successful API round-trips; visible in test output for manual inspection if a test fails
  - after() logs cleanup failures with document ID — orphaned documents detectable by `[S04-TEST]` title prefix on the throwaway issue
duration: ~15m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Integration tests for document round-trips

**Six integration test cases validate R103 — all pass against the real Linear API, workspace clean after cleanup. Discovered: Linear normalizes `- ` list syntax to `* ` and strips trailing newlines on write.**

## What Happened

Scaffolded `document-storage.integration.test.ts` following the `entity-hierarchy.integration.test.ts` template exactly: `const API_KEY = process.env.LINEAR_API_KEY` at top, `describe` with skip guard on missing key, `before()` that resolves team+project (with `LINEAR_TEAM_ID`/`LINEAR_PROJECT_ID` env var shortcuts), creates a throwaway issue for issue-level attachment tests, and `after()` using `Promise.allSettled` over all tracked document IDs followed by a sequential issue delete.

First run exposed two real API normalization behaviors:
1. **Bullet normalization**: Linear converts `- ` list syntax to `* ` on storage. Content written with `- S01: ...` is read back as `* S01: ...`.
2. **Trailing newline stripping**: Linear strips a single trailing `\n` from document content. `"content\n"` is stored as `"content"`.

Both issues caused Tests 1, 2, 3, and 4 to fail on byte-identical equality assertions. Fix: updated `MARKDOWN_CONTENT`, `PLAN_CONTENT`, and the upsert test's `v1`/`v2` strings to use the API's canonical form (`* ` bullets, no trailing newline). Second run: 6/6 pass.

Tests 5 (list scoping) and 6 (read not-found) passed on the first run — no changes needed.

## Verification

All slice-level verification checks run:

```
# Unit tests (naming) — 35/35 pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-naming.test.ts

# Unit tests (operations mock) — 24/24 pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-operations.test.ts

# Integration tests — 6/6 pass
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-storage.integration.test.ts

# TypeScript — clean
npx tsc --noEmit
```

Tool count is 34 (not 31 as the slice plan predicted) — T02 added 3 document tools; the slice plan's pre-task count was a stale estimate. Not a regression.

## Diagnostics

To re-verify document round-trips at any time:
```
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/document-storage.integration.test.ts
```

The test is self-contained and self-cleaning. Each test logs the created document ID — if a test fails mid-run, the last logged ID is available for manual inspection in Linear. Orphaned documents from failed runs are identifiable by the `[S04-TEST]` prefix on the throwaway issue.

## Deviations

**Linear markdown normalization** — Test content was updated to use `* ` bullets (not `- `) and no trailing newlines to match the form Linear stores. This is a real API behavior, not a defect. The byte-identical assertions still hold after adapting to the canonical form. The normalization behaviors are documented in the `MARKDOWN_CONTENT` block comment in the test file.

**Tool count** — Slice plan predicted 31 tools after S04; current count is 34. T02 added `kata_write_document`, `kata_read_document`, `kata_list_documents`, which moved the count from the 31 predicted at slice planning time. No action needed.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/linear/tests/document-storage.integration.test.ts` — new: 6 integration test cases for document round-trips; R103 validated
- `.kata/milestones/M002/slices/S04/S04-PLAN.md` — T03 marked complete
