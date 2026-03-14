---
id: T04
parent: S03
milestone: M003
provides:
  - kata_resolve_thread tool registered in index.ts (pre-flights gh + auth; delegates to resolveThread)
  - kata_reply_to_thread tool registered in index.ts (pre-flights gh + auth; delegates to replyToThread)
  - resolveThread and replyToThread imported from ./pr-address-utils.js
  - Slice S03 complete — all three tools registered, TypeScript clean, full test suite passing
key_files:
  - src/resources/extensions/pr-lifecycle/index.ts
key_decisions:
  - none (strict clone of kata_fetch_pr_comments pre-flight pattern; no new decisions)
patterns_established:
  - two-stage pre-flight (gh-missing → gh-unauth) before delegating to thin mutation wrappers — consistent with all other pr-lifecycle tools
  - handler returns mutation wrapper result directly (no re-wrapping) so phase enum values from pr-address-utils are surfaced verbatim
observability_surfaces:
  - kata_resolve_thread returns { ok: false, phase: "resolve-failed", error } with raw gh api graphql stderr on mutation failure
  - kata_reply_to_thread returns { ok: false, phase: "reply-failed", error } with raw gh api graphql stderr on mutation failure
  - both tools return { ok: false, phase: "gh-missing" | "gh-unauth", hint } on pre-flight failures
duration: ~10m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T04: Register `kata_resolve_thread` + `kata_reply_to_thread`; full verification

**Registered the final two S03 tools in `index.ts` — `kata_resolve_thread` and `kata_reply_to_thread` — completing the pr-lifecycle address-comments surface with TypeScript clean and all tests passing.**

## What Happened

Two edits to `src/resources/extensions/pr-lifecycle/index.ts`:

1. Added `import { resolveThread, replyToThread } from "./pr-address-utils.js"` alongside the existing `pr-merge-utils` import.

2. Registered `kata_resolve_thread` between `kata_fetch_pr_comments` and `kata_merge_pr`:
   - Params: `{ threadId: string, cwd?: string }` (`threadId` required)
   - Pre-flights: `isGhInstalled()` → `gh-missing`; `isGhAuthenticated()` → `gh-unauth`
   - Delegates directly to `resolveThread(threadId, cwd)` and returns its result

3. Registered `kata_reply_to_thread` immediately after:
   - Params: `{ threadId: string, body: string, cwd?: string }` (`threadId` + `body` required)
   - Same two-stage pre-flight pattern
   - Delegates directly to `replyToThread(threadId, body, cwd)` and returns its result

Both tools surface the mutation wrapper's structured `{ ok: false, phase, error }` objects verbatim — no information loss on gh GraphQL failures.

## Verification

All slice-level verification checks passed:

- `npx tsc --noEmit` → exits 0 (no type errors)
- `npm test` → all tests pass (112 tests across all test files; `pr-address.test.ts` 4 tests included; 0 failures, 0 regressions)
- `grep -n '"kata_fetch_pr_comments"\|"kata_resolve_thread"\|"kata_reply_to_thread"' src/resources/extensions/pr-lifecycle/index.ts` → lines 366, 454, 506 (all three `name:` registrations confirmed)
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok`

## Diagnostics

Inspecting a `kata_resolve_thread` or `kata_reply_to_thread` failure:

- `phase: "gh-missing"` → install gh CLI (`https://cli.github.com`)
- `phase: "gh-unauth"` → run `gh auth login`
- `phase: "resolve-failed"` → read `error` for raw `gh api graphql` stderr (common: "Already resolved" — caller should check `isResolved` first; "Must be a collaborator" — permission denial)
- `phase: "reply-failed"` → read `error` for raw `gh api graphql` stderr (GitHub API errors surfaced verbatim; includes auth failures and malformed threadId errors)

## Deviations

None. Implementation followed the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/index.ts` — added `resolveThread`/`replyToThread` import; registered `kata_resolve_thread` and `kata_reply_to_thread` tools
