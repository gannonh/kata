# S03: Address Review Comments — Research

**Date:** 2026-03-12

## Summary

S03 adds three new tools to the `pr-lifecycle` extension: `kata_fetch_pr_comments` (runs the already-bundled `fetch_comments.py` and returns structured JSON), `kata_resolve_thread` (resolves an inline review thread via `resolveReviewThread` GraphQL mutation), and `kata_reply_to_thread` (replies to an inline review thread via `addPullRequestReviewThreadReply` GraphQL mutation). A new `pr-address-utils.ts` module hosts the pure utility function (`summarizeComments`) plus the thin GraphQL mutation wrappers — keeping `index.ts` as the registration layer.

The foundation is already in place: `fetch_comments.py` is bundled verbatim from the user's `gh-address-comments` skill, `gh-utils.ts` provides all pre-flight checks, and the `shellEscape` + PIPE + temp-file pattern from S01 handles the only tricky part (passing arbitrary body text to the reply mutation without shell interpolation). This is genuinely low-risk: no new API clients, no new external dependencies, no new script infrastructure.

The test contract focuses on the one pure function worth unit-testing: `summarizeComments`, which transforms the structured `fetch_comments.py` JSON output into a numbered presentation list with resolved/outdated filtering. Thread resolution and reply are execSync wrappers — integration-only, similar to how `kata_create_pr`'s actual `gh` invocation is not covered by unit tests.

## Recommendation

Implement in four tasks following the established TDD gate pattern:
1. **T01 — Scaffold + failing tests**: Create `pr-address.test.ts` with tests for `summarizeComments`. Import fails (MODULE_NOT_FOUND) until T02.
2. **T02 — `pr-address-utils.ts`**: `summarizeComments` pure function + `resolveThread`, `replyToThread`, `replyToConversationComment` mutation wrappers.
3. **T03 — `kata_fetch_pr_comments` tool**: Pre-flight checks → run `fetch_comments.py` via execSync → return parsed structured data.
4. **T04 — `kata_resolve_thread` + `kata_reply_to_thread` tools + TypeScript verification**: Register two new tools in `index.ts`, import from `pr-address-utils.ts`. Run `npx tsc --noEmit` + test suite.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Fetching all three PR comment types via GraphQL | `scripts/fetch_comments.py` (already bundled, battle-tested) | Handles pagination, all three comment types (conversation, reviews, inline threads), node IDs returned for mutation use |
| `gh` pre-flight checks | `gh-utils.ts` — `isGhInstalled`, `isGhAuthenticated` | Same pattern as `kata_create_pr` and `kata_review_pr` — consistent phase enum |
| Shell-escaping args for execSync | `shellEscape()` in `index.ts` | Single-quote wrapping already defined in the same file |
| Arbitrary body text with special characters | Write to temp file + `-F body=@<tmpFile>` (same philosophy as `create_pr_safe.py` body-file pattern) | Prevents shell interpolation of newlines and quotes in reviewer reply text |

## Existing Code and Patterns

- `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py` — returns `{ pull_request, conversation_comments, reviews, review_threads }` JSON to stdout; `review_threads[*].id` is the node ID needed for `resolveReviewThread` and `addPullRequestReviewThreadReply` mutations
- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — `isGhInstalled()`, `isGhAuthenticated()`, `detectGitHubRepo(cwd)` all available; import via `./gh-utils.js`
- `src/resources/extensions/pr-lifecycle/index.ts` — `shellEscape()` helper defined at top; PIPE constant in `gh-utils.ts`; `kata_create_pr` pre-flight chain is the exact pattern to follow for `kata_fetch_pr_comments`
- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — module pattern for pure utility functions (exported individually, tested independently); `pr-address-utils.ts` should follow the same structure
- `src/resources/extensions/kata/tests/pr-review.test.ts` — 8 unit tests on pure functions; `pr-address.test.ts` should follow the same pattern (top-level `await import(...)` fails until module exists — TDD gate)
- `fetch_comments.py` GraphQL pattern: `gh api graphql -F query=@- -F var=value` with mutation string passed as stdin to `execSync(..., { input: MUTATION_QUERY })` — used for `resolveThread` and `replyToThread`

## Constraints

- **`scripts/` not synced by `resource-loader.ts`** (known limitation from S01): `kata_fetch_pr_comments` resolves the script path via `dirname(fileURLToPath(import.meta.url))` so it works at dev time from `src/`; production sync is deferred to S05
- **GraphQL node IDs**: `resolveReviewThread` and `addPullRequestReviewThreadReply` require the opaque node ID from `review_threads[*].id` (e.g., `PRRT_kwDO...`), not the numeric review ID — `fetch_comments.py` returns these correctly
- **`reply` mutation variable safety**: The `body` parameter in `addPullRequestReviewThreadReply` can contain newlines and quotes; must use `-F body=@<tempFile>` (write to temp, same pattern as S01's body-file approach) — NOT `-F body="..."` inline
- **`resolveReviewThread` input schema**: The mutation takes `input: { threadId: ID! }` — the variable name must be `threadId` and it is passed as the `threadId` field of the `input` object in the mutation definition
- **Outdated threads**: `fetch_comments.py` returns `isOutdated: true` for threads where the code was changed since the thread was created; `summarizeComments` should flag these so the agent doesn't attempt to resolve them
- **Already-resolved threads**: `isResolved: true` threads should be filtered or marked in the summary so the agent skips them by default
- **python3 required**: `kata_fetch_pr_comments` must check `python3 --version` (same as `kata_create_pr`) — failure returns `{ ok: false, phase: "python3-missing" }`

## Common Pitfalls

- **Using `-F body="<multiline-string>"` for the reply mutation** — shell interpolation of newlines and quotes will corrupt or truncate the reply body. Write to temp file, use `-F body=@<tmpPath>`, clean up in `finally`.
- **Confusing numeric review IDs with node IDs** — GitHub's REST API uses numeric IDs; GraphQL uses opaque node IDs. `fetch_comments.py` returns node IDs in `review_threads[*].id`. Do not pass numeric IDs to the mutations.
- **`query=@-` and `--input` conflict** — `gh api graphql --input -` reads the entire request body (JSON with `query` + `variables`) from stdin, which conflicts with using `-F` for variables. Use the `fetch_comments.py` pattern: `query=@-` via stdin + `-F var=value` for simple variables, or `-F var=@<file>` for complex values.
- **Calling `resolveReviewThread` on already-resolved threads** — GitHub returns an error if the thread is already resolved. Check `isResolved` before calling.
- **`pr-address-utils.ts` exports must match test imports** — read the test file before coding the implementation (same lesson from S02 T02 where parameter shapes were corrected by reading tests first).

## Open Risks

- `addPullRequestReviewThreadReply` requires the authenticated user to be a collaborator with write access to the repo; if running against a fork PR this may fail — surface as `{ ok: false, phase: "reply-failed", error: <stderr> }`
- `fetch_comments.py` output for PRs with 100+ comments will be correct due to pagination but may produce very large JSON; the tool should return the raw parsed data and let the agent decide what to surface rather than truncating

## Tool Surface Design

### `kata_fetch_pr_comments`
```
params: { cwd?: string }
pre-flight: isGhInstalled, isGhAuthenticated, python3 present
action: run scripts/fetch_comments.py, parse stdout as JSON
returns (success): { ok: true, pull_request, conversation_comments, reviews, review_threads }
returns (failure): { ok: false, phase: "gh-missing"|"gh-unauth"|"python3-missing"|"fetch-failed", error, hint }
```

### `kata_resolve_thread`
```
params: { threadId: string, cwd?: string }
pre-flight: isGhInstalled, isGhAuthenticated
action: gh api graphql -F query=@- -F threadId=<threadId> with resolveReviewThread mutation
returns (success): { ok: true, thread: { id, isResolved } }
returns (failure): { ok: false, phase: "gh-missing"|"gh-unauth"|"resolve-failed", error }
```

### `kata_reply_to_thread`
```
params: { threadId: string, body: string, cwd?: string }
pre-flight: isGhInstalled, isGhAuthenticated
action: write body to temp file, gh api graphql -F query=@- -F threadId=<threadId> -F body=@<tmpPath>
         with addPullRequestReviewThreadReply mutation; clean up temp in finally
returns (success): { ok: true, comment: { id, body } }
returns (failure): { ok: false, phase: "gh-missing"|"gh-unauth"|"reply-failed", error }
```

**Conversation comment replies** (non-inline) can be done by the agent directly via:
```bash
gh api /repos/{owner}/{repo}/issues/{prNumber}/comments --method POST -f body='...'
```
No dedicated tool needed — agent uses `bash` tool for this.

## GraphQL Mutations Reference

```graphql
# resolveReviewThread
mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}

# addPullRequestReviewThreadReply
mutation ReplyToThread($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(
    input: { pullRequestReviewThreadId: $threadId, body: $body }
  ) {
    comment { id body author { login } }
  }
}
```

Called via: `gh api graphql -F query=@- -F threadId=<id> [-F body=@<tmpFile>]` with mutation as execSync `input`.

## `summarizeComments` Contract (pure function, unit-testable)

Input: raw `fetch_comments.py` output object.
Output: `{ numbered: Array<{ n: number, type: "conversation"|"review"|"thread", author, body, isResolved, isOutdated, threadId?, path?, line? }>, totalCount: number, actionableCount: number }`.

Filters: resolves threads with `isResolved: true` to a "resolved" category; threads with `isOutdated: true` get a warning flag. Reviews with empty body (approval/request-changes with no text) are included but flagged. Conversation comments are included as-is.

Tests should cover: empty input returns zero counts; resolved threads are marked resolved; outdated threads are flagged; numbering is sequential starting at 1.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| GitHub PR workflows | `pull-requests` skill | already installed at `/Users/gannonhall/.agents/skills/pull-requests/` |
| GitHub PR comment addressing | `gh-address-comments` skill | already installed at `/Users/gannonhall/.agents/skills/gh-address-comments/` |

No new skills to install — both primary reference skills are present.

## Sources

- `gh-address-comments` SKILL.md + `addressing-workflow.md` reference: fetch → enumerate → triage → fix → resolve → push → CI monitor workflow (source: installed skill)
- `fetch_comments.py` GraphQL schema: 3 connection types (comments, reviews, reviewThreads), node IDs in `id` field, `isResolved`/`isOutdated` flags on threads (source: `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py`)
- `gh api graphql --help`: `--input -` for full JSON body, `-F var=@file` for file-backed variables, `query=@-` for stdin query (source: `gh --version 2.88.0`)
- S01 Forward Intelligence: `scripts/` not synced by resource-loader; script path via `import.meta.url`; shellEscape pattern; pre-flight phase enum (source: `S01-SUMMARY.md`)
- S02 Forward Intelligence: agentsDir path depth (two `..` levels, not three); parameter shape corrections by reading test files first before implementing (source: `S02-SUMMARY.md`)
