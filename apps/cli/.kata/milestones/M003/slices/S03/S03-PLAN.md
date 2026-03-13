# S03: Address Review Comments

**Goal:** Three new tools in the `pr-lifecycle` extension: `kata_fetch_pr_comments` runs the bundled `fetch_comments.py` and returns structured JSON; `kata_resolve_thread` resolves an inline review thread via the `resolveReviewThread` GraphQL mutation; `kata_reply_to_thread` posts a reply to an inline review thread via the `addPullRequestReviewThreadReply` GraphQL mutation. A new `pr-address-utils.ts` module hosts the pure `summarizeComments` function plus thin GraphQL mutation wrappers.

**Demo:** Agent calls `kata_fetch_pr_comments` → gets `{ ok: true, pull_request, conversation_comments, reviews, review_threads }`. Calls `summarizeComments` on the result to get a numbered, actionable comment list with resolved/outdated filtering. Calls `kata_resolve_thread({ threadId })` to mark a thread resolved. Calls `kata_reply_to_thread({ threadId, body })` to post a reply.

## Must-Haves

- `kata_fetch_pr_comments`: pre-flights gh, auth, python3; runs `fetch_comments.py` via execSync; returns parsed JSON or `{ ok: false, phase, error, hint }`
- `kata_resolve_thread`: pre-flights gh, auth; runs `resolveReviewThread` mutation via `gh api graphql`; returns `{ ok: true, thread }` or `{ ok: false, phase, error }`
- `kata_reply_to_thread`: pre-flights gh, auth; writes body to temp file; runs `addPullRequestReviewThreadReply` mutation with `-F body=@<tmpPath>`; cleans up temp in finally; returns `{ ok: true, comment }` or `{ ok: false, phase, error }`
- `summarizeComments` pure function: sequential numbering from 1; `isResolved: true` threads included but excluded from `actionableCount`; `isOutdated: true` threads flagged; reviews with empty body included with body set to `"[no comment]"`
- All three tools registered in `index.ts`; TypeScript clean (`npx tsc --noEmit` exits 0); all prior tests still pass

## Proof Level

- This slice proves: contract
- Real runtime required: no (unit tests cover `summarizeComments`; GraphQL mutation wrappers are integration-only, same as `kata_create_pr`'s `create_pr_safe.py` invocation)
- Human/UAT required: no

## Verification

- `npm test` → all tests pass (T01 tests fail until T02; T02 makes them pass; full suite passes at T04)
- `npx tsc --noEmit` → exits 0 after T04
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok` after T04
- Three tools visible: grep for `"kata_fetch_pr_comments"`, `"kata_resolve_thread"`, `"kata_reply_to_thread"` in `index.ts`

## Observability / Diagnostics

- Runtime signals: all three tools return `{ ok: false, phase, error }` for every failure mode; `phase` enum covers each pre-flight stage and execution failure without prose parsing
- Inspection surfaces: inspect `phase` to branch on failure; `error` field surfaces `fetch_comments.py` stderr or GraphQL stderr verbatim; `hint` on pre-flight failures links to remediation
- Failure visibility: `kata_fetch_pr_comments` → `phase: "fetch-failed"` + raw Python stderr; `kata_resolve_thread` → `phase: "resolve-failed"` + raw `gh` stderr; `kata_reply_to_thread` → `phase: "reply-failed"` + raw `gh` stderr
- Redaction constraints: no secrets in error fields; only GitHub API stderr (safe to surface)

## Integration Closure

- Upstream surfaces consumed: `gh-utils.ts` (`isGhInstalled`, `isGhAuthenticated`), `scripts/fetch_comments.py` (already bundled from S01), `shellEscape()` helper in `index.ts`
- New wiring introduced in this slice: `pr-address-utils.ts` created and imported by `index.ts`; three `pi.addTool` registrations appended to `export default function(pi)`
- What remains before the milestone is truly usable end-to-end: S05 wires `resource-loader.ts` cpSync for `scripts/`; S05 adds `/kata pr address` command entry point for user invocation

## Tasks

- [ ] **T01: Create failing unit tests for `summarizeComments`** `est:20m`
  - Why: TDD gate — pins the `summarizeComments` contract before implementation; failing import is expected until T02 creates `pr-address-utils.ts`
  - Files: `src/resources/extensions/kata/tests/pr-address.test.ts`
  - Do: Create the file following the `pr-review.test.ts` structure. Top-level `await import("../../pr-lifecycle/pr-address-utils.js")` throws `ERR_MODULE_NOT_FOUND` until T02 — this is the TDD gate. Write 4 tests: (1) empty input (`conversation_comments: [], reviews: [], review_threads: []`) → `{ totalCount: 0, actionableCount: 0, numbered: [] }`; (2) resolved thread (single thread with `isResolved: true`) → entry in `numbered` has `isResolved: true`, `actionableCount: 0`; (3) outdated thread (single thread with `isOutdated: true, isResolved: false`) → entry in `numbered` has `isOutdated: true`, `actionableCount: 0`; (4) sequential numbering — one conversation comment + one review + one unresolved thread → `numbered[0].n === 1`, `numbered[1].n === 2`, `numbered[2].n === 3`. Include helper `makeThread(overrides)` to build minimal thread fixtures without repetition.
  - Verify: `npm test 2>&1 | grep -E "pr-address|ERR_MODULE"` → shows test file error (MODULE_NOT_FOUND); confirms tests are discovered and failing
  - Done when: `pr-address.test.ts` exists with 4 tests; test runner reports an error for the file (not silently skipped)

- [ ] **T02: Implement `pr-address-utils.ts`** `est:45m`
  - Why: Makes all 4 T01 tests pass; also ships `resolveThread` and `replyToThread` mutation wrappers consumed by T04
  - Files: `src/resources/extensions/pr-lifecycle/pr-address-utils.ts`
  - Do: Read `pr-address.test.ts` carefully before writing any code — match exact exported names and parameter shapes. Export `FetchCommentsResult` and `SummarizeResult` TypeScript interfaces. Implement `summarizeComments(data: FetchCommentsResult): SummarizeResult`: iterate conversation_comments (type:"conversation"), then reviews (type:"review"; set body to "[no comment]" when empty), then review_threads (type:"thread"; include `threadId: thread.id`, `path`, `line`, `isResolved`, `isOutdated`; pull author from `thread.comments.nodes[0]?.author.login ?? "unknown"`; pull body from first comment). Assign `n` sequentially starting at 1 across all entries. `actionableCount` = entries where `!isResolved && !isOutdated`. Implement `resolveThread(threadId: string, cwd?: string)`: build `RESOLVE_MUTATION` string constant; run `execSync('gh api graphql -F query=@- -F ' + shellEscape('threadId=' + threadId), { input: RESOLVE_MUTATION, cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })`; parse JSON response; return `{ ok: true, thread: { id, isResolved } }` or `{ ok: false, phase: "resolve-failed", error }`. Implement `replyToThread(threadId: string, body: string, cwd?: string)`: write body to `tmpPath = join(tmpdir(), randomUUID() + '.md')`; run mutation with `-F body=@<shellEscape(tmpPath)>` in finally-guarded block; return `{ ok: true, comment: { id, body } }` or `{ ok: false, phase: "reply-failed", error }`. Define `shellEscape` locally (same implementation as `index.ts`) since it's not exported from there.
  - Verify: `npm test -- --test-name-pattern "summarizeComments"` → 4 tests pass; `npx tsc --noEmit` → no errors on `pr-address-utils.ts`
  - Done when: all 4 `pr-address.test.ts` tests pass; TypeScript type-checks clean

- [ ] **T03: Register `kata_fetch_pr_comments` tool** `est:30m`
  - Why: Exposes `fetch_comments.py` as a structured tool with pre-flight checks and machine-readable failure phases, enabling the agent to fetch all PR comment types
  - Files: `src/resources/extensions/pr-lifecycle/index.ts`
  - Do: Add `kata_fetch_pr_comments` tool registration inside `export default function(pi)` following the `kata_create_pr` pre-flight pattern exactly. Pre-flight sequence: (1) `isGhInstalled()` → `{ ok: false, phase: "gh-missing", error, hint }`; (2) `isGhAuthenticated()` → `{ ok: false, phase: "gh-unauth", error, hint }`; (3) `execSync("python3 --version", PIPE)` in try/catch → `{ ok: false, phase: "python3-missing", error, hint }`. Resolve script path: `join(dirname(fileURLToPath(import.meta.url)), "scripts", "fetch_comments.py")`. Run `execSync("python3 " + shellEscape(scriptPath), { cwd, encoding: "utf8", stdio: ["pipe","pipe","pipe"] })`. Parse stdout with `JSON.parse`. Return `{ ok: true, ...parsed }` on success. Catch script errors and return `{ ok: false, phase: "fetch-failed", error: stderr_or_message, hint: "Ensure the current branch has an open PR and gh is authenticated." }`. Tool params: `{ cwd?: string }`.
  - Verify: `npx tsc --noEmit` → exits 0; extension loads: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok`
  - Done when: `kata_fetch_pr_comments` tool registered in `index.ts`; TypeScript clean; extension loads without error

- [ ] **T04: Register `kata_resolve_thread` + `kata_reply_to_thread` tools; full verification** `est:30m`
  - Why: Completes S03's tool surface; closes the slice with TypeScript clean and full test suite passing
  - Files: `src/resources/extensions/pr-lifecycle/index.ts`
  - Do: Add `import { resolveThread, replyToThread } from "./pr-address-utils.js"` to `index.ts` imports. Register `kata_resolve_thread` tool: params `{ threadId: string, cwd?: string }`; pre-flight `isGhInstalled` → `gh-missing`; `isGhAuthenticated` → `gh-unauth`; call `resolveThread(threadId, cwd)`; return its result directly. Register `kata_reply_to_thread` tool: params `{ threadId: string, body: string, cwd?: string }`; pre-flights gh + auth; call `replyToThread(threadId, body, cwd)`; return its result directly. Run `npx tsc --noEmit` and fix any type errors before declaring done. Run full `npm test` and fix any regressions.
  - Verify: `npx tsc --noEmit` → exits 0; `npm test` → all tests pass; `grep -c "kata_fetch_pr_comments\|kata_resolve_thread\|kata_reply_to_thread" src/resources/extensions/pr-lifecycle/index.ts` → 3
  - Done when: all three tools registered; `npx tsc --noEmit` exits 0; `npm test` exits 0

## Files Likely Touched

- `src/resources/extensions/pr-lifecycle/pr-address-utils.ts` (new)
- `src/resources/extensions/kata/tests/pr-address.test.ts` (new)
- `src/resources/extensions/pr-lifecycle/index.ts` (modified — import + 3 tool registrations)
