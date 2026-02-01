---
name: check-issues
description: Use this skill when reviewing open issues, selecting an issue to work on, filtering issues by area, pulling GitHub issues, or deciding what to work on next. Triggers include "check issues", "list issues", "what issues", "open issues", "show issues", "view issues", "select issue to work on", "github issues", "backlog issues", "pull issues", "check todos" (deprecated), "list todos" (deprecated), "pending todos" (deprecated).
metadata:
  version: "0.2.0"
user-invocable: true
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
List all open issues, allow selection, load full context for the selected issue, and route to appropriate action.

Enables reviewing captured ideas and deciding what to work on next.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>

<step name="deprecation_notice">
**If the user invoked with "todo" vocabulary** (e.g., "check todos", "list todos", "pending todos"):

Display:

> **Note:** "todos" is now "issues". Using `/kata:check-issues`.

Then proceed with the action (non-blocking).
</step>

<step name="check_and_migrate">
Check if legacy `.planning/todos/` exists and needs migration:

```bash
if [ -d ".planning/todos/pending" ] && [ ! -d ".planning/todos/_archived" ]; then
  # Create new structure
  mkdir -p .planning/issues/open .planning/issues/in-progress .planning/issues/closed

  # Copy pending todos to open issues
  cp .planning/todos/pending/*.md .planning/issues/open/ 2>/dev/null || true

  # Copy done todos to closed issues
  cp .planning/todos/done/*.md .planning/issues/closed/ 2>/dev/null || true

  # Archive originals
  mkdir -p .planning/todos/_archived
  mv .planning/todos/pending .planning/todos/_archived/ 2>/dev/null || true
  mv .planning/todos/done .planning/todos/_archived/ 2>/dev/null || true

  echo "Migrated todos to issues format"
fi

# Ensure in-progress directory exists
mkdir -p .planning/issues/in-progress
```

Migration is idempotent: presence of `_archived/` indicates already migrated.
</step>

<step name="check_exist">
```bash
OPEN_COUNT=$(ls .planning/issues/open/*.md 2>/dev/null | wc -l | tr -d ' ')
IN_PROGRESS_COUNT=$(ls .planning/issues/in-progress/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Open issues: $OPEN_COUNT"
echo "In progress: $IN_PROGRESS_COUNT"
```

If both counts are 0:
```
No open or in-progress issues.

Issues are captured during work sessions with /kata:add-issue.

---

Would you like to:

1. Continue with current phase (/kata:track-progress)
2. Add an issue now (/kata:add-issue)
```

Exit.
</step>

<step name="parse_filter">
Check for area filter in arguments:
- `/kata:check-issues` → show all
- `/kata:check-issues api` → filter to area:api only
</step>

<step name="list_issues">
**1. Check GitHub config:**
```bash
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**2. Build dedupe list from local files' provenance fields:**
```bash
# Get all GitHub issue numbers already tracked locally (from open and in-progress)
LOCAL_PROVENANCE=$(grep -h "^provenance: github:" .planning/issues/open/*.md .planning/issues/in-progress/*.md 2>/dev/null | grep -oE '#[0-9]+' | tr -d '#' | sort -u)
```

**3. Query GitHub Issues (if enabled):**
```bash
if [ "$GITHUB_ENABLED" = "true" ]; then
  # Get GitHub Issues with backlog label, excluding those already tracked locally
  # Note: --label flag has issues in some gh CLI versions, use jq filter instead
  GITHUB_ISSUES=$(gh issue list --state open --json number,title,createdAt,labels --jq '.[] | select(.labels[].name == "backlog") | "\(.createdAt)|\(.title)|github|\(.number)"' 2>/dev/null)
fi
```

**4. Query in-progress issues first:**
```bash
for file in .planning/issues/in-progress/*.md; do
  [ -f "$file" ] || continue
  created=$(grep "^created:" "$file" | cut -d' ' -f2)
  title=$(grep "^title:" "$file" | cut -d':' -f2- | xargs)
  area=$(grep "^area:" "$file" | cut -d' ' -f2)
  echo "$created|$title|$area|$file|in-progress"
done | sort
```

**5. Query open issues:**
```bash
for file in .planning/issues/open/*.md; do
  [ -f "$file" ] || continue
  created=$(grep "^created:" "$file" | cut -d' ' -f2)
  title=$(grep "^title:" "$file" | cut -d':' -f2- | xargs)
  area=$(grep "^area:" "$file" | cut -d' ' -f2)
  echo "$created|$title|$area|$file|open"
done | sort
```

**6. Merge and display:**

Display in-progress issues first (if any), then open issues:
- In-progress issues marked with `[IN PROGRESS]` indicator
- Local issues display as-is with their area
- GitHub-only issues (number NOT in LOCAL_PROVENANCE) display with `[GH]` indicator
- Format: `1. [IN PROGRESS] Fix auth bug (api, 2d ago)` or `2. Add feature [GH] (bug, 3d ago)`

Apply area filter if specified. Display as numbered list:

```
Issues:

--- In Progress ---
1. [IN PROGRESS] Fix auth token refresh (api, 2d ago)

--- Open (Backlog) ---
2. Add modal z-index fix (ui, 1d ago)
3. Fix login bug [GH] (bug, 3d ago)
4. Refactor database connection pool (database, 5h ago)

---

Reply with a number to view details, or:
- `/kata:check-issues [area]` to filter by area
- `q` to exit
```

Format age as relative time. The `[GH]` indicator marks GitHub-only issues (not yet pulled to local).
</step>

<step name="handle_selection">
Wait for user to reply with a number.

If valid: load selected issue, proceed.
If invalid: "Invalid selection. Reply with a number (1-[N]) or `q` to exit."
</step>

<step name="load_context">
**If local issue (has file path):**
Read the issue file completely. Display:

```
## [title]

**Area:** [area]
**Created:** [date] ([relative time] ago)
**Files:** [list or "None"]

### Problem
[problem section content]

### Solution
[solution section content]
```

If `files` field has entries, read and briefly summarize each.

**If GitHub-only issue (has [GH] indicator):**
Fetch full issue details from GitHub:
```bash
gh issue view $ISSUE_NUMBER --json title,body,createdAt,labels
```

Display:
```
## [title] [GH]

**Source:** GitHub Issue #[number]
**Created:** [date] ([relative time] ago)
**Labels:** [list of GitHub labels]

### Description
[issue body content]
```

Note: This issue exists only in GitHub, not yet pulled to local.
</step>

<step name="check_roadmap">
```bash
ls .planning/ROADMAP.md 2>/dev/null && echo "Roadmap exists"
```

If roadmap exists:
1. Check if issue's area matches an upcoming phase
2. Check if issue's files overlap with a phase's scope
3. Note any match for action options
</step>

<step name="offer_actions">
**If in-progress issue:**

Use AskUserQuestion:
- header: "Action"
- question: "This issue is in progress. What would you like to do?"
- options:
  - "Mark complete" — move to closed, close GitHub Issue if linked
  - "Continue working" — show context and begin work
  - "Put back to open" — move back to backlog
  - "View details" — show full issue context

**If GitHub-only issue (has [GH] indicator):**

Use AskUserQuestion:
- header: "Action"
- question: "This is a GitHub Issue. What would you like to do?"
- options:
  - "Pull to local" — create local file for offline work
  - "Work on it now" — pull to local AND move to in-progress
  - "View on GitHub" — open in browser (gh issue view --web)
  - "Put it back" — return to list

**If open local issue maps to a roadmap phase:**

Use AskUserQuestion:
- header: "Action"
- question: "This issue relates to Phase [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — move to in-progress, start working
  - "Add to phase plan" — include when planning Phase [N]
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If open local issue with no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this issue?"
- options:
  - "Work on it now" — move to in-progress, start working
  - "Create a phase" — /kata:add-phase with this scope
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list
</step>

<step name="execute_action">
**Pull to local (GitHub-only issues):**
Create local file from GitHub Issue:
```bash
# Get issue details
ISSUE_DATA=$(gh issue view $ISSUE_NUMBER --json title,body,createdAt,labels)
TITLE=$(echo "$ISSUE_DATA" | jq -r '.title')
BODY=$(echo "$ISSUE_DATA" | jq -r '.body')
CREATED=$(echo "$ISSUE_DATA" | jq -r '.createdAt')

# Generate file path
timestamp=$(date "+%Y-%m-%dT%H:%M")
date_prefix=$(date "+%Y-%m-%d")
slug=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 40)
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

# Create local file with provenance
cat > ".planning/issues/open/${date_prefix}-${slug}.md" << EOF
---
created: ${timestamp}
title: ${TITLE}
area: general
provenance: github:${OWNER_REPO}#${ISSUE_NUMBER}
files: []
---

## Problem

${BODY}

## Solution

TBD
EOF
```
The `provenance` field enables deduplication on subsequent checks.
Confirm: "Pulled GitHub Issue #[number] to local: .planning/issues/open/[filename]"
Return to list or offer to work on it.

**Work on it now (open local issue):**
Move from open to in-progress (does NOT close GitHub Issue):
```bash
mv ".planning/issues/open/[filename]" ".planning/issues/in-progress/"

# Add in-progress label to GitHub Issue if linked
PROVENANCE=$(grep "^provenance:" ".planning/issues/in-progress/[filename]" | cut -d' ' -f2)
if echo "$PROVENANCE" | grep -q "^github:"; then
  ISSUE_NUMBER=$(echo "$PROVENANCE" | grep -oE '#[0-9]+' | tr -d '#')

  if [ -n "$ISSUE_NUMBER" ]; then
    GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

    if [ "$GITHUB_ENABLED" = "true" ]; then
      # Create in-progress label idempotently (ignore error if exists)
      gh label create "in-progress" --description "Issue is actively being worked on" --color "FFA500" 2>/dev/null || true

      # Add in-progress label (keeps backlog label)
      gh issue edit "$ISSUE_NUMBER" --add-label "in-progress" 2>/dev/null \
        && echo "Added in-progress label to GitHub Issue #${ISSUE_NUMBER}" \
        || echo "Warning: Failed to add in-progress label to GitHub Issue #${ISSUE_NUMBER}"

      # Assign issue to self
      gh issue edit "$ISSUE_NUMBER" --add-assignee @me 2>/dev/null \
        && echo "Assigned GitHub Issue #${ISSUE_NUMBER} to @me" \
        || echo "Warning: Failed to assign GitHub Issue #${ISSUE_NUMBER}"
    fi
  fi
fi
```

Display confirmation:
```
Issue moved to in-progress: [filename]

  [title]
  Area: [area]
  GitHub: Linked to #[number], added in-progress label, assigned to @me
          -or- Not linked (if no provenance)

Ready to begin work.

When complete, use `/kata:check-issues` and select "Mark complete".
```

Update STATE.md issue count. Present problem/solution context. Begin work or ask how to proceed.

**Work on it now (GitHub-only issue):**
First execute "Pull to local" action, then move to in-progress:
```bash
mv ".planning/issues/open/${date_prefix}-${slug}.md" ".planning/issues/in-progress/"

# Add in-progress label to GitHub Issue (we know it's GitHub-linked since this is the GitHub-only path)
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

if [ "$GITHUB_ENABLED" = "true" ]; then
  # Create in-progress label idempotently (ignore error if exists)
  gh label create "in-progress" --description "Issue is actively being worked on" --color "FFA500" 2>/dev/null || true

  # Add in-progress label (keeps backlog label)
  # Note: $ISSUE_NUMBER is already available from the pull-to-local step
  gh issue edit "$ISSUE_NUMBER" --add-label "in-progress" 2>/dev/null \
    && echo "Added in-progress label to GitHub Issue #${ISSUE_NUMBER}" \
    || echo "Warning: Failed to add in-progress label to GitHub Issue #${ISSUE_NUMBER}"

  # Assign issue to self
  gh issue edit "$ISSUE_NUMBER" --add-assignee @me 2>/dev/null \
    && echo "Assigned GitHub Issue #${ISSUE_NUMBER} to @me" \
    || echo "Warning: Failed to assign GitHub Issue #${ISSUE_NUMBER}"
fi
```

Display confirmation:
```
Issue moved to in-progress: [filename]

  [title]
  Area: [area]
  GitHub: Linked to #[number], added in-progress label, assigned to @me

Ready to begin work.

When complete, use `/kata:check-issues` and select "Mark complete".
```

Update STATE.md issue count. Present problem/solution context. Begin work or ask how to proceed.

**Mark complete (in-progress issue):**
Move from in-progress to closed and close GitHub Issue if linked:
```bash
mv ".planning/issues/in-progress/[filename]" ".planning/issues/closed/"

# Check if issue has GitHub provenance
PROVENANCE=$(grep "^provenance:" ".planning/issues/closed/[filename]" | cut -d' ' -f2)
if echo "$PROVENANCE" | grep -q "^github:"; then
  # Extract issue number from provenance (format: github:owner/repo#N)
  ISSUE_NUMBER=$(echo "$PROVENANCE" | grep -oE '#[0-9]+' | tr -d '#')

  if [ -n "$ISSUE_NUMBER" ]; then
    # Check github.enabled (may have changed since issue was created)
    GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

    if [ "$GITHUB_ENABLED" = "true" ]; then
      # Close GitHub Issue with comment
      gh issue close "$ISSUE_NUMBER" --comment "Completed via Kata workflow" 2>/dev/null \
        && echo "Closed GitHub Issue #${ISSUE_NUMBER}" \
        || echo "Warning: Failed to close GitHub Issue #${ISSUE_NUMBER}"
    fi
  fi
fi
```

Display confirmation:
```
Issue completed: [filename]

  [title]
  Area: [area]
  GitHub: Closed #[number] (if provenance exists and close succeeded)
          -or- Not linked (if no provenance)
          -or- Failed to close #[number] (if close failed)

Issue closed.
```

Update STATE.md issue count.

**Put back to open (in-progress issue):**
Move from in-progress back to open:
```bash
mv ".planning/issues/in-progress/[filename]" ".planning/issues/open/"
```
Confirm: "Issue moved back to open: [filename]"
Return to list.

**Continue working (in-progress issue):**
Present problem/solution context. Begin work or ask how to proceed.

**View on GitHub (GitHub-only issues):**
```bash
gh issue view $ISSUE_NUMBER --web
```
Opens issue in browser. Return to list.

**Add to phase plan:**
Note issue reference in phase planning notes. Keep in open. Return to list or exit.

**Create a phase:**
Display: `/kata:add-phase [description from issue]`
Keep in open. User runs command in fresh context.

**Brainstorm approach:**
Keep in open. Start discussion about problem and approaches.

**Put it back:**
Return to list_issues step.
</step>

<step name="update_state">
After any action that changes issue count:

```bash
OPEN_COUNT=$(ls .planning/issues/open/*.md 2>/dev/null | wc -l | tr -d ' ')
IN_PROGRESS_COUNT=$(ls .planning/issues/in-progress/*.md 2>/dev/null | wc -l | tr -d ' ')
CLOSED_COUNT=$(ls .planning/issues/closed/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Open: $OPEN_COUNT, In Progress: $IN_PROGRESS_COUNT, Closed: $CLOSED_COUNT"
```

Update STATE.md "### Pending Issues" section if exists.
</step>

<step name="git_commit">
If issue state changed, commit the change:

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations, log "Issue moved (not committed - commit_docs: false)"

**If `COMMIT_PLANNING_DOCS=true` (default):**

**If moved to in-progress (Work on it now):**
```bash
git add .planning/issues/in-progress/[filename]
git rm --cached .planning/issues/open/[filename] 2>/dev/null || true
[ -f .planning/STATE.md ] && git add .planning/STATE.md

git commit -m "$(cat <<EOF
docs: start work on issue - [title]

Moved to in-progress.
EOF
)"
```
Confirm: "Committed: docs: start work on issue - [title]"

**If moved to closed (Mark complete):**
```bash
git add .planning/issues/closed/[filename]
git rm --cached .planning/issues/in-progress/[filename] 2>/dev/null || true
[ -f .planning/STATE.md ] && git add .planning/STATE.md

# Check if issue had GitHub provenance that was closed
PROVENANCE=$(grep "^provenance:" ".planning/issues/closed/[filename]" | cut -d' ' -f2)
GITHUB_REF=""
if echo "$PROVENANCE" | grep -q "^github:"; then
  GITHUB_REF="Closes $(echo "$PROVENANCE" | grep -oE '#[0-9]+')"
fi

git commit -m "$(cat <<EOF
docs: complete issue - [title]

${GITHUB_REF}
EOF
)"
```
Confirm: "Committed: docs: complete issue - [title]"

**If moved back to open (Put back to open):**
```bash
git add .planning/issues/open/[filename]
git rm --cached .planning/issues/in-progress/[filename] 2>/dev/null || true
[ -f .planning/STATE.md ] && git add .planning/STATE.md

git commit -m "docs: return issue to backlog - [title]"
```
Confirm: "Committed: docs: return issue to backlog - [title]"
</step>

</process>

<output>
- Moved issue to `.planning/issues/in-progress/` (if "Work on it now")
- Moved issue to `.planning/issues/closed/` (if "Mark complete")
- Moved issue to `.planning/issues/open/` (if "Put back to open")
- Created `.planning/issues/open/` file (if "Pull to local" from GitHub)
- Updated `.planning/STATE.md` (if issue count changed)
</output>

<anti_patterns>
- Don't delete issues — use proper state transitions
- Don't close GitHub Issues when starting work — only when marking complete
- Don't create plans from this command — route to /kata:plan-phase or /kata:add-phase
</anti_patterns>

<issue_lifecycle>
## Issue Lifecycle

Issues follow a three-state lifecycle:

```
open/        → Backlog (not started)
in-progress/ → Actively being worked on
closed/      → Completed
```

**State transitions:**
- **Work on it now:** `open/` → `in-progress/` (does NOT close GitHub Issue)
- **Mark complete:** `in-progress/` → `closed/` (closes GitHub Issue if linked)
- **Put back to open:** `in-progress/` → `open/` (useful if deprioritized)

**GitHub Issue lifecycle:**
- Created when: `/kata:add-issue` with `github.enabled=true`
- Linked via: `provenance: github:owner/repo#N` in local file
- Closed when: User selects "Mark complete" on an in-progress issue
- Alternative: GitHub auto-closes via "Closes #N" in PR description when PR merges

The provenance field is the linchpin - it enables deduplication and bidirectional updates.
</issue_lifecycle>

<success_criteria>
- [ ] Open and in-progress issues listed with title, area, age
- [ ] In-progress issues shown first with [IN PROGRESS] indicator
- [ ] GitHub backlog issues included (if github.enabled=true)
- [ ] Deduplication applied (local provenance matches GitHub #)
- [ ] GitHub-only issues marked with [GH] indicator
- [ ] Area filter applied if specified
- [ ] Selected issue's full context loaded
- [ ] Roadmap context checked for phase match
- [ ] Appropriate actions offered based on issue state
- [ ] "Work on it now" moves to in-progress (does NOT close GitHub)
- [ ] "Work on it now" adds in-progress label to GitHub Issue (if linked)
- [ ] "Work on it now" assigns GitHub Issue to @me (if linked)
- [ ] "Mark complete" moves to closed AND closes GitHub Issue
- [ ] STATE.md updated if issue count changed
- [ ] Changes committed to git
</success_criteria>
