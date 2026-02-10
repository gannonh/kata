---
phase: 44-config-foundation
plan: 02
subsystem: configuration
tags: [worktree, config, onboarding, settings]
depends_on: [44-01]
blocks: [44-03]
tech:
  tools: [bash, git]
  patterns: [bare-repo-worktree, conditional-onboarding, non-fatal-setup]
files:
  created:
    - skills/kata-configure-settings/scripts/setup-worktrees.sh
  modified:
    - skills/kata-new-project/SKILL.md
    - skills/kata-configure-settings/SKILL.md
decisions: []
metrics:
  tasks: 3/3
  duration: 4m 22s
  commits: 3
---

# Phase 44 Plan 02: Worktree Setup & Integration Summary

Created the bare repo + worktree conversion script and integrated worktree configuration into both the new-project onboarding flow and the settings skill.

## Commits

- `a5e78c9`: feat(44-02): create setup-worktrees.sh for bare repo + worktree conversion
- `bf1285e`: feat(44-02): add worktree question to kata-new-project onboarding
- `b3ef8a9`: feat(44-02): add worktree toggle to kata-configure-settings

## Changes

**setup-worktrees.sh (new):** Validates preconditions in order (pr_workflow true, git repo, clean tree, no existing .bare/), then converts to bare repo layout: `git clone --bare . .bare`, replaces `.git` with pointer file, adds `main/` worktree, cleans duplicate root files, adds `.bare` and `main/` to `.gitignore`, sets `worktree.enabled` via `set-config.sh`. Includes error trap with recovery instructions if conversion fails partway.

**kata-new-project SKILL.md:** Phase 5 gains a 6th question ("Git Worktrees") gated on PR Workflow = Yes. Config.json template includes `worktree.enabled` key. After config is written, `setup-worktrees.sh` runs if worktrees enabled, with non-fatal error handling that reverts `worktree.enabled` to false on failure.

**kata-configure-settings SKILL.md:** Step 2 reads `worktree.enabled` and `pr_workflow`. Section B AskUserQuestion includes worktree toggle conditional on `pr_workflow = true`. Step 4 writes `worktree.enabled` via `set-config.sh`. Side-effect: enabling worktrees triggers `setup-worktrees.sh` with revert on failure. Step 5 confirmation table includes Git Worktrees row.
