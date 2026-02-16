#!/usr/bin/env bash
# Create a draft PR for a phase execution.
# Usage: create-draft-pr.sh <phase-dir> <branch>
# Output: key=value pairs
#   When existing PR found: EXISTING_PR, PR_NUMBER
#   When PR created: PR_NUMBER, PR_URL
# Exit: 0=success, 1=error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT=$(node "$SCRIPT_DIR/kata-lib.cjs" resolve-root)
cd "$PROJECT_ROOT"

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

# Push branch (all output to /dev/null or stderr to keep stdout eval-safe;
# force-with-lease fallback for idempotent re-runs with stale remote commits)
if ! git push -u origin "$BRANCH" >/dev/null 2>/dev/null; then
  git push -u --force-with-lease origin "$BRANCH" >/dev/null
fi

# Read config
GITHUB_ENABLED=$(node "$SCRIPT_DIR/kata-lib.cjs" read-config "github.enabled" "false")
ISSUE_MODE=$(node "$SCRIPT_DIR/kata-lib.cjs" read-config "github.issue_mode" "never")

# Parse phase metadata from ROADMAP (|| true prevents pipefail+set -e on grep no-match)
MILESTONE=$(grep -E "Current Milestone:|🔄" .planning/ROADMAP.md 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 | tr -d 'v' || true)
PHASE_NUM=$(basename "$PHASE_DIR" | sed -E 's/^0*([0-9]+)-.*/\1/')

# Get phase name from ROADMAP.md (handles both ### and #### header levels)
PHASE_NAME=$(grep -E "^#{3,4} Phase ${PHASE_NUM}:" .planning/ROADMAP.md 2>/dev/null | head -1 | sed -E 's/^#{3,4} Phase [0-9]+: //' | xargs || true)

# Also check checklist format: "- [ ] Phase N: Name"
if [ -z "$PHASE_NAME" ]; then
  PHASE_NAME=$(grep -E "Phase ${PHASE_NUM}:" .planning/ROADMAP.md 2>/dev/null | head -1 | sed -E 's/.*Phase [0-9]+: //' | sed 's/ (.*//' | xargs || true)
fi

# Build PR body (Goal is on next line after phase header)
PHASE_GOAL=$(grep -A 3 "^#{3,4} Phase ${PHASE_NUM}:" .planning/ROADMAP.md 2>/dev/null | grep "Goal:" | head -1 | sed 's/.*Goal:[[:space:]]*//' || true)

# Fallback: use directory name for phase name if ROADMAP parsing failed
[ -z "$PHASE_NAME" ] && PHASE_NAME=$(basename "$PHASE_DIR" | sed -E 's/^[0-9]+-//' | tr '-' ' ')
[ -z "$MILESTONE" ] && MILESTONE="0.0"

# Get phase issue for linking via two-step API lookup (handles closed milestones)
CLOSES_LINE=""
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
  PHASE_ISSUE=$(bash "$SCRIPT_DIR/get-phase-issue.sh" "$MILESTONE" "$PHASE_NUM")
  [ -n "$PHASE_ISSUE" ] && CLOSES_LINE="Closes #${PHASE_ISSUE}"
fi

# Build plans checklist (all unchecked initially)
PLANS_CHECKLIST=""
for plan in $(find "${PHASE_DIR}" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | sort); do
  plan_name=$(grep -m1 "<name>" "$plan" 2>/dev/null | sed 's/.*<name>//;s/<\/name>.*//' || true)
  [ -z "$plan_name" ] && plan_name=$(basename "$plan" | sed 's/-PLAN.md//')
  plan_num=$(basename "$plan" | sed -E 's/^[0-9]+-([0-9]+)-PLAN\.md$/\1/')
  PLANS_CHECKLIST="${PLANS_CHECKLIST}- [ ] Plan ${plan_num}: ${plan_name}\n"
done

# Collect source_issue references from all plans
SOURCE_ISSUES=""
for plan in $(find "${PHASE_DIR}" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | sort); do
  source_issue=$(grep -m1 "^source_issue:" "$plan" 2>/dev/null | cut -d':' -f2- | xargs || true)
  if echo "$source_issue" | grep -q "^github:#"; then
    issue_num=$(echo "$source_issue" | grep -oE '#[0-9]+')
    [ -n "$issue_num" ] && SOURCE_ISSUES="${SOURCE_ISSUES}Closes ${issue_num}\n"
  fi
done
SOURCE_ISSUES=$(echo "$SOURCE_ISSUES" | sed '/^$/d')

# Write PR body to temp file
BODY_FILE=$(mktemp /tmp/pr-body-XXXXXX.md)
PR_CREATE_ERR=$(mktemp /tmp/pr-err-XXXXXX.txt)
trap 'rm -f "$BODY_FILE" "$PR_CREATE_ERR"' EXIT
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

# Create draft PR (--head required for bare repo worktree layout where gh
# cannot auto-detect the current branch)
if ! gh pr create --draft \
  --head "$BRANCH" \
  --base main \
  --title "v${MILESTONE} Phase ${PHASE_NUM}: ${PHASE_NAME}" \
  --body-file "$BODY_FILE" >/dev/null 2>"$PR_CREATE_ERR"; then
  echo "Error: gh pr create failed:" >&2
  cat "$PR_CREATE_ERR" >&2
  echo "  branch=$BRANCH milestone=$MILESTONE phase=$PHASE_NUM name=$PHASE_NAME" >&2
  exit 1
fi

PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
PR_URL=$(gh pr view --json url --jq '.url' 2>/dev/null || true)

if [ -z "$PR_NUMBER" ]; then
  echo "Warning: PR created but could not retrieve PR number" >&2
fi

echo "Created draft PR #${PR_NUMBER}" >&2
echo "PR_NUMBER=$PR_NUMBER"
echo "PR_URL=$PR_URL"
