#!/usr/bin/env bash
# Usage: manage-worktree.sh <subcommand> [args]
# Manages plan-level worktree lifecycle (create, merge, list).
#
# Subcommands:
#   create <phase> <plan> [base-branch]  — Create worktree for a plan
#   merge  <phase> <plan> [base-branch]  — Merge plan branch back and remove worktree
#   list                                 — List active plan worktrees
#
# Requires: bare repo layout (.bare/) from setup-worktrees.sh
# Output: key=value pairs for machine parsing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
READ_CONFIG="$SCRIPT_DIR/../../kata-configure-settings/scripts/read-config.sh"

# --- Precondition Checks ---

check_preconditions() {
  # 1. Bare repo layout required
  if [ ! -d .bare ]; then
    echo "Error: Bare repo layout required. Run setup-worktrees.sh first." >&2
    exit 1
  fi

  # 2. worktree.enabled must be true
  local worktree_enabled
  worktree_enabled=$(bash "$READ_CONFIG" "worktree.enabled" "false")
  if [ "$worktree_enabled" != "true" ]; then
    echo "Error: worktree.enabled is false in config." >&2
    exit 1
  fi
}

# --- Helpers ---

resolve_base_branch() {
  local base="${1:-}"
  if [ -n "$base" ]; then
    echo "$base"
  elif [ -d main ]; then
    git -C main branch --show-current 2>/dev/null || echo "main"
  else
    echo "main"
  fi
}

# --- Subcommands ---

cmd_create() {
  local phase="${1:?Usage: manage-worktree.sh create <phase> <plan> [base-branch]}"
  local plan="${2:?Usage: manage-worktree.sh create <phase> <plan> [base-branch]}"
  local base_branch
  base_branch=$(resolve_base_branch "${3:-}")

  local branch_name="plan/${phase}-${plan}"
  local worktree_path="plan-${phase}-${plan}"

  # Idempotent: if worktree already exists, print info and exit 0
  if [ -d "$worktree_path" ]; then
    echo "WORKTREE_PATH=$worktree_path"
    echo "WORKTREE_BRANCH=$branch_name"
    echo "STATUS=exists"
    exit 0
  fi

  # Create branch from base
  GIT_DIR=.bare git branch "$branch_name" "$base_branch"

  # Add worktree
  GIT_DIR=.bare git worktree add "$worktree_path" "$branch_name"

  echo "WORKTREE_PATH=$worktree_path"
  echo "WORKTREE_BRANCH=$branch_name"
  echo "STATUS=created"
}

cmd_merge() {
  local phase="${1:?Usage: manage-worktree.sh merge <phase> <plan> [base-branch]}"
  local plan="${2:?Usage: manage-worktree.sh merge <phase> <plan> [base-branch]}"
  local base_branch
  base_branch=$(resolve_base_branch "${3:-}")

  local branch_name="plan/${phase}-${plan}"
  local worktree_path="plan-${phase}-${plan}"

  # Verify worktree exists
  if [ ! -d "$worktree_path" ]; then
    echo "Error: No worktree at $worktree_path" >&2
    exit 1
  fi

  # Check for uncommitted changes
  if [ -n "$(git -C "$worktree_path" status --porcelain)" ]; then
    echo "Error: Worktree has uncommitted changes. Commit or stash first." >&2
    exit 1
  fi

  # Validate main worktree directory exists
  if [ ! -d "main" ]; then
    echo "Error: main worktree directory not found" >&2
    exit 1
  fi

  # Switch to base branch in main worktree
  git -C main checkout "$base_branch"

  # Merge plan branch into base (fast-forward preferred, no editor for merge commit)
  if ! git -C main merge "$branch_name" --no-edit; then
    echo "Error: Merge conflict. Resolve manually in main/ worktree." >&2
    echo "  cd main && git merge --abort  # to abort" >&2
    echo "  cd main && git mergetool      # to resolve" >&2
    exit 1
  fi

  # Remove worktree
  GIT_DIR=.bare git worktree remove "$worktree_path"

  # Delete plan branch
  GIT_DIR=.bare git branch -d "$branch_name"

  echo "MERGED=true"
  echo "BASE_BRANCH=$base_branch"
  echo "STATUS=merged"
}

cmd_list() {
  local count=0
  local output=""

  # Parse porcelain worktree list
  local current_path=""
  local current_branch=""

  while IFS= read -r line; do
    if [[ "$line" =~ ^worktree\ (.+) ]]; then
      current_path="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^branch\ refs/heads/(.+) ]]; then
      current_branch="${BASH_REMATCH[1]}"
    elif [ -z "$line" ]; then
      # End of worktree entry; check if it matches plan-* pattern
      local dir_name
      dir_name=$(basename "$current_path")
      if [[ "$dir_name" =~ ^plan-([0-9]+)-([0-9]+)$ ]]; then
        local phase="${BASH_REMATCH[1]}"
        local plan="${BASH_REMATCH[2]}"
        output+="${dir_name}  ${current_branch}  phase=${phase} plan=${plan}"$'\n'
        count=$((count + 1))
      fi
      current_path=""
      current_branch=""
    fi
  done < <(GIT_DIR=.bare git worktree list --porcelain; echo "")

  echo "WORKTREE_COUNT=$count"
  if [ -n "$output" ]; then
    printf "%s" "$output"
  fi
}

# --- Main ---

SUBCOMMAND="${1:-}"

if [ -z "$SUBCOMMAND" ]; then
  echo "Usage: manage-worktree.sh <subcommand> [args]"
  echo ""
  echo "Subcommands:"
  echo "  create <phase> <plan> [base-branch]  — Create worktree for a plan"
  echo "  merge  <phase> <plan> [base-branch]  — Merge plan branch back and remove worktree"
  echo "  list                                 — List active plan worktrees"
  exit 1
fi

check_preconditions

shift
case "$SUBCOMMAND" in
  create) cmd_create "$@" ;;
  merge)  cmd_merge "$@" ;;
  list)   cmd_list "$@" ;;
  *)
    echo "Error: Unknown subcommand '$SUBCOMMAND'" >&2
    echo "Usage: manage-worktree.sh <create|merge|list> [args]" >&2
    exit 1
    ;;
esac
