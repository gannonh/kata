---
id: T03
parent: S02
milestone: M003
provides:
  - 6 bundled reviewer agent definition files in src/resources/agents/pr-*.md
key_files:
  - src/resources/agents/pr-code-reviewer.md
  - src/resources/agents/pr-failure-finder.md
  - src/resources/agents/pr-test-analyzer.md
  - src/resources/agents/pr-type-design-analyzer.md
  - src/resources/agents/pr-comment-analyzer.md
  - src/resources/agents/pr-code-simplifier.md
key_decisions:
  - none
patterns_established:
  - Agent .md files use triple-dash YAML frontmatter (name:, description:) followed by blank line then verbatim system prompt body — matches worker.md format
observability_surfaces:
  - none (static files; runtime inspection via `ls ~/.kata-cli/agent/agents/pr-*.md` after launch confirms sync)
duration: short
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Write 6 bundled reviewer agent definition files

**Created 6 `pr-*.md` reviewer agent definitions in `src/resources/agents/` with correct frontmatter and verbatim system-prompt content from the pull-requests skill references.**

## What Happened

Read `worker.md` to confirm the frontmatter format (triple-dash, `name:`, `description:`), then read all 6 source reference files from `/Users/gannonhall/.agents/skills/pull-requests/references/`. Wrote all 6 agent files in parallel with the correct YAML frontmatter block followed by the full verbatim reviewer instructions.

The `name:` values in frontmatter were verified to match exactly what `scopeReviewers` in `pr-review-utils.ts` returns: `pr-code-reviewer`, `pr-failure-finder`, `pr-test-analyzer`, `pr-code-simplifier`, `pr-type-design-analyzer`, `pr-comment-analyzer`.

`resource-loader.ts` already syncs `src/resources/agents/` to `~/.kata-cli/agent/agents/` on every launch — no new wiring needed.

## Verification

```
ls src/resources/agents/pr-*.md | wc -l   → 6
grep "^name:" src/resources/agents/pr-*.md → all 6 names present and correct
ls src/resources/agents/*.md | wc -l       → 9 (3 existing + 6 new)
ls src/resources/agents/worker.md src/resources/agents/scout.md src/resources/agents/researcher.md → all present, unmodified
wc -l src/resources/agents/pr-*.md        → 45–127 lines each (non-trivial, full content)
npm test → all 8 pr-review tests pass (scopeReviewers × 5, buildReviewerTaskPrompt × 1, aggregateFindings × 2)
```

The pre-existing `app-smoke.test.ts` failure (`pi.addTool is not a function`) is unrelated to this task and was present before T03.

## Diagnostics

After any Kata launch: `ls ~/.kata-cli/agent/agents/pr-*.md` confirms all 6 files were synced. `cat ~/.kata-cli/agent/agents/pr-code-reviewer.md` confirms content. If T04's `REVIEWER_INSTRUCTIONS` map lookup returns undefined, check `name:` in frontmatter against the reviewer ID string in `scopeReviewers`.

## Deviations

none

## Known Issues

none

## Files Created/Modified

- `src/resources/agents/pr-code-reviewer.md` — reviews code diffs for bugs, CLAUDE.md compliance, quality issues (confidence ≥ 80 only)
- `src/resources/agents/pr-failure-finder.md` — audits error handling for silent failures, missing try/catch, inadequate user feedback
- `src/resources/agents/pr-test-analyzer.md` — evaluates test coverage quality, identifies untested critical paths and error conditions
- `src/resources/agents/pr-type-design-analyzer.md` — analyzes type designs for invariant strength and encapsulation quality
- `src/resources/agents/pr-comment-analyzer.md` — identifies comment rot: inaccurate, outdated, misleading, or redundant comments
- `src/resources/agents/pr-code-simplifier.md` — refines code for clarity, consistency, and maintainability without altering functionality
