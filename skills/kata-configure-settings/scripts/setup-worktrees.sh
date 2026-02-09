#!/usr/bin/env bash
# Usage: setup-worktrees.sh
# Converts a standard git repo to bare repo + worktree layout:
#   .bare/   — bare git repo (shared object store)
#   .git     — text file containing "gitdir: .bare"
#   main/    — worktree for main branch (working files live here)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Precondition Validation ---

# 1. pr_workflow must be enabled (worktrees require PR workflow)
PR_WORKFLOW=$(bash "$SCRIPT_DIR/read-config.sh" "pr_workflow" "false")
if [ "$PR_WORKFLOW" != "true" ]; then
  echo "Error: pr_workflow must be true in .planning/config.json. Worktrees require PR workflow."
  exit 1
fi

# 2. Must be in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Error: Not a git repository. Initialize with 'git init' first."
  exit 1
fi

# 3. Must have clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree has uncommitted changes. Commit or stash before converting."
  exit 1
fi

# 4. Must not already be converted
if [ -d .bare ]; then
  echo "Already converted: .bare/ directory exists. Nothing to do."
  exit 0
fi

# --- Conversion ---

# Trap for recovery instructions if conversion fails after .git removal
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ] && [ ! -d .git ] && [ -d .bare ]; then
    echo ""
    echo "ERROR: Conversion failed partway through."
    echo "Recovery: Your git history is safe in .bare/"
    echo "  To restore: rm -f .git && mv .bare .git"
    echo "  Then retry: bash $0"
  fi
}
trap cleanup EXIT

# 1. Create bare clone with full history
git clone --bare . .bare

# 2. Remove original git directory
rm -rf .git

# 3. Create pointer file so git commands work from project root
echo "gitdir: .bare" > .git

# 4. Add main/ worktree with the main branch checked out
GIT_DIR=.bare git worktree add main main

# 5. Remove duplicate working files from project root
# Files now live in main/. Remove everything except .bare/, .git, and main/
for item in *; do
  case "$item" in
    main) continue ;;
    *) rm -rf "$item" ;;
  esac
done

# Also clean dotfiles that are repo content (not .bare, .git, .gitignore)
for item in .[!.]*; do
  case "$item" in
    .bare|.git|.gitignore) continue ;;
    *) rm -rf "$item" ;;
  esac
done

# 6. Add .bare and main/ to project root .gitignore
GITIGNORE=".gitignore"
touch "$GITIGNORE"
grep -qxF '.bare' "$GITIGNORE" 2>/dev/null || echo '.bare' >> "$GITIGNORE"
grep -qxF 'main/' "$GITIGNORE" 2>/dev/null || echo 'main/' >> "$GITIGNORE"

# 7. Set worktree.enabled in config
# Config lives in main/ worktree now, so run set-config from there
if [ -f main/.planning/config.json ]; then
  cd main
  bash "$SCRIPT_DIR/set-config.sh" "worktree.enabled" "true"
  cd ..
elif [ -f .planning/config.json ]; then
  bash "$SCRIPT_DIR/set-config.sh" "worktree.enabled" "true"
fi

echo "Bare repo + worktree layout created. Working files are in main/. Plan worktrees will be created as sibling directories."
