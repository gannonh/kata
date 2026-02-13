---
phase: 49-script-layer-phase-worktrees
plan: 01
subsystem: scripts/worktree
tags: [worktree, phase-branch, bare-repo]
depends_on: []
unlocks: [49-02]
tech:
  modified: [bash, node-test]
files:
  modified:
    - skills/kata-execute-phase/scripts/create-phase-branch.sh
    - tests/scripts/create-phase-branch.test.js
decisions: []
metrics:
  duration: 3 min
  completed: 2026-02-13T20:22:32Z
---

# Phase 49 Plan 01: Rewrite create-phase-branch.sh for Phase Worktrees Summary

Phase worktree creation via `GIT_DIR=../.bare git worktree add` replacing `git checkout -b` inside `main/`

## What Changed

**create-phase-branch.sh** (lines 41-58): Replaced `git checkout -b` / `git checkout` block with worktree creation logic. The script now computes a `WORKTREE_DIR` path as a sibling to `main/` (naming: `{branch-type}-v{milestone}-{phase-num}-{slug}`), creates the worktree via `GIT_DIR=../.bare git worktree add`, and outputs `WORKTREE_PATH` as the first key=value pair. Resumption handles the case where both the directory and branch already exist, outputting the path without error. No `git checkout` commands remain in the script.

**create-phase-branch.test.js** (full rewrite): Replaced `createGitRepoWithRoadmap` (normal git repo) with `createBareRepoWithRoadmap` (bare repo + `main/` worktree layout matching real project structure). Tests run from the project root; `project-root.sh` resolves to `main/` via case 3 (`main/.planning/`). Added assertions for `WORKTREE_PATH` output, worktree directory existence, idempotent resumption path equality, and the `main/` branch invariant. Test count: 9 (up from 6).

## Commits

- `9762835`: feat(49-01): rewrite create-phase-branch.sh to create phase worktree
- `44c70be`: test(49-01): update create-phase-branch tests for bare repo layout

## Verification

- `npm run build:plugin && node --test tests/scripts/create-phase-branch.test.js` passes (9/9)
- `npm test` passes (44/44)
- `grep "git checkout" create-phase-branch.sh` returns zero matches
