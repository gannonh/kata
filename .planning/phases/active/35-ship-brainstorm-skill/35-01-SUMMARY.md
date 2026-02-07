---
phase: 35
plan: 01
subsystem: skills/kata-brainstorm
tags: [agent-teams, prerequisite-check, skill-update]
depends_on: []
blocks: []
tech:
  tools: [Edit, Bash, Read]
  patterns: [read-merge-write, env-var-check, settings-fallback]
files:
  modified:
    - skills/kata-brainstorm/SKILL.md
decisions: []
metrics:
  duration: 1 min
  tasks: 2
  commits: 1
  deviations: 0
---

# Phase 35 Plan 01: Add Agent Teams Prerequisite Check Summary

Added Step 0 prerequisite gate and updated team API references in kata-brainstorm skill.

## Completed Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Add Step 0 prerequisite check and update API references | `291a533` |
| 2 | Verify build includes updated skill | (verification only, no source changes) |

## Changes

**Step 0: Check Agent Teams Prerequisite** inserted before Step 1 in SKILL.md. The step:

1. Checks `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var
2. Falls back to reading `~/.claude/settings.json` if env var not set
3. Detects "enabled in settings but needs restart" state
4. Presents AskUserQuestion with Enable/Skip options if not enabled
5. Uses read-merge-write pattern (never overwrites settings.json)
6. Instructs restart after enabling

**API references updated:** `Teammate(spawnTeam)` replaced with `TeamCreate` in Step 3. `Teammate(cleanup)` replaced with `TeamDelete` in Step 6.

## Verification

- Built file at `dist/plugin/skills/kata-brainstorm/SKILL.md` contains Step 0, TeamCreate, TeamDelete
- Zero remaining `Teammate` references
- YAML frontmatter preserved
- All 44 tests pass
