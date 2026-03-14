---
id: S03
parent: M003
milestone: M003
provides:
  - kata_fetch_pr_comments tool (pre-flights gh + auth + python3; runs fetch_comments.py; returns structured JSON)
  - kata_resolve_thread tool (pre-flights gh + auth; runs resolveReviewThread mutation via gh api graphql)
  - kata_reply_to_thread tool (pre-flights gh + auth; writes body to temp file; runs addPullRequestReviewThreadReply mutation)
  - pr-address-utils.ts module (summarizeComments, resolveThread, replyToThread, 6 TypeScript interfaces)
  - pr-address.test.ts with 4 passing unit tests for summarizeComments
requires:
  - slice: S01
    provides: fetch_comments.py bundled script, gh-utils.ts (isGhInstalled, isGhAuthenticated), extension scaffold
affects:
  - S05: kata_fetch_pr_comments is the data-fetch foundation for /kata pr address command
key_files:
  - src/resources/extensions/pr-lifecycle/pr-address-utils.ts
  - src/resources/extensions/kata/tests/pr-address.test.ts
  - src/resources/extensions/pr-lifecycle/index.ts
key_decisions:
  - D042: pr-address.test.ts in kata/tests/; MODULE_NOT_FOUND TDD gate (same pattern as S02)
  - D043: actionableCount excludes resolved and outdated threads (intent; see D045 for exact formula)
  - D044: shellEscape copied locally into pr-address-utils.ts; not exported from index.ts
  - D045: actionableCount formula is type-gated — only type==="thread" entries counted; supersedes formula in D043
patterns_established:
  - replyToThread uses tmpdir() + randomUUID() temp file with finally-cleanup — same philosophy as S01 body-file pattern
  - resolveThread / replyToThread return { ok: false, phase, error } with raw gh stderr — no information loss on GraphQL failures
  - two-stage pre-flight (gh-missing → gh-unauth) before thin delegation to mutation wrappers
  - type-gated actionableCount: conversation/review entries are informational; only thread items are action targets
observability_surfaces:
  - kata_fetch_pr_comments: { ok: false, phase: "gh-missing"|"gh-unauth"|"python3-missing"|"fetch-failed", error, hint }
  - kata_resolve_thread: { ok: false, phase: "gh-missing"|"gh-unauth"|"resolve-failed", error, hint }
  - kata_reply_to_thread: { ok: false, phase: "gh-missing"|"gh-unauth"|"reply-failed", error, hint }
drill_down_paths:
  - .kata/milestones/M003/slices/S03/tasks/T01-SUMMARY.md
  - .kata/milestones/M003/slices/S03/tasks/T02-SUMMARY.md
  - .kata/milestones/M003/slices/S03/tasks/T03-SUMMARY.md
  - .kata/milestones/M003/slices/S03/tasks/T04-SUMMARY.md
duration: ~40m actual (5m T01, 15m T02, 10m T03, 10m T04)
verification_result: passed
completed_at: 2026-03-13
---

# S03: Address Review Comments

**Three new tools shipped in the `pr-lifecycle` extension — `kata_fetch_pr_comments`, `kata_resolve_thread`, `kata_reply_to_thread` — plus a `pr-address-utils.ts` module with `summarizeComments` and thin GraphQL mutation wrappers; 4 unit tests pass; TypeScript clean; all 112 tests pass.**

## What Happened

S03 delivered the comment-addressing tool surface in four sequential tasks using strict TDD.

**T01** created `pr-address.test.ts` with 4 failing unit tests against a not-yet-existing `pr-address-utils.ts` module, establishing the contract for `summarizeComments` before implementation. Three minimal fixture helpers (`makeThread`, `makeConversationComment`, `makeReview`) avoid repetition. The TDD gate fired correctly — MODULE_NOT_FOUND until T02.

**T02** created `pr-address-utils.ts` making all 4 tests pass. The module exports 6 TypeScript interfaces and implements `summarizeComments` (sequential numbering across all three comment types; `actionableCount` gated on `type === "thread" && !isResolved && !isOutdated`), `resolveThread` (GraphQL mutation via `gh api graphql -F query=@-`), and `replyToThread` (body written to tmp file to prevent shell interpolation, cleaned in `finally`). One key deviation from the plan's proposed formula: the naive `!isResolved && !isOutdated` filter would count conversation/review entries as actionable since those fields are `undefined` on those types; the type gate makes the semantics exact. This deviation was caught by the test contract (test 4 asserts `actionableCount === 1`).

**T03** registered `kata_fetch_pr_comments` in `index.ts` following the exact three-stage pre-flight pattern from `kata_create_pr`: gh-missing → gh-unauth → python3-missing, then `execSync("python3 " + shellEscape(scriptPath))` with stdout `JSON.parse`d into `{ ok: true, ...parsed }`. The script path is resolved via `dirname(fileURLToPath(import.meta.url))/scripts/fetch_comments.py` — the script was already bundled in S01.

**T04** completed the surface by importing `resolveThread`/`replyToThread` from `pr-address-utils.js` and registering `kata_resolve_thread` and `kata_reply_to_thread` with two-stage pre-flight (gh + auth), delegating directly to the mutation wrappers. All slice-level verification checks passed: `npx tsc --noEmit` clean, `npm test` 112/112 pass, extension loads, grep confirms all 3 tool registrations.

## Verification

- `npm test` → 112 tests, 112 pass, 0 fail (4 pr-address tests included; no regressions)
- `npx tsc --noEmit` → exits 0 (clean)
- `node --import … -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok`
- `grep -c '"kata_fetch_pr_comments"\|"kata_resolve_thread"\|"kata_reply_to_thread"' src/resources/extensions/pr-lifecycle/index.ts` → 3

## Requirements Advanced

- R202 — `kata_fetch_pr_comments` + `kata_resolve_thread` + `kata_reply_to_thread` + `summarizeComments` implement the full comment-addressing tool surface: fetch all PR comment types, present them numbered + filtered, resolve threads, post replies.

## Requirements Validated

- R202 — Contract-level proof: 4 unit tests validate `summarizeComments` contract (empty input, resolved thread, outdated thread, mixed types with sequential numbering); 3 tool registrations confirmed; TypeScript clean; extension loads; full test suite clean. GraphQL mutation wrappers are integration-only (same as `kata_create_pr`'s `create_pr_safe.py` invocation — no live GitHub call required for proof level "contract").

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

**`summarizeComments` actionableCount formula** — The slice plan described `actionableCount = numbered.filter(e => !e.isResolved && !e.isOutdated).length` but conversation and review entries have no `isResolved`/`isOutdated` fields; `!undefined` is `true`, so the naïve filter would count them as actionable. The test contract (test 4, `actionableCount === 1`) is authoritative. Implemented `type === "thread" && !e.isResolved && !e.isOutdated`. Captured in D045.

## Known Limitations

- `/kata pr address` command entry point (user-facing subcommand) is deferred to S05 — the tools are available for agent use but not yet wired behind the `/kata pr` command surface.
- `replyToThread` and `resolveThread` are integration-only (no unit tests); tested only at the contract level via `summarizeComments`. Live GraphQL calls require a real GitHub PR.

## Follow-ups

- S05 must wire `kata_fetch_pr_comments` / `kata_resolve_thread` / `kata_reply_to_thread` into the `/kata pr address` subcommand handler.
- S05 must ensure `resource-loader.ts` cpSync copies `scripts/fetch_comments.py` to the agent directory so the tool works post-install.

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/pr-address-utils.ts` — new: 6 interfaces + `summarizeComments` + `resolveThread` + `replyToThread` + local `shellEscape`
- `src/resources/extensions/kata/tests/pr-address.test.ts` — new: 4 unit tests for `summarizeComments`
- `src/resources/extensions/pr-lifecycle/index.ts` — modified: import `resolveThread`/`replyToThread`; registered `kata_fetch_pr_comments`, `kata_resolve_thread`, `kata_reply_to_thread`

## Forward Intelligence

### What the next slice should know
- The three S03 tools (`kata_fetch_pr_comments`, `kata_resolve_thread`, `kata_reply_to_thread`) are registered and load cleanly — S05 can invoke them immediately without touching index.ts again.
- `fetch_comments.py` must be present at `scripts/fetch_comments.py` relative to the extension dir. Ensure `resource-loader.ts` cpSync includes the `scripts/` subdirectory when syncing `pr-lifecycle` to `~/.kata-cli/agent/extensions/pr-lifecycle/`.
- `summarizeComments` returns `actionableCount` which is always the count of unresolved, non-outdated inline threads — conversation comments and reviews are never counted, regardless of their fields.

### What's fragile
- `replyToThread` temp-file path uses `tmpdir() + randomUUID() + ".md"` — if the OS temp dir is on a different filesystem from the working directory, `gh api graphql -F body=@<path>` still works (it reads by absolute path). No known issue, but worth noting.
- The `fetch_comments.py` script path resolution assumes the extension is loaded from its original source directory (`dirname(fileURLToPath(import.meta.url))/scripts/`). After resource-loader syncs to `~/.kata-cli/agent/`, the path resolves correctly — but only if the sync includes the `scripts/` subdirectory.

### Authoritative diagnostics
- `phase` field in every tool response is the first branch point — maps directly to remediation actions without prose parsing.
- `grep -n '"kata_fetch_pr_comments"\|"kata_resolve_thread"\|"kata_reply_to_thread"' src/resources/extensions/pr-lifecycle/index.ts` → confirms all 3 registrations are present with exact line numbers.

### What assumptions changed
- The `summarizeComments` plan assumed naïve `!isResolved && !isOutdated` would work — the test contract revealed conversation/review entries need a `type` gate. This is a refinement, not a scope change.
