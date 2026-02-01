---
name: check-issues
description: Use this skill when reviewing open issues, selecting an issue to work on, filtering issues by area, or deciding what to work on next. Triggers include "check issues", "list issues", "what issues", "open issues", "show issues", "view issues", "select issue to work on", "check todos" (deprecated), "list todos" (deprecated), "pending todos" (deprecated).
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
```bash
for file in .planning/issues/open/*.md; do
  created=$(grep "^created:" "$file" | cut -d' ' -f2)
  title=$(grep "^title:" "$file" | cut -d':' -f2- | xargs)
  area=$(grep "^area:" "$file" | cut -d' ' -f2)
  echo "$created|$title|$area|$file"
done | sort
```

Apply area filter if specified. Display as numbered list:

```
Open Issues:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago)
3. Refactor database connection pool (database, 5h ago)

---

Reply with a number to view details, or:
- `/kata:check-issues [area]` to filter by area
- `q` to exit
```

Format age as relative time.
</step>

<step name="handle_selection">
Wait for user to reply with a number.

If valid: load selected issue, proceed.
If invalid: "Invalid selection. Reply with a number (1-[N]) or `q` to exit."
</step>

<step name="load_context">
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
**If issue maps to a roadmap phase:**

Use AskUserQuestion:
- header: "Action"
- question: "This issue relates to Phase [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — move to closed, start working
  - "Add to phase plan" — include when planning Phase [N]
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If no roadmap match:**

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
**Work on it now:**
```bash
mv ".planning/issues/open/[filename]" ".planning/issues/closed/"
```
Update STATE.md issue count. Present problem/solution context. Begin work or ask how to proceed.

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
- Updated `.planning/STATE.md` (if issue count changed)
</output>

<anti_patterns>
- Don't delete issues — move to closed/ when work begins
- Don't start work without moving to closed/ first
- Don't create plans from this command — route to /kata:plan-phase or /kata:add-phase
</anti_patterns>

<success_criteria>
- [ ] All open issues listed with title, area, age
- [ ] Area filter applied if specified
- [ ] Selected issue's full context loaded
- [ ] Roadmap context checked for phase match
- [ ] Appropriate actions offered
- [ ] Selected action executed
- [ ] STATE.md updated if issue count changed
- [ ] Changes committed to git (if issue moved to closed/)
</success_criteria>
