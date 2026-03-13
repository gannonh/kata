# S02: Bundled Reviewer Subagents & Parallel Dispatch — UAT

**Milestone:** M003
**Written:** 2026-03-12

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S02's proof level is contract-only (stated in S02-PLAN.md). The slice ships a tool that returns a dispatch plan — actual parallel execution requires a real GitHub PR with `gh` installed and authenticated, which is deferred to operational verification in S05. All contract-level behavior (reviewer scoping, prompt assembly, finding aggregation, pre-flight error phases) is fully covered by the 8 unit tests.

## Preconditions

For contract UAT (sufficient to mark S02 done):
- `npm test` runs without errors in the slice branch
- `npx tsc --noEmit` exits 0

For live-runtime UAT (optional, validates end-to-end flow):
- `gh` CLI installed and authenticated (`gh auth status` returns OK)
- An open PR on the current branch in GitHub
- Node.js ≥ 18

## Smoke Test

Run: `npm test 2>&1 | grep -c "✔"` — confirm output is ≥ 100.

Confirm the 8 pr-review tests all pass: `npm test 2>&1 | grep "pr-review\|scopeReviewers\|buildReviewer\|aggregateFindings"`.

## Test Cases

### 1. scopeReviewers heuristics

1. Run `npm test 2>&1 | grep -E "scopeReviewers"`
2. **Expected:** 5 passing tests: always includes `pr-code-reviewer`; includes `pr-failure-finder` on `try {`; includes `pr-test-analyzer` on `.test.ts` changedFiles; excludes `pr-code-simplifier` on short diff; includes `pr-code-simplifier` on large diff (>100 lines)

### 2. buildReviewerTaskPrompt embeds PR title

1. Run `npm test 2>&1 | grep "buildReviewerTaskPrompt"`
2. **Expected:** 1 passing test: returns non-empty string containing the PR title string

### 3. aggregateFindings deduplication and severity grouping

1. Run `npm test 2>&1 | grep "aggregateFindings"`
2. **Expected:** 2 passing tests: fixture outputs produce Critical and Important headings; repeated `file:line` fingerprints appear exactly once (not twice)

### 4. kata_review_pr tool registered

1. Run `grep "kata_review_pr" src/resources/extensions/pr-lifecycle/index.ts`
2. **Expected:** Matches at least twice (tool comment header + name field)

### 5. 6 reviewer agent files present with correct frontmatter

1. Run `ls src/resources/agents/pr-*.md | wc -l`
2. **Expected:** `6`
3. Run `grep "^name:" src/resources/agents/pr-*.md`
4. **Expected:** All 6 names present: `pr-code-reviewer`, `pr-failure-finder`, `pr-test-analyzer`, `pr-type-design-analyzer`, `pr-comment-analyzer`, `pr-code-simplifier`

### 6. TypeScript clean

1. Run `npx tsc --noEmit`
2. **Expected:** Exit 0, no output

### 7. Live runtime — kata_review_pr dispatch plan (optional)

_Only runnable with a real open PR and authenticated gh CLI._

1. In Kata, call `kata_review_pr` (no params, from a branch with an open PR)
2. **Expected:** Returns `{ ok: true, prNumber: <N>, selectedReviewers: [...], reviewerTasks: [{agent: "pr-code-reviewer", task: "..."}, ...] }`
3. Verify `reviewerTasks` contains at least 1 entry (pr-code-reviewer always included)
4. Pass `reviewerTasks` to `subagent({ tasks: reviewerTasks })` in parallel mode
5. **Expected:** Each reviewer returns structured findings; `aggregateFindings` called with collected outputs produces a markdown report with at least one `## 🔴 Critical`, `## 🟡 Important`, or `## 💡 Suggestions` section

## Edge Cases

### Empty diff (PR created but no commits vs base)

1. Call `kata_review_pr` on a branch with an open PR but no changes committed vs base
2. **Expected:** `{ ok: false, phase: "diff-empty", error: "...", hint: "..." }`

### Not on a PR branch

1. Call `kata_review_pr` from a branch with no open PR (e.g. `main`)
2. **Expected:** `{ ok: false, phase: "not-in-pr", error: "No open PR found for current branch", hint: "Ensure the branch has an open PR on GitHub" }`

### gh not installed

1. Simulate by setting PATH to exclude `gh`
2. **Expected:** `{ ok: false, phase: "gh-missing", error: "...", hint: "..." }`

### Docs-only diff — minimal reviewers

1. Call `scopeReviewers({ diff: "...only README changes...", changedFiles: ["README.md"] })` with a diff containing no code patterns
2. **Expected:** Returns `["pr-code-reviewer"]` only (no failure-finder, test-analyzer, simplifier, type-design-analyzer, comment-analyzer)

## Failure Signals

- `npm test` shows pr-review tests failing — regression in `pr-review-utils.ts` or test file corrupted
- `npx tsc --noEmit` exits non-zero — type error introduced in `index.ts` or `pr-review-utils.ts`
- `ls src/resources/agents/pr-*.md | wc -l` outputs less than 6 — agent files missing or moved
- `grep "^name:" src/resources/agents/pr-*.md` shows wrong names — frontmatter name mismatches `scopeReviewers` return values → REVIEWER_INSTRUCTIONS lookup will return undefined
- `kata_review_pr` returns `{ ok: false, phase: "not-in-pr" }` when a PR exists — `fetchPRContext` failing; check `gh pr view` output manually

## Requirements Proved By This UAT

- R201 — `kata_review_pr` tool returns a structured parallel dispatch plan; 6 bundled reviewer subagents exist; `scopeReviewers` applies diff-content heuristics; `aggregateFindings` produces severity-ranked, deduplicated output; 8 contract tests prove the full pipeline
- R207 — 6 bundled reviewer agent `.md` files in `src/resources/agents/pr-*.md` with correct `name:` frontmatter; synced via `resource-loader.ts`

## Not Proven By This UAT

- Live parallel dispatch: actual `subagent({ tasks: [...] })` call in parallel mode against a real PR — deferred to S05 operational verification
- `pr.review_on_create` preference gate: auto-running review after PR creation — deferred to S05
- Reviewer output quality: whether each reviewer agent actually returns useful, structured findings from real PR diffs — depends on reviewer system prompts and LLM behavior; heuristic only
- `~/.kata-cli/agent/agents/pr-*.md` sync: confirmed by pattern in resource-loader but not exercised in contract tests — verified at launch time

## Notes for Tester

The smoke test failure (`kata launches and loads extensions without errors`) is a pre-existing issue caused by the tarball-installed binary being stale. It is not caused by S02 changes and does not affect the 8 pr-review contract tests. Verify with `git stash && npm test 2>&1 | grep "kata launches"` to confirm it was present before S02.

The live-runtime test cases (case 7) require a real open PR and authenticated `gh` CLI. They are optional for S02 sign-off but recommended before S05 ships the `/kata pr review` command surface.
