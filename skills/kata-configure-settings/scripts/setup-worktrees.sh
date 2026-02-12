#!/usr/bin/env bash
# Usage: setup-worktrees.sh
# Converts a standard git repo to bare repo + worktree layout:
#   .bare/   — bare git repo (shared object store)
#   .git     — text file containing "gitdir: .bare"
#   main/    — worktree for main branch (working files live here)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/project-root.sh"

# --- Precondition Validation ---

# 1. Must not already be converted (check current dir AND parent)
if [ -d .bare ]; then
  echo "Already converted: .bare/ directory exists. Nothing to do."
  exit 0
fi
if [ -d ../.bare ]; then
  echo "Already converted: running inside a worktree (../.bare exists). Nothing to do."
  exit 0
fi

# 2. pr_workflow must be enabled (worktrees require PR workflow)
PR_WORKFLOW=$(bash "$SCRIPT_DIR/read-config.sh" "pr_workflow" "false")
if [ "$PR_WORKFLOW" != "true" ]; then
  echo "Error: pr_workflow must be true in .planning/config.json. Worktrees require PR workflow."
  exit 1
fi

# 3. Must be in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Error: Not a git repository. Initialize with 'git init' first."
  exit 1
fi

# 4. Must have clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree has uncommitted changes. Commit or stash before converting."
  exit 1
fi

# --- Conversion ---

# Capture original remote URL before conversion (bare clone overwrites it with local path)
ORIGINAL_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

# Detect default branch name (may be main, master, or other)
DEFAULT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")

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

# 2. Restore original remote URL (bare clone sets origin to local path)
if [ -n "$ORIGINAL_REMOTE" ]; then
  GIT_DIR=.bare git remote set-url origin "$ORIGINAL_REMOTE"
fi

# 3. Remove original git directory
rm -rf .git

# 4. Create pointer file so git commands work from project root
echo "gitdir: .bare" > .git

# 5. Add main/ worktree with the default branch checked out
GIT_DIR=.bare git worktree add main "$DEFAULT_BRANCH"

# 6. Set upstream tracking (bare clone doesn't preserve branch tracking config)
if [ -n "$ORIGINAL_REMOTE" ]; then
  git -C main config "branch.$DEFAULT_BRANCH.remote" origin
  git -C main config "branch.$DEFAULT_BRANCH.merge" "refs/heads/$DEFAULT_BRANCH"
fi

# 7. Remove duplicate working files from project root
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

# 8. Add .bare and main/ to project root .gitignore
GITIGNORE=".gitignore"
touch "$GITIGNORE"
grep -qxF '.bare' "$GITIGNORE" 2>/dev/null || echo '.bare' >> "$GITIGNORE"
grep -qxF 'main/' "$GITIGNORE" 2>/dev/null || echo 'main/' >> "$GITIGNORE"

# 9. Create project root README
cat > README.md << 'README'
# Worktree Project

This project uses a bare repo + worktree layout for plan-level isolation during Kata phase execution.

## Why Worktrees

Kata executes plans in parallel via subagents. Each plan agent gets its own worktree directory and git branch, preventing file conflicts between concurrent agents. When a plan completes, its branch merges back into the phase branch. Failed plans leave their worktree intact for inspection.

## Structure

```
project-root/
├── .bare/           # shared git object store (do not modify)
├── main/            # project root — all work happens here
├── plan-01-01/      # plan worktree (created during execution, temporary)
└── plan-01-02/      # plan worktree (created during execution, temporary)
```

## Getting Started

```bash
cd main
```

All tools, skills, and git commands run from `main/`.

## During Phase Execution

Plan worktrees appear as sibling directories (`plan-{phase}-{plan}/`). Each has its own branch (`plan/{phase}-{plan}`). The orchestrator stays in `main/` on the phase branch and merges plan branches back after each wave completes. Worktrees are removed after merge.

## Branch Layout

```
main
 └── feat/v1.0-01-phase-name        (phase branch → becomes PR)
      ├── plan/01-01  → merge back
      ├── plan/01-02  → merge back
      └── plan/01-03  → merge back
```
README

# 10. Set worktree.enabled in config
# Config lives in main/ worktree now, so run set-config from there
if [ -f main/.planning/config.json ]; then
  cd main
  bash "$SCRIPT_DIR/set-config.sh" "worktree.enabled" "true"
  cd ..
elif [ -f .planning/config.json ]; then
  bash "$SCRIPT_DIR/set-config.sh" "worktree.enabled" "true"
fi

echo ""
echo "Worktree layout created."
echo ""
echo "  Project directory:  main/"
echo "  Git object store:   .bare/"
echo "  Plan worktrees:     created as sibling directories during execution"
echo ""
echo "IMPORTANT: main/ is now your project root."
echo "  - Restart Claude Code from inside main/"
echo "  - All skills, git commands, and file edits run from main/"
echo "  - cd $(pwd)/main"
