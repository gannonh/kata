#!/usr/bin/env bash
# Usage: setup-worktrees.sh
# Converts a standard git repo to bare repo + worktree layout:
#   .bare/       — bare git repo (shared object store)
#   .git         — text file containing "gitdir: .bare"
#   main/        — worktree for main branch (read-only reference)
#   workspace/   — persistent worktree for active phase branch (primary working directory)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT=$(node "$SCRIPT_DIR/kata-lib.cjs" resolve-root)
cd "$PROJECT_ROOT"

# --- Migration: old bare repo layout → workspace architecture ---

migrate_to_workspace() {
  echo "Migrating to workspace architecture..."
  echo ""

  # Detect default branch from main/ worktree
  local default_branch
  if [ -d main ]; then
    default_branch=$(git -C main symbolic-ref --short HEAD 2>/dev/null || echo "main")
  else
    default_branch=$(GIT_DIR=.bare git symbolic-ref --short HEAD 2>/dev/null || echo "main")
  fi

  # Create workspace/ worktree on workspace-base branch
  GIT_DIR=.bare git worktree add workspace -b workspace-base "$default_branch"

  # Add workspace/ to .gitignore if not already there
  local gitignore=".gitignore"
  touch "$gitignore"
  grep -qxF 'workspace/' "$gitignore" 2>/dev/null || echo 'workspace/' >> "$gitignore"

  # Set upstream tracking for workspace-base
  local remote_url
  remote_url=$(GIT_DIR=.bare git remote get-url origin 2>/dev/null || echo "")
  if [ -n "$remote_url" ]; then
    git -C workspace config "branch.workspace-base.remote" origin
    git -C workspace config "branch.workspace-base.merge" "refs/heads/$default_branch"
  fi

  echo ""
  echo "Migration complete. workspace/ created on workspace-base branch."
  echo ""
  echo "IMPORTANT: workspace/ is now your primary working directory."
  echo "  - Restart Claude Code from inside workspace/"
  echo "  - All skills, git commands, and file edits run from workspace/"
  echo "  - cd $(pwd)/workspace"
}

# --- Precondition Validation ---

# 1. Must not already be converted (check current dir AND parent)
if [ -d .bare ]; then
  if [ -d workspace ]; then
    echo "Already converted: .bare/ and workspace/ exist. Nothing to do."
    exit 0
  else
    migrate_to_workspace
    exit 0
  fi
fi
if [ -d ../.bare ]; then
  if [ -d ../workspace ]; then
    echo "Already converted: running inside a worktree (../.bare exists). Nothing to do."
    exit 0
  else
    cd ..
    migrate_to_workspace
    exit 0
  fi
fi

# 2. pr_workflow must be enabled (worktrees require PR workflow)
PR_WORKFLOW=$(node "$SCRIPT_DIR/kata-lib.cjs" read-config "pr_workflow" "false")
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

# 5. Add main/ worktree with the default branch checked out (read-only reference)
GIT_DIR=.bare git worktree add main "$DEFAULT_BRANCH"

# 5b. Add workspace/ worktree on a workspace-base branch (primary working directory)
# workspace-base is a separate branch so it doesn't conflict with main/ on the default branch.
# During phase execution, workspace/ switches to phase branches via git checkout -b.
GIT_DIR=.bare git worktree add workspace -b workspace-base "$DEFAULT_BRANCH"

# 6. Set upstream tracking (bare clone doesn't preserve branch tracking config)
if [ -n "$ORIGINAL_REMOTE" ]; then
  git -C main config "branch.$DEFAULT_BRANCH.remote" origin
  git -C main config "branch.$DEFAULT_BRANCH.merge" "refs/heads/$DEFAULT_BRANCH"
  git -C workspace config "branch.workspace-base.remote" origin
  git -C workspace config "branch.workspace-base.merge" "refs/heads/$DEFAULT_BRANCH"
fi

# 7. Remove duplicate working files from project root
# Files now live in main/ and workspace/. Remove everything except .bare/, .git, main/, workspace/
for item in *; do
  case "$item" in
    main|workspace) continue ;;
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

# 8. Add .bare, main/, and workspace/ to project root .gitignore
GITIGNORE=".gitignore"
touch "$GITIGNORE"
grep -qxF '.bare' "$GITIGNORE" 2>/dev/null || echo '.bare' >> "$GITIGNORE"
grep -qxF 'main/' "$GITIGNORE" 2>/dev/null || echo 'main/' >> "$GITIGNORE"
grep -qxF 'workspace/' "$GITIGNORE" 2>/dev/null || echo 'workspace/' >> "$GITIGNORE"

# 9. Create project root README
cat > README.md << 'README'
# Worktree Project

This project uses a bare repo + worktree layout for phase and plan isolation during Kata execution.

## Structure

```
project-root/
├── .bare/           # shared git object store (do not modify)
├── main/            # read-only reference (always on main branch)
├── workspace/       # primary working directory (active phase branch)
├── plan-01-01/      # plan worktree (created during execution, temporary)
└── plan-01-02/      # plan worktree (created during execution, temporary)
```

## Getting Started

```bash
cd workspace
```

All tools, skills, and git commands run from `workspace/`.

## How It Works

- **workspace/** is the persistent working directory. During phase execution, it switches to the phase branch. Between phases, it resets to workspace-base (tracking main).
- **main/** is a read-only reference worktree. It stays on the main branch and is never modified during execution.
- **Plan worktrees** appear as sibling directories (`plan-{phase}-{plan}/`) at the project root. Each has its own branch. After each wave, plan branches merge back into the phase branch in workspace/, and the plan worktrees are removed.

## Branch Layout

```
main
 └── feat/v1.0-01-phase-name        (phase branch, checked out in workspace/)
      ├── plan/01-01  → merge back
      ├── plan/01-02  → merge back
      └── plan/01-03  → merge back
```
README

# 10. Set worktree.enabled in config
# Config lives in workspace/ worktree now, so run set-config from there
if [ -f workspace/.planning/config.json ]; then
  cd workspace
  node "$SCRIPT_DIR/kata-lib.cjs" set-config "worktree.enabled" "true"
  cd ..
elif [ -f main/.planning/config.json ]; then
  cd main
  node "$SCRIPT_DIR/kata-lib.cjs" set-config "worktree.enabled" "true"
  cd ..
elif [ -f .planning/config.json ]; then
  node "$SCRIPT_DIR/kata-lib.cjs" set-config "worktree.enabled" "true"
fi

echo ""
echo "Worktree layout created."
echo ""
echo "  Primary directory:  workspace/"
echo "  Read-only ref:      main/"
echo "  Git object store:   .bare/"
echo "  Plan worktrees:     created as sibling directories during execution"
echo ""
echo "IMPORTANT: workspace/ is now your primary working directory."
echo "  - Restart Claude Code from inside workspace/"
echo "  - All skills, git commands, and file edits run from workspace/"
echo "  - cd $(pwd)/workspace"
