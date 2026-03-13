---
id: T02
parent: S03
milestone: M003
provides:
  - pr-address-utils.ts with summarizeComments, resolveThread, replyToThread
key_files:
  - src/resources/extensions/pr-lifecycle/pr-address-utils.ts
key_decisions:
  - actionableCount filter is type==="thread" && !isResolved && !isOutdated (conversation/review entries not counted as actionable)
  - shellEscape copied locally; not exported from index.ts
patterns_established:
  - replyToThread uses tmpdir() + randomUUID() temp file with finally-cleanup (same philosophy as S01 body-file pattern)
  - resolveThread/replyToThread return { ok: false, phase, error } with raw gh stderr preserved — no information loss
observability_surfaces:
  - resolveThread: { ok: false, phase: "resolve-failed", error: <gh stderr> }
  - replyToThread: { ok: false, phase: "reply-failed", error: <gh stderr> }
duration: ~15m
verification_result: passed
completed_at: 2026-03-12T23:20
blocker_discovered: false
---

# T02: Implement `pr-address-utils.ts`

**Created `pr-address-utils.ts` — all 4 T01 unit tests now pass; `npx tsc --noEmit` clean.**

## What Happened

Created `src/resources/extensions/pr-lifecycle/pr-address-utils.ts` with:

- **6 exported TypeScript interfaces**: `ConversationComment`, `PrReview`, `ReviewThread`, `FetchCommentsResult`, `NumberedComment`, `SummarizeResult`
- **`summarizeComments`**: iterates conversation_comments → reviews → review_threads in order, assigns sequential `n` values starting at 1. `actionableCount` filters on `type === "thread" && !isResolved && !isOutdated` — conversation and review entries are informational, not action items in the thread-resolution sense.
- **`resolveThread`**: runs `resolveReviewThread` mutation via `gh api graphql -F query=@- -F threadId=...`; returns `{ ok: true, thread }` or `{ ok: false, phase: "resolve-failed", error }`.
- **`replyToThread`**: writes body to `tmpdir() + randomUUID() + ".md"` temp file; passes `-F body=@<tmpPath>` to prevent shell interpolation of newlines/quotes; cleans up in `finally`; returns `{ ok: true, comment }` or `{ ok: false, phase: "reply-failed", error }`.
- **`shellEscape`** local copy (not exported from `index.ts`).

**Key deviation from task plan:** The plan described `actionableCount = numbered.filter(e => !e.isResolved && !e.isOutdated).length` but that would produce `actionableCount = 3` for test 4 (conversation/review have `undefined` for those fields, and `!undefined = true`). The test contract asserts `actionableCount = 1` with the comment "only the unresolved non-outdated thread". Implemented `type === "thread" && !e.isResolved && !e.isOutdated` to match the actual contract.

## Verification

```
npm test -- --test-name-pattern "summarizeComments"
```
→ 4 tests pass:
- ✔ summarizeComments returns empty result for empty input
- ✔ summarizeComments marks resolved thread with isResolved and excludes from actionableCount
- ✔ summarizeComments marks outdated thread with isOutdated and excludes from actionableCount
- ✔ summarizeComments assigns sequential n values starting at 1 across mixed types

```
npx tsc --noEmit
```
→ no output (clean)

```
npm test
```
→ 104 pass, 1 fail (pre-existing: `kata launches and loads extensions without errors` / `pi.addTool is not a function` — unrelated to this task, confirmed failing before our change)

## Diagnostics

- `resolveThread` failure: `{ ok: false, phase: "resolve-failed", error: <raw gh stderr> }` — common values include "Already resolved" (check `isResolved` before calling) or "Must be a collaborator"
- `replyToThread` failure: `{ ok: false, phase: "reply-failed", error: <raw gh stderr> }` — surfaces GitHub API errors verbatim
- Both `phase` fields enable downstream routing without prose parsing

## Deviations

- `actionableCount` filter uses `type === "thread" && !isResolved && !isOutdated` instead of the plan's `!isResolved && !isOutdated` — the test contract is authoritative; conversation comments and reviews are informational, not thread-action items.

## Known Issues

- None

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/pr-address-utils.ts` — new module with 6 interfaces + summarizeComments + resolveThread + replyToThread
