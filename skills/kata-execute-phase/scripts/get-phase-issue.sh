#!/usr/bin/env bash
# Look up a phase's GitHub issue number.
# Two-step API lookup (milestone title → number → issues) to handle closed milestones.
# Usage: get-phase-issue.sh <milestone-version> <phase-num>
#   milestone-version: without 'v' prefix (e.g., "1.10.0")
# Output: issue number (stdout), or empty if not found
# Exit: 0 always (outputs empty on not found)

set -euo pipefail

MILESTONE="${1:?Usage: get-phase-issue.sh <milestone-version> <phase-num>}"
PHASE_NUM="${2:?Usage: get-phase-issue.sh <milestone-version> <phase-num>}"

REPO_SLUG=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
if [ -z "$REPO_SLUG" ]; then
  exit 0
fi

MS_NUM=$(gh api "repos/${REPO_SLUG}/milestones?state=all" --jq ".[] | select(.title==\"v${MILESTONE}\") | .number" 2>/dev/null)
if [ -z "$MS_NUM" ]; then
  exit 0
fi

ISSUE_NUMBER=$(gh api "repos/${REPO_SLUG}/issues?milestone=${MS_NUM}&state=open&labels=phase&per_page=100" \
  --jq "[.[] | select(.title | startswith(\"Phase ${PHASE_NUM}:\"))][0].number" 2>/dev/null)

if [ -n "$ISSUE_NUMBER" ] && [ "$ISSUE_NUMBER" != "null" ]; then
  echo "$ISSUE_NUMBER"
fi
