# Phase 1: Issue Model Foundation - Research

**Researched:** 2026-01-31
**Status:** Complete

## 1. Files Requiring Vocabulary Changes (todo → issue)

**Total files with "todo" references:** 52 unique files (119 total references)

### Primary Vocabulary Files (Skills & Commands)

| File | Line Count | Primary Changes Needed |
|------|-----------|----------------------|
| `skills/adding-todos/SKILL.md` | 199 | Rename to `adding-issues`, update all paths from `.planning/todos/` to `.planning/issues/` |
| `skills/checking-todos/SKILL.md` | 232 | Rename to `checking-issues`, update paths and all user-facing messages |

### Secondary References (Skills that reference todos)

| File | Referenced In | Impact |
|------|---------------|--------|
| `skills/executing-phases/SKILL.md` | Phase execution workflow | Update messages mentioning pending todos |
| `skills/verifying-work/SKILL.md` | Verification workflow | Update todo references in decision trees |
| `skills/providing-help/SKILL.md` | Help command | Update example commands and descriptions |
| `skills/auditing-milestones/SKILL.md` | Milestone audits | Update references to todo counts/status |
| `skills/tracking-progress/SKILL.md` | Progress tracking | Update STATE.md todo reporting |
| `skills/resuming-work/references/resume-project.md` | Resume workflow | Update todo recovery steps |

**Total estimated lines to review/update:** ~650-700 lines across skills, commands, and documentation

---

## 2. Current Todo Data Model

### Frontmatter Schema (YAML)

```yaml
---
created: 2026-01-19T07:55                    # ISO 8601 timestamp
title: Add type label to todo frontmatter    # 3-10 word action-verb preferred
area: tooling                                 # Classification: api, ui, auth, db, testing, docs, planning, tooling, general
files:                                        # Optional: referenced file paths
  - path/to/file:line-range
priority: high                                # Optional: high, medium, low
type: feature                                 # Optional: feature, bug, improvement, refactor, docs, chore
---
```

### Body Structure

```markdown
## Problem
[Enough context for future Claude to understand weeks later]

## Solution
[Approach hints or "TBD"]
```

### Storage Structure

```
.planning/
├── todos/
│   ├── pending/
│   │   ├── 2026-01-18-create-move-phase-command.md
│   │   └── ... (20 files)
│   └── done/
│       └── ... (10 files)
```

**Filename Convention:** `{YYYY-MM-DD}-{kebab-case-slug}.md`

---

## 3. Current Skill Architecture for Todo Operations

### Add Todo Workflow (`adding-todos`)

1. ensure_directory — Create .planning/todos/{pending,done}/
2. extract_content — Parse from args or conversation context
3. infer_area — Match file paths to area categories
4. check_duplicates — grep for keyword matches in pending/
5. create_file — Generate markdown with frontmatter
6. update_state — Update .planning/STATE.md
7. git_commit — Commit with config.json check
8. confirm — Show saved location

### Check Todo Workflow (`checking-todos`)

1. check_exist — Count pending/*.md files
2. parse_filter — Extract area argument if provided
3. list_todos — Loop through, extract frontmatter, sort by date
4. handle_selection — User picks number from list
5. load_context — Read full selected todo
6. check_roadmap — Look for phase mapping
7. offer_actions — Work now, add to phase, brainstorm, return
8. execute_action — Move to done/, invoke planning
9. update_state — Update todo count
10. git_commit — Commit moves

---

## 4. GitHub Integration Patterns (from Phase 3 Research)

**Standard Pattern:** Using `gh` CLI with idempotent checks:

```bash
# Create label if doesn't exist
gh label create "phase" --color "0E8A16" --description "description" --force

# Check if issue exists (idempotent)
EXISTING=$(gh issue list --label "phase" --search "keyword" \
  --json number,title --jq '.[0].number // empty')
```

**Existing Integration Points:**
- `github.issueMode` setting (auto | ask | never)
- Milestone mapping via version numbers
- Issue closure via `Closes #X` in PR body

---

## 5. Recommendations for Issue Model Design

### Migration Strategy (from 01-CONTEXT.md)
- Auto-migrate existing todos on first use
- Archive originals to `.planning/todos/_archived/`
- Show deprecation warnings for old commands

### Data Model Decisions Made
- Priority field: High/Medium/Low with sensible default
- Auto-capture provenance (phase/plan context)
- Natural language input with agent structuring

### Deferred to Claude's Discretion
- Labels/tags system
- Status tracking approach (directory-based vs field)
- Display format for check-issues
- GitHub + local unified view vs sections
- Filtering support

### Directory Structure

Current → New:
```
.planning/todos/pending/ → .planning/issues/open/
.planning/todos/done/    → .planning/issues/closed/
```

### Frontmatter Standardization

```yaml
created: [ISO 8601]
title: [action-verb based]
area: [category]
type: [feature|bug|improvement|refactor|docs|chore]
priority: [high|medium|low] — optional, default: medium
files: [list]
provenance: [phase/plan if created during work] — NEW
```

---

## Key Insights for Planning

1. **Migration scope is small:** Only 2 primary skills + 5 secondary references. ~700 lines to review.

2. **Data model is sound:** Current frontmatter maps well to issues. Type field shows transition was anticipated.

3. **Config pattern established:** Skills check config.json for flags. Pattern can extend to github.enabled.

4. **Idempotency patterns available:** Phase 3 research has proven `gh` CLI patterns for reuse in Phase 2.

5. **Archive strategy minimizes risk:** Moving to `_archived/` preserves history.

6. **Naming convention:** Singular preferred (`/kata:add-issue`) - reads better than plural.

---

*Research Date: 2026-01-31*
