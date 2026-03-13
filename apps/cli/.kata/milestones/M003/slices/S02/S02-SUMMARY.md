---
id: S02
parent: M003
milestone: M003
provides:
  - 6 bundled PR reviewer agent definitions in src/resources/agents/pr-*.md
  - pr-review-utils.ts with 4 named exports (fetchPRContext, scopeReviewers, buildReviewerTaskPrompt, aggregateFindings)
  - kata_review_pr tool registered in pr-lifecycle/index.ts with structured pre-flight error surface and parallel dispatch plan
  - REVIEWER_INSTRUCTIONS map loaded at module init time from bundled .md files
requires:
  - slice: S01
    provides: gh-utils.ts (isGhInstalled, isGhAuthenticated), pr-lifecycle extension scaffold
affects:
  - S05
  - S03
key_files:
  - src/resources/extensions/kata/tests/pr-review.test.ts
  - src/resources/extensions/pr-lifecycle/pr-review-utils.ts
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/agents/pr-code-reviewer.md
  - src/resources/agents/pr-failure-finder.md
  - src/resources/agents/pr-test-analyzer.md
  - src/resources/agents/pr-type-design-analyzer.md
  - src/resources/agents/pr-comment-analyzer.md
  - src/resources/agents/pr-code-simplifier.md
key_decisions:
  - D039: kata_review_pr returns dispatch plan — agent orchestrates parallel execution via subagent pi tool
  - D040: REVIEWER_INSTRUCTIONS loaded at module init time (one-time I/O, static content, falls back gracefully)
  - D041: reviewer agent names use pr- prefix to prevent collision and clarify scope
patterns_established:
  - scopeReviewers, buildReviewerTaskPrompt accept object params (not positional args) — matches test contract; aggregateFindings accepts string[] not {reviewer,output}[]
  - REVIEWER_INSTRUCTIONS map built at module top-level so file I/O runs once at extension load time, not per tool call
  - loadReviewerInstructions strips YAML frontmatter via regex and falls back to a minimal prompt string if file is missing — never throws
  - agentsDir uses two ".." levels from pr-lifecycle/ to reach src/resources/, then /agents/ (not three levels)
observability_surfaces:
  - kata_review_pr returns { ok: false, phase: "gh-missing" | "gh-unauth" | "not-in-pr" | "diff-empty", error, hint } — machine-readable phase enum, no prose parsing needed
  - kata_review_pr returns { ok: true, prNumber, title, diff, selectedReviewers, reviewerTasks } on success — reviewerTasks[].agent names the reviewer, reviewerTasks[].task is the full self-contained prompt
  - selectedReviewers[] separately surfaced for diagnostics without parsing task strings
drill_down_paths:
  - .kata/milestones/M003/slices/S02/tasks/T01-SUMMARY.md
  - .kata/milestones/M003/slices/S02/tasks/T02-SUMMARY.md
  - .kata/milestones/M003/slices/S02/tasks/T03-SUMMARY.md
  - .kata/milestones/M003/slices/S02/tasks/T04-SUMMARY.md
duration: ~1.5h
verification_result: passed
completed_at: 2026-03-12
---

# S02: Bundled Reviewer Subagents & Parallel Dispatch

**6 bundled PR reviewer subagents, `pr-review-utils.ts` for diff-scoped reviewer dispatch, and `kata_review_pr` tool that returns a machine-readable parallel dispatch plan with pre-flighted reviewer task prompts — 8 contract tests pass, TypeScript clean.**

## What Happened

**T01** established the contract via 8 failing tests covering `scopeReviewers`, `buildReviewerTaskPrompt`, and `aggregateFindings` — using the TDD gate pattern from S01's `pr-body-composer.test.ts`. The test file imported from the not-yet-existing `pr-review-utils.ts`, producing the expected MODULE_NOT_FOUND failure.

**T02** implemented `pr-review-utils.ts` to match the test contract. Three parameter-shape corrections from the task plan were resolved by reading the test file before coding: `scopeReviewers` and `buildReviewerTaskPrompt` take objects (not positional args), and `aggregateFindings` takes `string[]` (not `{reviewer, output}[]`). The `aggregateFindings` parser scans for severity markers, buffers lines until the next marker, deduplicates by `**file:line**` fingerprint, and falls back to `## Raw Findings` when no structured content is found. All 8 tests passed; TypeScript clean.

**T03** created the 6 reviewer `.md` agent definition files by reading the pull-requests skill reference files verbatim. Each file has triple-dash YAML frontmatter (`name:`, `description:`) followed by the full reviewer system prompt. The `name:` values match exactly what `scopeReviewers` returns. `resource-loader.ts` already syncs `src/resources/agents/` to `~/.kata-cli/agent/agents/` — no new wiring needed.

**T04** extended `pr-lifecycle/index.ts` with the `kata_review_pr` tool. The `REVIEWER_INSTRUCTIONS` map is built at module top-level using `loadReviewerInstructions()` which reads the 6 bundled files, strips frontmatter via regex, and falls back gracefully. The tool pre-flights `gh` installation and auth (same as `kata_create_pr`), calls `fetchPRContext`, scopes reviewers, builds per-reviewer task prompts, and returns the dispatch plan. The task plan incorrectly specified three `..` levels for `agentsDir` — the correct path uses two levels (pr-lifecycle/ → resources/ → agents/).

## Verification

```
# All 8 pr-review contract tests pass
npm test 2>&1 | grep -E "scopeReviewers|buildReviewer|aggregateFindings"
# → ✔ scopeReviewers always includes pr-code-reviewer
# → ✔ scopeReviewers includes pr-failure-finder when diff contains try {
# → ✔ scopeReviewers includes pr-test-analyzer when changedFiles contains a test file
# → ✔ scopeReviewers excludes pr-code-simplifier for a short diff (< 30 lines)
# → ✔ scopeReviewers includes pr-code-simplifier for a large diff (> 100 lines)
# → ✔ buildReviewerTaskPrompt returns a non-empty string containing the PR title
# → ✔ aggregateFindings includes Critical and Important headings from fixture outputs
# → ✔ aggregateFindings deduplicates repeated file references

# TypeScript clean
npx tsc --noEmit   # → exit 0 (no output)

# 6 reviewer agent files present
ls src/resources/agents/pr-*.md | wc -l   # → 6

# All 6 have correct name: frontmatter
grep "^name:" src/resources/agents/pr-*.md
# → pr-code-reviewer, pr-code-simplifier, pr-comment-analyzer,
#    pr-failure-finder, pr-test-analyzer, pr-type-design-analyzer

# kata_review_pr tool registered
grep "kata_review_pr" src/resources/extensions/pr-lifecycle/index.ts   # → found

# Overall test count: 100 pass / 1 fail (pre-existing smoke test — pi.addTool is not a function in tarball binary)
```

The pre-existing smoke test failure (`kata launches and loads extensions without errors`) was present before S02 and is caused by the tarball-installed binary not being rebuilt to reflect recent extension changes. It is unrelated to S02 scope.

## Requirements Advanced

- R201 — `kata_review_pr` tool + 6 bundled reviewer subagents + `pr-review-utils.ts` dispatch logic all shipped and unit-tested; parallel dispatch infrastructure is complete at the contract level
- R207 — 6 bundled reviewer agent `.md` files created in `src/resources/agents/pr-*.md` with correct frontmatter; synced to `~/.kata-cli/agent/agents/` via existing resource-loader

## Requirements Validated

- R201 — Contract proof complete: 8/8 unit tests pass covering `scopeReviewers` (5 tests), `buildReviewerTaskPrompt` (1 test), `aggregateFindings` (2 tests); `kata_review_pr` tool registered and TypeScript-clean; dispatch plan structure verified by inspection
- R207 — 6 bundled reviewer agent definitions verified: `ls src/resources/agents/pr-*.md | wc -l` → 6; all 6 have correct `name:` frontmatter fields; `resource-loader.ts` sync path already in place

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

1. **Parameter shapes corrected from plan prose**: `scopeReviewers` takes `{ diff, changedFiles }` (object); `buildReviewerTaskPrompt` takes a single object param; `aggregateFindings` takes `string[]` not `{ reviewer, output }[]`. Tests are authoritative — implementation matches tests, not plan prose.
2. **`agentsDir` path corrected**: Task plan T04 specified three `..` levels (would resolve to `src/agents/` — non-existent). Correct is two levels: `pr-lifecycle/ → resources/ → agents/`. Confirmed at runtime via module load check.

## Known Limitations

- Live parallel dispatch is not exercised in unit tests — `fetchPRContext` wraps real `gh` CLI calls and is excluded from test scope by design. The complete runtime flow (call `kata_review_pr` → `subagent({ tasks: [...] })` → aggregate reviewer outputs) requires a real PR on GitHub with `gh` installed and authenticated.
- `aggregateFindings` parsing is heuristic: it matches common severity-marker patterns but reviewers that return entirely unstructured prose will fall through to `## Raw Findings`. Structured finding output depends on each reviewer agent following their instructions.
- The pre-existing smoke test failure (`kata launches and loads extensions without errors`) is caused by the installed tarball binary being stale. This will be resolved by the next `npm publish` or a rebuild.

## Follow-ups

- S05 must wire `/kata pr review` subcommand to call `kata_review_pr` and dispatch the returned `reviewerTasks` via `subagent({ tasks: [...] })` in parallel mode, then call `aggregateFindings` on the collected outputs
- S05 must ensure `resource-loader.ts` syncs scripts (not just agents and extensions) if any new bundled scripts are added
- S05 must consume `pr.review_on_create` preference to auto-run review after `kata_create_pr`

## Files Created/Modified

- `src/resources/extensions/kata/tests/pr-review.test.ts` — new; 8 contract tests for scopeReviewers, buildReviewerTaskPrompt, aggregateFindings
- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — new; 4 named exports: fetchPRContext, scopeReviewers, buildReviewerTaskPrompt, aggregateFindings
- `src/resources/extensions/pr-lifecycle/index.ts` — added readFileSync import, pr-review-utils.js imports, loadReviewerInstructions() helper, REVIEWER_INSTRUCTIONS map, kata_review_pr tool registration
- `src/resources/agents/pr-code-reviewer.md` — new; reviews code diffs for bugs, CLAUDE.md compliance, quality issues (confidence ≥ 80 only)
- `src/resources/agents/pr-failure-finder.md` — new; audits error handling for silent failures, missing try/catch, inadequate user feedback
- `src/resources/agents/pr-test-analyzer.md` — new; evaluates test coverage quality, identifies untested critical paths and error conditions
- `src/resources/agents/pr-type-design-analyzer.md` — new; analyzes type designs for invariant strength and encapsulation quality
- `src/resources/agents/pr-comment-analyzer.md` — new; identifies comment rot: inaccurate, outdated, misleading, or redundant comments
- `src/resources/agents/pr-code-simplifier.md` — new; refines code for clarity, consistency, and maintainability without altering functionality

## Forward Intelligence

### What the next slice should know
- `kata_review_pr` returns a dispatch plan — the agent (not the tool) must call `subagent({ tasks: reviewerTasks })` in parallel mode and collect outputs; then pass the string array to `aggregateFindings`
- `scopeReviewers` is heuristic and conservative: it always includes `pr-code-reviewer` and applies diff-content pattern matching for the other 5. Overriding with `params.reviewers` is supported if the user wants explicit control
- The `REVIEWER_INSTRUCTIONS` map is populated at extension load time. If a reviewer's `.md` file is missing, it falls back to a minimal prompt string — this is silent degradation. S05 tooling should verify all 6 files are present during `kata doctor`

### What's fragile
- `aggregateFindings` parsing — depends on reviewer agents emitting lines matching severity marker patterns (`critical:`, `important:`, `**file:line**`). If reviewer prompts are updated, check that output format still matches the parser
- `fetchPRContext` null-on-failure contract — callers must always check for null and return `{ ok: false, phase: 'not-in-pr' }`. Do not add try/catch wrappers that would mask the null return

### Authoritative diagnostics
- `kata_review_pr` return value — inspect `ok` and `phase` first; `selectedReviewers[]` names which reviewers were dispatched; `reviewerTasks[].task` is the full prompt for debugging reviewer context quality
- `ls ~/.kata-cli/agent/agents/pr-*.md` after launch — confirms all 6 reviewer files were synced; `cat` any file to verify frontmatter and content are intact

### What assumptions changed
- Plan assumed `fetchPRContext` parses `changedFiles` from `gh pr diff --stat` — implementation uses a line-by-line stat parser; callers (T04) use the returned `changedFiles` field directly so this detail is opaque
- Plan stated three `..` levels for agentsDir — two is correct; the plan's prose was wrong about the directory structure
