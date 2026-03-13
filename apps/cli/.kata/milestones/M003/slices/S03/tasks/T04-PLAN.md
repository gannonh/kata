---
estimated_steps: 4
estimated_files: 1
---

# T04: Register `kata_resolve_thread` + `kata_reply_to_thread`; full verification

**Slice:** S03 — Address Review Comments
**Milestone:** M003

## Description

Add the final two tool registrations (`kata_resolve_thread` and `kata_reply_to_thread`) to `index.ts`, import `resolveThread` and `replyToThread` from `pr-address-utils.ts`, then run full TypeScript and test suite verification to close the slice. Each tool delegates to the corresponding mutation wrapper after pre-flighting gh + auth.

## Steps

1. Add the import at the top of `index.ts` alongside the other utility imports:
   ```typescript
   import { resolveThread, replyToThread } from "./pr-address-utils.js";
   ```

2. Register `kata_resolve_thread` tool after `kata_fetch_pr_comments`:
   - Description: resolves an inline GitHub PR review thread via the `resolveReviewThread` GraphQL mutation. Pre-flights gh CLI and auth. Returns `{ ok: true, thread: { id, isResolved } }` or `{ ok: false, phase, error }`.
   - Params: `{ threadId: string, cwd?: string }` with `threadId` required
   - Handler: `isGhInstalled()` check → `gh-missing`; `isGhAuthenticated()` check → `gh-unauth`; then `return resolveThread(threadId, cwd ?? process.cwd())`

3. Register `kata_reply_to_thread` tool:
   - Description: replies to an inline GitHub PR review thread via the `addPullRequestReviewThreadReply` GraphQL mutation. Writes reply body to a temp file to prevent shell interpolation of newlines and quotes. Pre-flights gh CLI and auth. Returns `{ ok: true, comment: { id, body } }` or `{ ok: false, phase, error }`.
   - Params: `{ threadId: string, body: string, cwd?: string }` with `threadId` and `body` required
   - Handler: gh + auth pre-flights; then `return replyToThread(threadId, body, cwd ?? process.cwd())`

4. Run the full verification suite and fix any issues before declaring done:
   - `npx tsc --noEmit` — fix all type errors
   - `npm test` — fix any regressions
   - Confirm all three tools are registered: `grep -c "kata_fetch_pr_comments\|kata_resolve_thread\|kata_reply_to_thread" src/resources/extensions/pr-lifecycle/index.ts` → 3

## Must-Haves

- [ ] `resolveThread` and `replyToThread` imported from `./pr-address-utils.js`
- [ ] `kata_resolve_thread` registered with `threadId: string` required param
- [ ] `kata_reply_to_thread` registered with `threadId: string` and `body: string` required params
- [ ] Both tools pre-flight gh + auth before delegating to mutation wrappers
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 (all tests pass, no regressions from S01/S02 suite)

## Verification

- `npx tsc --noEmit` → exits 0
- `npm test` → exits 0
- `grep -c "kata_fetch_pr_comments\|kata_resolve_thread\|kata_reply_to_thread" src/resources/extensions/pr-lifecycle/index.ts` → outputs `3`
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok`

## Observability Impact

- Signals added/changed: `kata_resolve_thread` and `kata_reply_to_thread` each return `{ ok: false, phase, error }` on pre-flight or mutation failure — consistent with the `phase` enum pattern from S01/S02 tools
- How a future agent inspects this: inspect `phase` field: `"gh-missing"` → install gh; `"gh-unauth"` → authenticate; `"resolve-failed"/"reply-failed"` → read `error` for raw mutation stderr (e.g. GitHub "Already resolved" error, collaborator permission denial)
- Failure state exposed: GitHub API error messages surfaced verbatim via `error` field; no information loss on mutation failures

## Inputs

- `src/resources/extensions/pr-lifecycle/pr-address-utils.ts` (from T02) — `resolveThread` and `replyToThread` exports to import
- `src/resources/extensions/pr-lifecycle/index.ts` (from T03) — `kata_fetch_pr_comments` already registered; add two more tools following same pattern
- `src/resources/extensions/kata/tests/pr-address.test.ts` (from T01) — should already pass from T02; confirm no regressions

## Expected Output

- `src/resources/extensions/pr-lifecycle/index.ts` — final state: 3 S03 tools registered (`kata_fetch_pr_comments`, `kata_resolve_thread`, `kata_reply_to_thread`); TypeScript clean; all tests pass
- Slice S03 complete: contract-level proof of all three tools and `summarizeComments` pure function
