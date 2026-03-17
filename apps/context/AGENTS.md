# AGENTS.md

## Hard Rules

- **Never use `git push --no-verify` or `git commit --no-verify`.** Pre-push and pre-commit hooks are quality gates. If a gate fails, fix the underlying problem. Bypassing hooks is never acceptable — not to unblock a push, not to save time, not for any reason short of an explicit instruction from the user.

## Git Workflow: Worktrees and Standby Branches

This repo uses git worktrees. Each worktree has a **standby branch** (e.g. `wt-cli-standby`) that tracks `main`. Because git does not allow the same branch to be checked out in multiple worktrees simultaneously, the standby branch acts as a `main` proxy for the worktree.

**Standby branches are not working branches.** Treat `wt-cli-standby` (and any `*-standby` branch) exactly like `main`:

- Never commit to a standby branch.
- At the start of any session, if `git branch --show-current` returns a standby branch, you are effectively on main. Create (or check out) the correct feature branch — `kata/M00X/S0X` — before doing any work.
