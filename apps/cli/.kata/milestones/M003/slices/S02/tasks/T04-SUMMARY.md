---
id: T04
parent: S02
milestone: M003
provides:
  - kata_review_pr tool registered in pr-lifecycle/index.ts
  - REVIEWER_INSTRUCTIONS map loading all 6 bundled agent .md files at module init
  - Structured { ok, phase, error, hint } pre-flight error surface (gh-missing, gh-unauth, not-in-pr, diff-empty)
  - reviewerTasks array: { agent: string, task: string }[] ready for subagent parallel dispatch
key_files:
  - src/resources/extensions/pr-lifecycle/index.ts
key_decisions:
  - agentsDir uses two ".." levels (not three as the plan mistakenly stated) — from pr-lifecycle/ two levels up lands at src/resources/, then /agents/. Three levels would land at src/ which has no agents/ subdir.
patterns_established:
  - loadReviewerInstructions strips YAML frontmatter via regex and falls back to a minimal prompt string if the file is missing — never throws
  - REVIEWER_INSTRUCTIONS map is built at module top-level (not inside handler) so file I/O runs once at extension load time, not per tool call
  - scopeReviewers called with object destructuring { diff, changedFiles } matching the function signature from T02
observability_surfaces:
  - kata_review_pr returns { ok: false, phase: "gh-missing" | "gh-unauth" | "not-in-pr" | "diff-empty", error, hint } — machine-readable phase enum, no prose parsing needed
  - kata_review_pr returns { ok: true, prNumber, title, diff, selectedReviewers, reviewerTasks } — reviewerTasks[].agent names the reviewer, reviewerTasks[].task is the full self-contained prompt
  - selectedReviewers[] is separately surfaced for diagnostics (which reviewers were dispatched without needing to parse task strings)
duration: ~20min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T04: Register `kata_review_pr` tool and validate TypeScript

**`kata_review_pr` tool registered in `pr-lifecycle/index.ts`; TypeScript clean; all 8 pr-review tests pass; module loads without error.**

## What Happened

Extended `src/resources/extensions/pr-lifecycle/index.ts` with three additions:

1. **New imports** — added `readFileSync` from `node:fs` and the three functions (`fetchPRContext`, `scopeReviewers`, `buildReviewerTaskPrompt`) from `./pr-review-utils.js`.

2. **REVIEWER_INSTRUCTIONS map** — built at module top-level using `loadReviewerInstructions()`, which reads each of the 6 bundled `pr-*.md` agent files, strips YAML frontmatter via regex, and falls back to a minimal prompt string if the file is missing (never throws). The `agentsDir` path uses two `..` levels from the `pr-lifecycle/` directory to land at `src/resources/`, then `agents/` — the task plan incorrectly specified three levels, which would resolve to `src/agents/` (non-existent).

3. **`kata_review_pr` tool** — registered via `pi.addTool()` after `kata_create_pr`. Runs the same `isGhInstalled()` / `isGhAuthenticated()` pre-flights as `kata_create_pr`, then calls `fetchPRContext(cwd)` (returns null on failure → `not-in-pr` phase), checks for empty diff (`diff-empty` phase), scopes reviewers via `scopeReviewers({ diff, changedFiles })`, builds per-reviewer task prompts via `buildReviewerTaskPrompt({...})`, and returns the dispatch plan.

## Verification

```
npx tsc --noEmit          → exit 0 (no output)
npm test (pr-review)      → 8/8 pass
grep kata_review_pr index.ts → found (tool name + comment header)
module load check         → "ok" — no import errors
ls src/resources/agents/pr-*.md | wc -l → 6
```

The pre-existing smoke test failure (`kata launches and loads extensions without errors`) was confirmed present before T04's changes (git stash + re-run verified). Not introduced by this task.

## Diagnostics

- Call `kata_review_pr` → inspect `ok` field first. If `false`, `phase` distinguishes the pre-flight failure mode without prose parsing.
- `phase: "not-in-pr"` → wrong branch or no open PR; `phase: "diff-empty"` → PR exists but has no commits vs base.
- On success: `selectedReviewers[]` lists exactly which reviewers were dispatched; `reviewerTasks[].agent` names each reviewer; `reviewerTasks[].task` is the full self-contained prompt passed to the subagent.
- To inspect REVIEWER_INSTRUCTIONS loading: launch the extension and check stderr for any file-read errors (falls back silently, no throw).

## Deviations

- **agentsDir path corrected**: Task plan specified `"..", "..", "..", "agents"` (three levels up → `src/agents/` — non-existent). Correct path is `"..", "..", "agents"` (two levels up → `src/resources/agents/`). The plan's prose also incorrectly stated "three levels up gives `src/resources/`" — two levels is correct.

## Known Issues

- Pre-existing smoke test failure (`kata launches and loads extensions without errors`) — present before T04. Root cause: the smoke test exercises the tarball-installed binary which has not been rebuilt to include recent extension changes. Unrelated to T04's scope.

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/index.ts` — added `readFileSync` import, `pr-review-utils.js` imports, `loadReviewerInstructions()` helper, `REVIEWER_INSTRUCTIONS` map, and `kata_review_pr` tool registration
