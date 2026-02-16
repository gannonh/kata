#!/usr/bin/env bash
# Switch workspace/ to a phase branch.
# Extracts milestone, phase number, slug, and branch type from project context.
# Usage: create-phase-branch.sh <phase-dir>
# Output: key=value pairs (WORKSPACE_PATH, BRANCH, BRANCH_TYPE, MILESTONE, PHASE_NUM, SLUG)
# Exit: 0=success (workspace on phase branch), 1=error
#
# In bare repo layout: switches workspace/ to a new phase branch via git checkout -b.
# In standard repo: falls back to git checkout -b in the current directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT=$(node "$SCRIPT_DIR/kata-lib.cjs" resolve-root)
cd "$PROJECT_ROOT"

PHASE_DIR="${1:?Usage: create-phase-branch.sh <phase-dir>}"

# 1. Get milestone version from ROADMAP.md
MILESTONE=$(grep -E "Current Milestone:|🔄" .planning/ROADMAP.md | grep -oE 'v[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 | tr -d 'v')
if [ -z "$MILESTONE" ]; then
  echo "Error: Could not determine milestone from ROADMAP.md" >&2
  exit 1
fi

# 2. Get phase number and slug from PHASE_DIR
PHASE_NUM=$(basename "$PHASE_DIR" | sed -E 's/^([0-9]+)-.*/\1/')
PHASE_NUM_UNPADDED=$(echo "$PHASE_NUM" | sed 's/^0*//')
SLUG=$(basename "$PHASE_DIR" | sed -E 's/^[0-9]+-//')

# 3. Infer branch type from phase goal (precedence: fix > docs > refactor > chore > feat)
PHASE_GOAL=$(grep -A 5 "Phase ${PHASE_NUM_UNPADDED}:" .planning/ROADMAP.md | grep "Goal:" | head -1 || echo "")
if echo "$PHASE_GOAL" | grep -qi "fix\|bug\|patch"; then
  BRANCH_TYPE="fix"
elif echo "$PHASE_GOAL" | grep -qi "doc\|readme\|comment"; then
  BRANCH_TYPE="docs"
elif echo "$PHASE_GOAL" | grep -qi "refactor\|restructure\|reorganize"; then
  BRANCH_TYPE="refactor"
elif echo "$PHASE_GOAL" | grep -qi "chore\|config\|setup"; then
  BRANCH_TYPE="chore"
else
  BRANCH_TYPE="feat"
fi

# 4. Switch workspace to phase branch
BRANCH="${BRANCH_TYPE}/v${MILESTONE}-${PHASE_NUM}-${SLUG}"

# Validate workspace architecture in bare repo layout
if [ -d ../.bare ]; then
  if [ ! -d ../workspace ]; then
    # Old layout: bare repo without workspace/ — tell user to migrate
    echo "Error: Old worktree layout detected (no workspace/ directory)." >&2
    echo "Run /kata-configure-settings to set up worktrees, or:" >&2
    echo "  Run setup-worktrees.sh from kata-configure-settings skill" >&2
    echo "Then restart Claude Code from workspace/:" >&2
    echo "  cd $(cd .. && pwd)/workspace" >&2
    exit 1
  fi
  WORKSPACE_REAL=$(cd ../workspace && pwd)
  if [ "$(pwd)" != "$WORKSPACE_REAL" ]; then
    # Running from wrong directory (e.g., main/ instead of workspace/)
    echo "Error: Must run from workspace/, not $(basename "$(pwd)")/" >&2
    echo "Restart Claude Code from workspace/:" >&2
    echo "  cd $WORKSPACE_REAL" >&2
    exit 1
  fi
fi

# Detect layout: bare repo (../.bare exists) or standard repo
if [ -d ../.bare ]; then
  # Bare repo layout: project-root.sh cd'd us into workspace/
  WORKSPACE_PATH="$(pwd)"

  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

  if [ "$CURRENT_BRANCH" = "$BRANCH" ]; then
    # Resumption: already on the phase branch
    echo "Workspace already on branch $BRANCH, resuming" >&2
  elif GIT_DIR=../.bare git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    # Branch exists but workspace is on a different branch: switch to it
    git checkout "$BRANCH" >&2
    echo "Switched workspace to existing branch $BRANCH" >&2
  else
    # Create new phase branch from main
    git checkout -b "$BRANCH" main >&2
    echo "Created phase branch $BRANCH in workspace" >&2
  fi
else
  # Standard repo (no bare layout): create branch in current directory
  WORKSPACE_PATH="$(pwd)"

  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

  if [ "$CURRENT_BRANCH" = "$BRANCH" ]; then
    echo "Already on branch $BRANCH, resuming" >&2
  elif git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    git checkout "$BRANCH" >&2
    echo "Switched to existing branch $BRANCH" >&2
  else
    git checkout -b "$BRANCH" main >&2
    echo "Created branch $BRANCH" >&2
  fi
fi

# Output key=value pairs for eval
echo "WORKSPACE_PATH=$WORKSPACE_PATH"
echo "BRANCH=$BRANCH"
echo "BRANCH_TYPE=$BRANCH_TYPE"
echo "MILESTONE=$MILESTONE"
echo "PHASE_NUM=$PHASE_NUM"
echo "SLUG=$SLUG"
