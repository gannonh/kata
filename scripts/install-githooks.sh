#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ "$(git rev-parse --is-inside-work-tree)" != "true" ]]; then
  echo "Refusing to install hooks outside a git worktree." >&2
  exit 1
fi

# Worktree-local config avoids mutating the shared repository config that all
# linked worktrees inherit from.
git config --unset core.hooksPath >/dev/null 2>&1 || true
git config --worktree core.hooksPath .githooks

echo "Installed git hooks path:"
git config --show-origin --get core.hooksPath
