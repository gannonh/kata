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
  mkdir -p .planning/issues/open .planning/issues/closed

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
```

Migration is idempotent: presence of `_archived/` indicates already migrated.
</step>

<step name="check_exist">
```bash
ISSUE_COUNT=$(ls .planning/issues/open/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Open issues: $ISSUE_COUNT"
```

If count is 0:
```
No open issues.

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
# Get all GitHub issue numbers already tracked locally
LOCAL_PROVENANCE=$(grep -h "^provenance: github:" .planning/issues/open/*.md 2>/dev/null | grep -oE '#[0-9]+' | tr -d '#' | sort -u)
```

**3. Query GitHub Issues (if enabled):**
```bash
if [ "$GITHUB_ENABLED" = "true" ]; then
  # Get GitHub Issues with backlog label, excluding those already tracked locally
  GITHUB_ISSUES=$(gh issue list --label "backlog" --state open --json number,title,createdAt,labels --jq '.[] | "\(.createdAt)|\(.title)|github|\(.number)"' 2>/dev/null)
fi
```

**4. Query local issues:**
```bash
for file in .planning/issues/open/*.md; do
  created=$(grep "^created:" "$file" | cut -d' ' -f2)
  title=$(grep "^title:" "$file" | cut -d':' -f2- | xargs)
  area=$(grep "^area:" "$file" | cut -d' ' -f2)
  echo "$created|$title|$area|$file"
done | sort
```

**5. Merge and display:**

Combine local and GitHub issues into a unified list:
- Local issues display as-is with their area
- GitHub-only issues (number NOT in LOCAL_PROVENANCE) display with `[GH]` indicator
- Format: `1. Add auth token refresh (api, 2d ago)` vs `1. Fix login bug [GH] (bug, 2d ago)`

Sort combined list by date (oldest first for consistent ordering).

Apply area filter if specified. Display as numbered list:

```
Open Issues:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago)
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
**If GitHub-only issue (has [GH] indicator):**

Use AskUserQuestion:
- header: "Action"
- question: "This is a GitHub Issue. What would you like to do?"
- options:
  - "Pull to local" — create local file for offline work
  - "Work on it now" — pull to local AND move to closed
  - "View on GitHub" — open in browser (gh issue view --web)
  - "Put it back" — return to list

**If local issue maps to a roadmap phase:**

Use AskUserQuestion:
- header: "Action"
- question: "This issue relates to Phase [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — move to closed, start working
  - "Add to phase plan" — include when planning Phase [N]
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If local issue with no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this issue?"
- options:
  - "Work on it now" — move to closed, start working
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

**Work on it now (local issue):**
```bash
mv ".planning/issues/open/[filename]" ".planning/issues/closed/"
```
Update STATE.md issue count. Present problem/solution context. Begin work or ask how to proceed.

**Work on it now (GitHub-only issue):**
First execute "Pull to local" action, then move to closed:
```bash
mv ".planning/issues/open/${date_prefix}-${slug}.md" ".planning/issues/closed/"
```
Update STATE.md issue count. Present problem/solution context. Begin work or ask how to proceed.

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
ls .planning/issues/open/*.md 2>/dev/null | wc -l
```

Update STATE.md "### Pending Issues" section if exists.
</step>

<step name="git_commit">
If issue was moved to closed/, commit the change:

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations, log "Issue moved (not committed - commit_docs: false)"

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/issues/closed/[filename]
git rm --cached .planning/issues/open/[filename] 2>/dev/null || true
[ -f .planning/STATE.md ] && git add .planning/STATE.md
git commit -m "$(cat <<'EOF'
docs: start work on issue - [title]

Moved to closed/, beginning implementation.
EOF
)"
```

Confirm: "Committed: docs: start work on issue - [title]"
</step>

</process>

<output>
- Moved issue to `.planning/issues/closed/` (if "Work on it now")
- Created `.planning/issues/open/` file (if "Pull to local" from GitHub)
- Updated `.planning/STATE.md` (if issue count changed)
</output>

<anti_patterns>
- Don't delete issues — move to closed/ when work begins
- Don't start work without moving to closed/ first
- Don't create plans from this command — route to /kata:plan-phase or /kata:add-phase
</anti_patterns>

<success_criteria>
- [ ] All open issues listed with title, area, age
- [ ] GitHub backlog issues included (if github.enabled=true)
- [ ] Deduplication applied (local provenance matches GitHub #)
- [ ] GitHub-only issues marked with [GH] indicator
- [ ] Area filter applied if specified
- [ ] Selected issue's full context loaded
- [ ] Roadmap context checked for phase match
- [ ] Appropriate actions offered (Pull to local for GitHub issues)
- [ ] Selected action executed
- [ ] STATE.md updated if issue count changed
- [ ] Changes committed to git (if issue moved to closed/)
</success_criteria>
