---
name: adding-issues
description: Use this skill to capture an idea, task, or issue that surfaces during a Kata session as a structured issue for later work. This skill creates markdown issue files in the .planning/issues/open directory with relevant metadata and content extracted from the conversation. Triggers include "add issue", "capture issue", "new issue", "create issue", "log issue", and "file issue".
metadata:
  version: "0.2.0"
user-invocable: false
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<user_command>/kata:add-issue</user_command>


<objective>
Capture an idea, task, or issue that surfaces during a Kata session as a structured issue for later work.

Enables "thought -> capture -> continue" flow without losing context or derailing current work.
</objective>

<context>
@.planning/STATE.md
</context>

<process>

<step name="ensure_directory">
```bash
mkdir -p .planning/issues/open .planning/issues/closed
```
</step>

<step name="check_existing_areas">
```bash
ls .planning/issues/open/*.md 2>/dev/null | xargs -I {} grep "^area:" {} 2>/dev/null | cut -d' ' -f2 | sort -u
```

Note existing areas for consistency in infer_area step.
</step>

<step name="extract_content">
**With arguments:** Use as the title/focus.
- `/kata:add-issue Add auth token refresh` -> title = "Add auth token refresh"

**Without arguments:** Analyze recent conversation to extract:
- The specific problem, idea, or task discussed
- Relevant file paths mentioned
- Technical details (error messages, line numbers, constraints)

Formulate:
- `title`: 3-10 word descriptive title (action verb preferred)
- `problem`: What's wrong or why this is needed
- `solution`: Approach hints or "TBD" if just an idea
- `files`: Relevant paths with line numbers from conversation
- `provenance`: (optional) Origin of the issue - "local" (default), "github:owner/repo#N", or other external reference
</step>

<step name="infer_area">
Infer area from file paths:

| Path pattern                   | Area       |
| ------------------------------ | ---------- |
| `src/api/*`, `api/*`           | `api`      |
| `src/components/*`, `src/ui/*` | `ui`       |
| `src/auth/*`, `auth/*`         | `auth`     |
| `src/db/*`, `database/*`       | `database` |
| `tests/*`, `__tests__/*`       | `testing`  |
| `docs/*`                       | `docs`     |
| `.planning/*`                  | `planning` |
| `scripts/*`, `bin/*`           | `tooling`  |
| No files or unclear            | `general`  |

Use existing area from step 2 if similar match exists.
</step>

<step name="check_duplicates">
```bash
grep -l -i "[key words from title]" .planning/issues/open/*.md 2>/dev/null
```

If potential duplicate found:
1. Read the existing issue
2. Compare scope

If overlapping, use AskUserQuestion:
- header: "Duplicate?"
- question: "Similar issue exists: [title]. What would you like to do?"
- options:
  - "Skip" - keep existing issue
  - "Replace" - update existing with new context
  - "Add anyway" - create as separate issue
</step>

<step name="create_file">
```bash
timestamp=$(date "+%Y-%m-%dT%H:%M")
date_prefix=$(date "+%Y-%m-%d")
```

Generate slug from title (lowercase, hyphens, no special chars).

Write to `.planning/issues/open/${date_prefix}-${slug}.md`:

```markdown
---
created: [timestamp]
title: [title]
area: [area]
provenance: [provenance or "local"]
files:
  - [file:lines]
---

## Problem

[problem description - enough context for future Claude to understand weeks later]

## Solution

[approach hints or "TBD"]
```
</step>

<step name="update_state">
If `.planning/STATE.md` exists:

1. Count issues: `ls .planning/issues/open/*.md 2>/dev/null | wc -l`
2. Update "### Pending Issues" under "## Accumulated Context"
</step>

<step name="git_commit">
Commit the issue and any updated state:

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations, log "Issue saved (not committed - commit_docs: false)"

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/issues/open/[filename]
[ -f .planning/STATE.md ] && git add .planning/STATE.md
git commit -m "$(cat <<'EOF'
docs(issue): capture issue - [title]

Area: [area]
EOF
)"
```

Confirm: "Committed: docs(issue): capture issue - [title]"
</step>

<step name="confirm">
```
Issue saved: .planning/issues/open/[filename]

  [title]
  Area: [area]
  Files: [count] referenced

---

Would you like to:

1. Continue with current work
2. Add another issue
3. View all issues (/kata:check-issues)
```
</step>

</process>

<output>
- `.planning/issues/open/[date]-[slug].md`
- Updated `.planning/STATE.md` (if exists)
</output>

<anti_patterns>
- Don't create issues for work in current plan (that's deviation rule territory)
- Don't create elaborate solution sections - captures ideas, not plans
- Don't block on missing information - "TBD" is fine
</anti_patterns>

<success_criteria>
- [ ] Directory structure exists
- [ ] Issue file created with valid frontmatter
- [ ] Problem section has enough context for future Claude
- [ ] No duplicates (checked and resolved)
- [ ] Area consistent with existing issues
- [ ] STATE.md updated if exists
- [ ] Issue and state committed to git
</success_criteria>
