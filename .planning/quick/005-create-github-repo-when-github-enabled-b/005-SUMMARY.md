---
phase: quick
plan: 005
subsystem: skills
tags: [github, milestone, ux]
requires: []
provides: [repo-creation-prompt]
affects: []
tech-stack:
  added: []
  patterns: [ask-before-action]
key-files:
  created: []
  modified:
    - skills/add-milestone/SKILL.md
decisions:
  - Three options offered: public repo, private repo, skip
  - On success, flow continues to GitHub Milestone creation
  - Skip option preserves local-only behavior
metrics:
  duration: 2 min
  completed: 2026-02-02
---

# Quick Task 005: Create GitHub Repo When GitHub Enabled but No Remote

**One-liner:** AskUserQuestion flow for repo creation when GitHub enabled but no remote exists during milestone creation.

## What Changed

Replaced the "warn and skip" behavior in `add-milestone` skill with an interactive "ask and create" flow:

**Before:** When `HAS_GITHUB_REMOTE=false`, displayed a warning message and skipped GitHub operations entirely.

**After:** Uses AskUserQuestion to offer three options:
1. **Yes, create public repo** - Runs `gh repo create --source=. --public --push`, then continues to GitHub Milestone creation
2. **Yes, create private repo** - Runs `gh repo create --source=. --private --push`, then continues to GitHub Milestone creation
3. **Skip for now** - Shows brief note and continues with local-only milestone (same behavior as before)

## Files Modified

| File | Change |
| ---- | ------ |
| `skills/add-milestone/SKILL.md` | Replaced warn-and-skip with AskUserQuestion flow (+22/-7 lines) |

## Commits

| Hash | Message |
| ---- | ------- |
| 98a41ee | feat(quick-005): add repo creation prompt when GitHub enabled but no remote |

## Verification

- AskUserQuestion added for repo creation prompt
- Public repo option with `gh repo create --source=. --public --push`
- Private repo option with `gh repo create --source=. --private --push`
- Skip option that continues without GitHub
- Old "warn and skip" text removed
- Flow continues to Step 2 after successful repo creation

## Deviations from Plan

None - plan executed exactly as written.
