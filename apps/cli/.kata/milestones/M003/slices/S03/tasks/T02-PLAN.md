---
estimated_steps: 5
estimated_files: 1
---

# T02: Implement `pr-address-utils.ts`

**Slice:** S03 — Address Review Comments
**Milestone:** M003

## Description

Create `src/resources/extensions/pr-lifecycle/pr-address-utils.ts` — the pure utility module for S03. This module follows the same structure as `pr-review-utils.ts`: exported TypeScript interfaces, a pure `summarizeComments` function (unit-tested), and two thin GraphQL mutation wrappers (`resolveThread`, `replyToThread`) that are integration-only (no unit tests, same as `kata_create_pr`'s `create_pr_safe.py` invocation).

**Critical instruction from S02:** Read `pr-address.test.ts` before writing any code. Match the exact exported names and parameter shapes — the tests define the contract.

## Steps

1. Read `src/resources/extensions/kata/tests/pr-address.test.ts` to capture the exact import names and fixture shapes. Note how `summarizeComments` is called in each test — that is the function signature to implement.

2. Define TypeScript interfaces at the top of the module:
   - `ConversationComment`: `{ id: string; body: string; author: { login: string }; createdAt: string; updatedAt: string }`
   - `PrReview`: `{ id: string; state: string; body: string; submittedAt: string; author: { login: string } }`
   - `ReviewThread`: `{ id: string; isResolved: boolean; isOutdated: boolean; path: string | null; line: number | null; comments: { nodes: Array<{ id: string; body: string; author: { login: string }; createdAt: string }> } }`
   - `FetchCommentsResult`: `{ pull_request: object; conversation_comments: ConversationComment[]; reviews: PrReview[]; review_threads: ReviewThread[] }`
   - `NumberedComment`: `{ n: number; type: "conversation" | "review" | "thread"; author: string; body: string; isResolved?: boolean; isOutdated?: boolean; threadId?: string; path?: string | null; line?: number | null }`
   - `SummarizeResult`: `{ numbered: NumberedComment[]; totalCount: number; actionableCount: number }`

3. Implement `export function summarizeComments(data: FetchCommentsResult): SummarizeResult`:
   - Let `n = 0` counter; let `numbered: NumberedComment[] = []`
   - Iterate `data.conversation_comments`: push `{ n: ++n, type: "conversation", author: c.author.login, body: c.body }`
   - Iterate `data.reviews`: push `{ n: ++n, type: "review", author: r.author.login, body: r.body || "[no comment]" }`
   - Iterate `data.review_threads`: first comment = `t.comments.nodes[0]`; push `{ n: ++n, type: "thread", author: firstComment?.author.login ?? "unknown", body: firstComment?.body ?? "", isResolved: t.isResolved, isOutdated: t.isOutdated, threadId: t.id, path: t.path, line: t.line }`
   - `actionableCount = numbered.filter(e => !e.isResolved && !e.isOutdated).length`
   - Return `{ numbered, totalCount: numbered.length, actionableCount }`

4. Define `shellEscape` locally (identical to the one in `index.ts` — not re-exported from there):
   ```typescript
   function shellEscape(arg: string): string {
     return "'" + arg.replace(/'/g, "'\\''") + "'";
   }
   ```
   Then implement `export function resolveThread(threadId: string, cwd?: string)`:
   - Define `RESOLVE_MUTATION` as a string constant with the `resolveReviewThread` GraphQL mutation
   - Build command: `"gh api graphql -F query=@- -F " + shellEscape("threadId=" + threadId)`
   - Run `execSync(cmd, { input: RESOLVE_MUTATION, cwd: cwd ?? process.cwd(), encoding: "utf8", stdio: ["pipe","pipe","pipe"] })`
   - Parse JSON; return `{ ok: true, thread: { id, isResolved } }` from `data.resolveReviewThread.thread`
   - Catch: return `{ ok: false, phase: "resolve-failed" as const, error: stderr or message }`

5. Implement `export function replyToThread(threadId: string, body: string, cwd?: string)`:
   - Define `REPLY_MUTATION` constant with `addPullRequestReviewThreadReply` mutation
   - Write body to `tmpPath = join(tmpdir(), randomUUID() + ".md")`
   - In a try block: `writeFileSync(tmpPath, body, "utf8")`; build command with `-F body=@${shellEscape(tmpPath)}`; run execSync with REPLY_MUTATION as input
   - In finally: `try { unlinkSync(tmpPath) } catch { }`
   - On success: return `{ ok: true, comment: { id, body } }` from `data.addPullRequestReviewThreadReply.comment`
   - Catch: return `{ ok: false, phase: "reply-failed" as const, error }`

## Must-Haves

- [ ] `summarizeComments` exported with correct name and signature matching test imports
- [ ] All 4 `pr-address.test.ts` tests pass after this task
- [ ] `resolveThread` and `replyToThread` exported (called by T04)
- [ ] `replyToThread` uses temp file + `-F body=@<tmpPath>` pattern; temp file cleaned up in finally
- [ ] `resolveThread` never resolves an already-resolved thread — callers should check `isResolved` before calling (noted in function JSDoc)
- [ ] TypeScript compiles without errors

## Verification

- `npm test -- --test-name-pattern "summarizeComments"` → all 4 tests pass (exit 0)
- `npm test` → full suite passes, no regressions
- `npx tsc --noEmit` → no errors

## Observability Impact

- Signals added/changed: `resolveThread` returns `{ ok: false, phase: "resolve-failed", error: <gh stderr> }` on mutation failure; `replyToThread` returns `{ ok: false, phase: "reply-failed", error: <gh stderr> }` on failure
- How a future agent inspects this: `phase` field routes diagnosis; `error` field contains raw `gh api graphql` stderr (includes GitHub API error messages such as "Already resolved" or "Must be a collaborator")
- Failure state exposed: mutation stderr preserved in error field — no information loss on failure paths

## Inputs

- `src/resources/extensions/kata/tests/pr-address.test.ts` (from T01) — **read first** to confirm export names and fixture shapes before implementing
- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — module structure pattern to follow (pure functions + execSync wrappers, never throw)
- `src/resources/extensions/pr-lifecycle/index.ts` — `shellEscape` implementation to copy locally
- S03-RESEARCH.md GraphQL mutations reference — exact mutation query strings for `resolveReviewThread` and `addPullRequestReviewThreadReply`

## Expected Output

- `src/resources/extensions/pr-lifecycle/pr-address-utils.ts` — new module exporting `summarizeComments`, `resolveThread`, `replyToThread`, and the TypeScript interfaces
- All 4 unit tests in `pr-address.test.ts` now pass
