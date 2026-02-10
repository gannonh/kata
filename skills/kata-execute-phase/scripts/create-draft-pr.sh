#!/usr/bin/env bash
# Create a draft PR for a phase execution.
# Usage: create-draft-pr.sh <phase-dir> <branch>
# Output: key=value pairs
#   When existing PR found: EXISTING_PR, PR_NUMBER
#   When PR created: PR_NUMBER, PR_URL
# Exit: 0=success, 1=error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
READ_CONFIG="$SCRIPT_DIR/../../kata-configure-settings/scripts/read-config.sh"

PHASE_DIR="${1:?Usage: create-draft-pr.sh <phase-dir> <branch>}"
BRANCH="${2:?Usage: create-draft-pr.sh <phase-dir> <branch>}"

# Check if PR already exists for this branch (idempotent: safe for re-runs)
EXISTING_PR=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)
if [ -n "$EXISTING_PR" ]; then
  echo "PR #${EXISTING_PR} already exists, skipping creation" >&2
  echo "EXISTING_PR=$EXISTING_PR"
  echo "PR_NUMBER=$EXISTING_PR"
  exit 0
fi

# Push branch
git push -u origin "$BRANCH"

# Read config via read-config.sh
GITHUB_ENABLED=$(bash "$READ_CONFIG" "github.enabled" "false")
ISSUE_MODE=$(bash "$READ_CONFIG" "github.issueMode" "never")
MILESTONE=$(grep -E "Current Milestone:|🔄" .planning/ROADMAP.md | grep -oE 'v[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 | tr -d 'v')
PHASE_NUM=$(basename "$PHASE_DIR" | sed -E 's/^([0-9]+)-.*/\1/')

# Get phase name from ROADMAP.md (format: #### Phase N: Name)
PHASE_NAME=$(grep -E "^#### Phase ${PHASE_NUM}:" .planning/ROADMAP.md | sed -E 's/^#### Phase [0-9]+: //' | xargs)

# Build PR body (Goal is on next line after phase header)
PHASE_GOAL=$(grep -A 3 "^#### Phase ${PHASE_NUM}:" .planning/ROADMAP.md | grep "Goal:" | sed 's/.*Goal:[[:space:]]*//')

# Get phase issue for linking via two-step API lookup (handles closed milestones)
CLOSES_LINE=""
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
  PHASE_ISSUE=$(bash "$SCRIPT_DIR/get-phase-issue.sh" "$MILESTONE" "$PHASE_NUM")
  [ -n "$PHASE_ISSUE" ] && CLOSES_LINE="Closes #${PHASE_ISSUE}"
fi

# Build plans checklist (all unchecked initially)
PLANS_CHECKLIST=""
for plan in $(find "${PHASE_DIR}" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | sort); do
  plan_name=$(grep -m1 "<name>" "$plan" | sed 's/.*<name>//;s/<\/name>.*//' || basename "$plan" | sed 's/-PLAN.md//')
  plan_num=$(basename "$plan" | sed -E 's/^[0-9]+-([0-9]+)-PLAN\.md$/\1/')
  PLANS_CHECKLIST="${PLANS_CHECKLIST}- [ ] Plan ${plan_num}: ${plan_name}\n"
done

# Collect source_issue references from all plans
SOURCE_ISSUES=""
for plan in $(find "${PHASE_DIR}" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | sort); do
  source_issue=$(grep -m1 "^source_issue:" "$plan" | cut -d':' -f2- | xargs)
  if echo "$source_issue" | grep -q "^github:#"; then
    issue_num=$(echo "$source_issue" | grep -oE '#[0-9]+')
    [ -n "$issue_num" ] && SOURCE_ISSUES="${SOURCE_ISSUES}Closes ${issue_num}\n"
  fi
done
SOURCE_ISSUES=$(echo "$SOURCE_ISSUES" | sed '/^$/d')

# Write PR body to temp file
BODY_FILE=$(mktemp /tmp/pr-body-XXXXXX.md)
trap 'rm -f "$BODY_FILE"' EXIT
cat > "$BODY_FILE" << PR_EOF
## Phase Goal

${PHASE_GOAL}

## Plans

$(printf '%b' "${PLANS_CHECKLIST}")
${CLOSES_LINE}
${SOURCE_ISSUES:+

## Source Issues

${SOURCE_ISSUES}}
PR_EOF

# Create draft PR
gh pr create --draft \
  --base main \
  --title "v${MILESTONE} Phase ${PHASE_NUM}: ${PHASE_NAME}" \
  --body-file "$BODY_FILE"

PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
PR_URL=$(gh pr view --json url --jq '.url' 2>/dev/null || echo "")

echo "Created draft PR #${PR_NUMBER}" >&2
echo "PR_NUMBER=$PR_NUMBER"
echo "PR_URL=$PR_URL"
