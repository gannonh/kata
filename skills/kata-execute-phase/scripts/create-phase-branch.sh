#!/usr/bin/env bash
# Create a phase branch for PR workflow execution.
# Extracts milestone, phase number, slug, and branch type from project context.
# Usage: create-phase-branch.sh <phase-dir>
# Output: key=value pairs (BRANCH, BRANCH_TYPE, MILESTONE, PHASE_NUM, SLUG)
# Exit: 0=success (leaves you on the branch), 1=error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../kata-configure-settings/scripts/project-root.sh"

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

# 4. Create branch (idempotent: resumes on existing branch)
BRANCH="${BRANCH_TYPE}/v${MILESTONE}-${PHASE_NUM}-${SLUG}"
if git show-ref --verify --quiet refs/heads/"$BRANCH"; then
  git checkout "$BRANCH"
  echo "Branch $BRANCH exists, resuming on it" >&2
else
  git checkout -b "$BRANCH"
  echo "Created branch $BRANCH" >&2
fi

# Output key=value pairs for eval
echo "BRANCH=$BRANCH"
echo "BRANCH_TYPE=$BRANCH_TYPE"
echo "MILESTONE=$MILESTONE"
echo "PHASE_NUM=$PHASE_NUM"
echo "SLUG=$SLUG"
