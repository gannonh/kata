#!/usr/bin/env bash
# Update GitHub issue checkboxes after wave completion.
# Usage: update-issue-checkboxes.sh <phase-num> <phase-dir> <completed-plan-nums...>
#   completed-plan-nums: space-separated plan numbers (e.g., "01 02")
# Output: Status message (updated/skipped/warning)
# Exit: 0=success or skipped (no plans, github disabled, issue not found, API failure)
#       1=missing required arguments

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../kata-configure-settings/scripts/project-root.sh"
READ_CONFIG="$SCRIPT_DIR/../../kata-configure-settings/scripts/read-config.sh"

PHASE_NUM="${1:?Usage: update-issue-checkboxes.sh <phase-num> <phase-dir> <completed-plan-nums...>}"
PHASE_DIR="${2:?Usage: update-issue-checkboxes.sh <phase-num> <phase-dir> <completed-plan-nums...>}"
shift 2
COMPLETED_PLANS="$*"

if [ -z "$COMPLETED_PLANS" ]; then
  echo "Skipped: no completed plans provided"
  exit 0
fi

# Check github.enabled and issue_mode via read-config.sh
GITHUB_ENABLED=$(bash "$READ_CONFIG" "github.enabled" "false")
ISSUE_MODE=$(bash "$READ_CONFIG" "github.issue_mode" "never")

if [ "$GITHUB_ENABLED" != "true" ] || [ "$ISSUE_MODE" = "never" ]; then
  echo "Skipped: GitHub issues not enabled"
  exit 0
fi

# Get milestone version from ROADMAP.md
MILESTONE=$(grep -E "Current Milestone:|🔄" .planning/ROADMAP.md | grep -oE 'v[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 | tr -d 'v')

# Find phase issue via two-step API lookup (handles closed milestones)
ISSUE_NUMBER=$(bash "$SCRIPT_DIR/get-phase-issue.sh" "$MILESTONE" "$PHASE_NUM")

if [ -z "$ISSUE_NUMBER" ]; then
  echo "Warning: Phase issue not found for Phase ${PHASE_NUM} in milestone v${MILESTONE}"
  exit 0
fi

# Read current issue body
ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body' 2>/dev/null)

# Update checkboxes (format: "- [ ] Plan NN: name" → "- [x] Plan NN: name")
for plan_num in ${COMPLETED_PLANS}; do
  PLAN_ID="Plan $(printf "%02d" "$plan_num"):"
  ISSUE_BODY=$(echo "$ISSUE_BODY" | sed "s/^- \[ \] ${PLAN_ID}/- [x] ${PLAN_ID}/")
done

# Write to temp file and update issue
BODY_FILE=$(mktemp /tmp/phase-issue-body-XXXXXX.md)
trap 'rm -f "$BODY_FILE"' EXIT
printf '%s\n' "$ISSUE_BODY" > "$BODY_FILE"
gh issue edit "$ISSUE_NUMBER" --body-file "$BODY_FILE" 2>/dev/null \
  && echo "Updated issue #${ISSUE_NUMBER}: checked off plans ${COMPLETED_PLANS}" \
  || echo "Warning: Failed to update issue #${ISSUE_NUMBER}"
