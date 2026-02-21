#!/usr/bin/env bash
set -euo pipefail

MAIN_DIR="/Users/gannonhall/dev/kata/kata-orchestrator"
WT_DIR="/Users/gannonhall/dev/kata/kata-orchestrator.worktrees"

# Discover all worktree directories automatically (bash 3.2 compatible)
WORKTREES=()
while IFS= read -r dir; do
  WORKTREES+=("$(basename "$dir")")
done < <(find "$WT_DIR" -mindepth 1 -maxdepth 1 -type d -name 'wt-*' | sort)

errors=0

die() { echo "FATAL: $*" >&2; exit 1; }
warn() { echo "ERROR: $*" >&2; errors=$((errors + 1)); }

# -- Step 1: Pull main from GitHub ---------------------------------------
echo "==> Pulling main"
if ! git -C "$MAIN_DIR" pull origin main 2>&1; then
  die "pull failed"
fi

target_sha=$(git -C "$MAIN_DIR" rev-parse HEAD)
echo "    main is at ${target_sha:0:7}"

# -- Step 2: Reset each worktree's standby branch to main ----------------
for wt in "${WORKTREES[@]}"; do
  wt_path="$WT_DIR/$wt"
  branch="${wt}-standby"

  if [ ! -d "$wt_path" ]; then
    warn "$wt: directory not found"
    continue
  fi

  if ! git -C "$wt_path" diff --quiet || ! git -C "$wt_path" diff --cached --quiet; then
    warn "$wt: has uncommitted changes - skipping"
    continue
  fi

  current=$(git -C "$wt_path" branch --show-current)
  if [ "$current" != "$branch" ]; then
    warn "$wt: on branch '$current', expected '$branch' - skipping"
    continue
  fi

  echo "==> Resetting $wt"
  if ! git -C "$wt_path" reset --hard main 2>&1; then
    warn "$wt: reset failed"
    continue
  fi

  wt_sha=$(git -C "$wt_path" rev-parse HEAD)
  if [ "$wt_sha" != "$target_sha" ]; then
    warn "$wt: expected ${target_sha:0:7} but got ${wt_sha:0:7}"
  else
    echo "    $wt now at ${target_sha:0:7}"
  fi
done

# -- Summary --------------------------------------------------------------
echo ""
if [ "$errors" -gt 0 ]; then
  echo "FAILED: $errors error(s) above. Fix them before starting work."
  exit 1
else
  echo "All worktrees synced to main (${target_sha:0:7})."
fi
