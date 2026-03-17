---
name: managing-kata-worktrees
description: Manage kata-mono git worktrees — switching branches, syncing standby branches to main after PR merges, diagnosing drift, and verifying worktree health. Use when the user mentions worktrees, standby branches, syncing after a merge, "wt-" prefixed names, worktree setup, or asks why a worktree is behind main. Also use when starting work on a ticket (to verify the worktree is current) or finishing work (to return to standby).
---

# Managing Kata Worktrees

## Architecture

kata-mono uses a multi-worktree layout where each worktree maps to a monorepo app:

| Worktree | Path | Standby Branch | App |
|----------|------|----------------|-----|
| main (root) | `kata-mono/` | `main` | — (no direct work) |
| wt-cli | `kata-mono.worktrees/wt-cli/` | `wt-cli-standby` | `apps/cli` |
| wt-context | `kata-mono.worktrees/wt-context/` | `wt-context-standby` | `apps/context` |
| wt-desktop | `kata-mono.worktrees/wt-desktop/` | `wt-desktop-standby` | `apps/desktop` |
| wt-orc | `kata-mono.worktrees/wt-orc/` | `wt-orc-standby` | `apps/orc` |

**Why standby branches exist:** Git prohibits checking out the same branch in multiple worktrees. Since all worktrees need to track main when idle, each has a local "standby" branch that mirrors `origin/main`. No work happens directly on main in any worktree.

## Standby branch tracking

Each standby branch must track `origin/main` so `git pull` works:

```bash
git branch --set-upstream-to=origin/main wt-cli-standby
```

If `git pull` reports "no tracking information," re-run that command. Tracking can be lost if a branch is recreated.

## Starting work on a ticket

1. Verify the worktree is on its standby branch and current with main:
   ```bash
   git -C /Volumes/EVO/kata/kata-mono.worktrees/wt-<name> log --oneline -1
   # Should match: git log --oneline -1 main
   ```
2. If behind, sync first (see below).
3. Create and check out a feature branch:
   ```bash
   git -C /Volumes/EVO/kata/kata-mono.worktrees/wt-<name> checkout -b feat/my-feature
   ```

## Returning to standby after a PR merge

After merging a PR on GitHub:

```bash
# In the worktree (or using -C from anywhere)
git checkout wt-<name>-standby
git pull
```

`git pull` works because the standby branch tracks `origin/main`. This fast-forwards the standby branch to include the newly merged PR.

**If pull fails with conflicts:** This means the standby branch diverged from main (e.g., commits landed on standby that weren't in the PR). If the PR contained all the work, reset is safe:

```bash
git checkout wt-<name>-standby
git fetch origin
git reset --hard origin/main
```

Only use reset when you're certain the PR captured all the work. If unsure, inspect with `git log wt-<name>-standby..origin/main` and `git log origin/main..wt-<name>-standby` to see what each side has.

## Diagnosing worktree drift

To check if all worktrees are current:

```bash
git worktree list
```

All entries should show the same commit hash when idle. If any differ:

```bash
# See what main has that the standby doesn't
git log --oneline wt-<name>-standby..main

# See what the standby has that main doesn't (should be empty)
git log --oneline main..wt-<name>-standby
```

## Health check (all worktrees)

Quick verification that everything is in sync:

```bash
MAIN_SHA=$(git rev-parse main)
for wt in wt-cli wt-context wt-desktop wt-orc; do
  WT_SHA=$(git -C /Volumes/EVO/kata/kata-mono.worktrees/$wt rev-parse HEAD)
  if [ "$WT_SHA" = "$MAIN_SHA" ]; then
    echo "$wt: current"
  else
    echo "$wt: BEHIND (at $(git log --oneline -1 $WT_SHA))"
  fi
done
```

## Common pitfalls

- **Standby branch loses tracking:** Happens if the branch is deleted and recreated. Fix: `git branch --set-upstream-to=origin/main wt-<name>-standby`
- **Add/add merge conflicts on sync:** Happens when the standby branch has commits that also reached main via a PR (same content, different history). Safe to `git reset --hard origin/main` if the PR captured everything.
- **Working on the wrong worktree:** Always verify `pwd` resolves to the intended worktree, not the main repo. See memory: `feedback_worktree_paths.md`.
