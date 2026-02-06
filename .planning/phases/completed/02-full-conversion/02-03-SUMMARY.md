---
phase: 02-full-conversion
plan: 03
status: completed
started: 2026-02-06T00:18:12Z
completed: 2026-02-06T00:22:58Z
duration: ~5 min
commit: c59aa10
---

# Plan 02-03 Summary: Extract PR Review Agent Instructions

## Outcome

All 8 PR review agent instruction files extracted to `skills/kata-review-pull-requests/references/`. SKILL.md unchanged (context:fork pattern preserved).

## Files Created

| Instruction File | Source Agent |
|---|---|
| references/code-reviewer-instructions.md | agents/kata-code-reviewer.md |
| references/code-simplifier-instructions.md | agents/kata-code-simplifier.md |
| references/comment-analyzer-instructions.md | agents/kata-comment-analyzer.md |
| references/pr-test-analyzer-instructions.md | agents/kata-pr-test-analyzer.md |
| references/type-design-analyzer-instructions.md | agents/kata-type-design-analyzer.md |
| references/failure-finder-instructions.md | agents/kata-failure-finder.md |
| references/silent-failure-hunter-instructions.md | agents/kata-silent-failure-hunter.md |
| references/entity-generator-instructions.md | agents/kata-entity-generator.md |

## Verification

- 8 instruction files exist in references/
- No file starts with `---` (no YAML frontmatter)
- No files contain `tools:`, `color:`, or `model:` fields
- SKILL.md unmodified
- `npm run build:plugin` succeeds

## Notes

- Files were committed by a parallel executor in c59aa10. Content verified identical.
- kata-silent-failure-hunter and kata-entity-generator are unused agents, migrated for completeness.
- context:fork pattern does not use Task() calls, so SKILL.md required no modification.
