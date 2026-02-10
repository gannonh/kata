#!/usr/bin/env bash
# Update GitHub issue checkboxes after wave completion.
# Usage: update-issue-checkboxes.sh <phase-num> <phase-dir> <completed-plan-nums...>
#   completed-plan-nums: space-separated plan numbers (e.g., "01 02")
# Output: Status message (updated/skipped/warning)
# Exit: 0=success or skipped, 1=error

set -euo pipefail

PHASE_NUM="${1:?Usage: update-issue-checkboxes.sh <phase-num> <phase-dir> <completed-plan-nums...>}"
PHASE_DIR="${2:?Usage: update-issue-checkboxes.sh <phase-num> <phase-dir> <completed-plan-nums...>}"
shift 2
COMPLETED_PLANS="$*"

if [ -z "$COMPLETED_PLANS" ]; then
  echo "Skipped: no completed plans provided"
  exit 0
fi

# Check github.enabled and issueMode from config
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "never")

if [ "$GITHUB_ENABLED" != "true" ] || [ "$ISSUE_MODE" = "never" ]; then
  echo "Skipped: GitHub issues not enabled"
  exit 0
fi

# Get milestone version from ROADMAP.md
VERSION=$(grep -E "Current Milestone:|🔄" .planning/ROADMAP.md | grep -oE 'v[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 | tr -d 'v')

# Find phase issue via gh API (two-step: handles closed milestones)
REPO_SLUG=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
MS_NUM=$(gh api "repos/${REPO_SLUG}/milestones?state=all" --jq ".[] | select(.title==\"v${VERSION}\") | .number" 2>/dev/null)

ISSUE_NUMBER=""
if [ -n "$MS_NUM" ]; then
  ISSUE_NUMBER=$(gh api "repos/${REPO_SLUG}/issues?milestone=${MS_NUM}&state=open&labels=phase&per_page=100" \
    --jq "[.[] | select(.title | startswith(\"Phase ${PHASE_NUM}:\"))][0].number" 2>/dev/null)
fi

if [ -z "$ISSUE_NUMBER" ] || [ "$ISSUE_NUMBER" = "null" ]; then
  echo "Warning: Phase issue not found for Phase ${PHASE_NUM} in milestone v${VERSION}"
  exit 0
fi

# Read current issue body
ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body' 2>/dev/null)

# Update checkboxes for each completed plan
for plan_num in ${COMPLETED_PLANS}; do
  PLAN_ID="Plan $(printf "%02d" "$plan_num"):"
  ISSUE_BODY=$(echo "$ISSUE_BODY" | sed "s/^- \[ \] ${PLAN_ID}/- [x] ${PLAN_ID}/")
done

# Write and update
printf '%s\n' "$ISSUE_BODY" > /tmp/phase-issue-body.md
gh issue edit "$ISSUE_NUMBER" --body-file /tmp/phase-issue-body.md 2>/dev/null \
  && echo "Updated issue #${ISSUE_NUMBER}: checked off plans ${COMPLETED_PLANS}" \
  || echo "Warning: Failed to update issue #${ISSUE_NUMBER}"
