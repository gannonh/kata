# Phase 3: Issue → Roadmap Integration - Research

**Researched:** 2026-02-02
**Domain:** Kata issue management and roadmap integration
**Confidence:** HIGH

## Summary

Phase 3 enables pulling backlog issues into milestones and phases, completing the bidirectional link between the issue system and the roadmap. The existing infrastructure is mature: issues have a well-defined format with provenance tracking, skills like `check-issues` and `add-milestone` have established patterns, and the PLAN.md format already supports extensible frontmatter.

The research reveals three implementation paths:
1. **INTEG-01**: Extend `add-milestone` to present backlog issues for selection during milestone scope definition
2. **INTEG-02**: Extend `check-issues` "Planned" mode to properly link issues into phases (leveraging Phase 2's existing routing)
3. **INTEG-03**: Add `source_issue` field to PLAN.md frontmatter for traceability

**Primary recommendation:** Build on existing skill patterns. The `check-issues` skill already has "Link to existing phase" logic from Phase 2. INTEG-02 and INTEG-03 extend this pattern. INTEG-01 adds issue selection to the existing `add-milestone` questioning flow.

## Standard Stack

### Core (Already Exists)

| Component | Location | Purpose | Confidence |
| --------- | -------- | ------- | ---------- |
| Issue Model | `.planning/issues/{open,in-progress,closed}/` | Issue storage with YAML frontmatter | HIGH |
| Provenance Field | Issue frontmatter | Links local ↔ GitHub via `github:owner/repo#N` | HIGH |
| check-issues Skill | `skills/check-issues/SKILL.md` | Issue list, selection, mode routing | HIGH |
| add-milestone Skill | `skills/add-milestone/SKILL.md` | Milestone creation with questioning flow | HIGH |
| PLAN.md Format | Agent `kata-planner.md` | Extensible frontmatter + XML tasks | HIGH |
| ROADMAP.md | `.planning/ROADMAP.md` | Milestone/phase structure | HIGH |

### New Fields Required

| Field | Location | Purpose | Format |
| ----- | -------- | ------- | ------ |
| `source_issue` | PLAN.md frontmatter | Issue traceability | `github:#N` or local file path |
| `milestone_issues` | add-milestone context | Selected backlog issues | Array of issue references |
| `linked_phase` | STATE.md "Pending Issues" | Phase linkage tracking | `phase: NN-name` annotation |

## Architecture Patterns

### Existing Issue Format (HIGH Confidence)

Source: Analysis of `.planning/issues/open/*.md`

```yaml
---
created: 2026-02-02T15:22
title: Issue title
area: general
provenance: github:gannonh/kata-orchestrator#76
files: []
---

## Problem

[Problem description]

## Solution

[Approach or TBD]
```

Key fields:
- `provenance`: Links to GitHub Issue (`github:owner/repo#N`) or `local`
- `area`: Categorization for filtering
- `title`: Used as display name and plan description

### Existing check-issues "Planned" Mode (HIGH Confidence)

Source: `skills/check-issues/SKILL.md` (Phase 2 implementation)

The skill already has:
1. Mode selection ("Quick task" vs "Planned")
2. "Link to existing phase" option that finds upcoming phases
3. Phase discovery logic (phases with incomplete plans)

```markdown
**If "Link to existing phase" selected:**

1. Find upcoming phases that might match:
   - Get phase directories with incomplete plans
   - Extract phase goal from roadmap

2. If matching phases found, present selection

3. If phase selected:
   - Note the linkage in STATE.md under "### Pending Issues" with phase reference
   - Display confirmation
   - Keep issue in open/
```

**Gap identified:** The linkage is noted in STATE.md but PLAN.md doesn't track `source_issue`. INTEG-03 closes this gap.

### Existing add-milestone Flow (HIGH Confidence)

Source: `skills/add-milestone/SKILL.md`

Current flow:
1. Load project context (PROJECT.md, MILESTONES.md, STATE.md)
2. Gather milestone goals (MILESTONE-CONTEXT.md or questioning)
3. Determine version number
4. Update PROJECT.md
5. Research (optional)
6. Define requirements
7. Create roadmap
8. Create phase issues (if GitHub enabled)

**Integration point for INTEG-01:** After gathering milestone goals (Phase 2), before requirements definition (Phase 8), present backlog issues for inclusion.

### PLAN.md Frontmatter Extension (HIGH Confidence)

Source: `agents/kata-planner.md` plan_format section

Current frontmatter:
```yaml
---
phase: XX-name
plan: NN
type: execute
wave: N
depends_on: []
files_modified: []
autonomous: true
user_setup: []  # Optional

must_haves:
  truths: []
  artifacts: []
  key_links: []
---
```

**Proposed extension:**
```yaml
---
phase: XX-name
plan: NN
type: execute
source_issue: github:#76  # NEW: Traceability to source issue
# ... rest unchanged
---
```

The `source_issue` field enables:
- PRs can include `Closes #N` by reading plan frontmatter
- Auditing which issues led to which plans
- Issue status updates when plans complete

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Issue listing | Custom file parsing | Existing `check-issues` list_issues step | Already handles open + in-progress + GitHub-only deduplication |
| Phase discovery | New discovery logic | Existing `check-issues` UPCOMING_PHASES pattern | Already identifies incomplete phases |
| GitHub Issue closure | Manual `gh issue close` | `Closes #N` in PR body | Git-native, automatic, auditable |
| Issue metadata extraction | Custom parsing | Existing provenance parsing in check-issues | `ISSUE_NUMBER=$(echo "$PROVENANCE" \| grep -oE '#[0-9]+' \| tr -d '#')` |

**Key insight:** Phase 2 built the routing infrastructure. Phase 3 completes the wiring, not rebuilds it.

## Common Pitfalls

### Pitfall 1: Duplicate Issue Linkage

**What goes wrong:** Same issue linked to multiple phases/plans without tracking
**Why it happens:** No single source of truth for issue-to-phase mapping
**How to avoid:**
- Track linkage in STATE.md "### Pending Issues" section (existing pattern)
- When creating plan with `source_issue`, move issue to in-progress
- One issue = one plan reference
**Warning signs:** Multiple plans claiming same `source_issue`

### Pitfall 2: Lost Provenance Chain

**What goes wrong:** Plan completes but GitHub Issue doesn't close
**Why it happens:** PR doesn't include `Closes #N` because plan frontmatter not read
**How to avoid:**
- `source_issue` field MUST be read by execute-phase or PR creation workflow
- Pattern established in Phase 1: execute-phase reads provenance for PR body
**Warning signs:** Completed plans with open GitHub Issues

### Pitfall 3: Stale Issue List During Milestone Planning

**What goes wrong:** User selects issues that were already addressed
**Why it happens:** Issue list not refreshed from GitHub before presentation
**How to avoid:**
- Re-sync with GitHub (`gh issue list --label backlog`) before presenting options
- Check local closed/ directory
- Deduplicate using existing LOCAL_PROVENANCE pattern
**Warning signs:** Selected issues already have closed status

### Pitfall 4: Conflating "Link to Phase" with "Pull into Phase"

**What goes wrong:** User confusion about what action does what
**Why it happens:** Similar-sounding operations with different outcomes
**How to avoid:**
- Clear terminology:
  - "Link to phase" = Note reference for planning context
  - "Pull into phase" = Create task/plan from issue content
- Different UI flows for different intents
**Warning signs:** Users expecting plan creation from "link" action

## Code Examples

### Pattern 1: Extracting Issue Context for Plan

Source: `skills/check-issues/SKILL.md` execute_action step

```bash
# Extract issue metadata
ISSUE_TITLE=$(grep "^title:" "$ISSUE_FILE" | cut -d':' -f2- | xargs)
PROVENANCE=$(grep "^provenance:" "$ISSUE_FILE" | cut -d' ' -f2)
ISSUE_NUMBER=""
if echo "$PROVENANCE" | grep -q "^github:"; then
  ISSUE_NUMBER=$(echo "$PROVENANCE" | grep -oE '#[0-9]+' | tr -d '#')
fi

# Extract problem section for context
ISSUE_PROBLEM=$(sed -n '/^## Problem/,/^## /p' "$ISSUE_FILE" | tail -n +2 | head -n -1)
```

### Pattern 2: Phase Discovery for Linkage

Source: `skills/check-issues/SKILL.md` execute_action step

```bash
UPCOMING_PHASES=""
for phase_dir in .planning/phases/*/; do
  phase_name=$(basename "$phase_dir")
  plan_count=$(ls "$phase_dir"/*-PLAN.md 2>/dev/null | wc -l)
  summary_count=$(ls "$phase_dir"/*-SUMMARY.md 2>/dev/null | wc -l)

  if [ "$plan_count" -gt 0 ] && [ "$plan_count" -gt "$summary_count" ]; then
    phase_num=$(echo "$phase_name" | grep -oE '^[0-9]+')
    phase_goal=$(grep -A2 "### Phase ${phase_num}:" .planning/ROADMAP.md | grep "Goal:" | cut -d':' -f2- | xargs)
    UPCOMING_PHASES="${UPCOMING_PHASES}\n- ${phase_name}: ${phase_goal}"
  fi
done
```

### Pattern 3: Presenting Backlog Issues for Selection

Source: `skills/add-milestone/SKILL.md` questioning pattern (adapted)

```markdown
**Step N: Present backlog issues for milestone scope (NEW)**

1. Check backlog:
```bash
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
BACKLOG_COUNT=$(ls .planning/issues/open/*.md 2>/dev/null | wc -l | tr -d ' ')
```

2. If backlog issues exist, present selection:

Use AskUserQuestion:
- header: "Backlog Issues"
- question: "Include any backlog issues in this milestone's scope?"
- multiSelect: true
- options:
  - "[Issue 1]: [title]" — [area], created [date]
  - "[Issue 2]: [title]" — [area], created [date]
  - "None" — Start fresh without existing issues
```

### Pattern 4: Source Issue Reference in PLAN.md

Proposed frontmatter extension:

```yaml
---
phase: 03-issue-roadmap-integration
plan: 01
type: execute
source_issue: github:#76  # Enables: PR includes Closes #76
wave: 1
depends_on: []
files_modified:
  - skills/add-milestone/SKILL.md
autonomous: true

must_haves:
  truths:
    - "Backlog issues presented during milestone scope definition"
  artifacts:
    - path: "skills/add-milestone/SKILL.md"
      provides: "Issue selection in milestone flow"
      contains: "Backlog Issues"
---
```

## State of the Art

| Component | Current State | Changes in Phase 3 | Impact |
| --------- | ------------- | ------------------ | ------ |
| check-issues | Has "Link to existing phase" routing | Complete the linkage to plan creation | INTEG-02, INTEG-03 |
| add-milestone | Linear questioning flow | Add issue selection step | INTEG-01 |
| PLAN.md | No issue provenance | Add `source_issue` field | INTEG-03 |
| STATE.md | Tracks pending issues count | Track issue-phase linkage | INTEG-02 |
| execute-phase | Reads phase provenance for PR | Read `source_issue` for PR body | INTEG-03 |

**No deprecations:** All existing patterns remain valid. Phase 3 extends, not replaces.

## User Flows

### Flow 1: Pull Issue into Milestone Scope (INTEG-01)

1. User runs `/kata:add-milestone`
2. After goals gathered, skill presents backlog issues
3. User selects issues to include
4. Selected issues inform requirements definition
5. Roadmap phases may be scoped around selected issues
6. Selected issues linked in STATE.md for planning context

### Flow 2: Pull Issue into Phase as Plan (INTEG-02)

1. User runs `/kata:check-issues`
2. Selects an issue, chooses "Work on it now" → "Planned"
3. Chooses "Link to existing phase" or "Create new phase"
4. If "Link to existing phase":
   - Phase selected
   - Issue noted in STATE.md with phase reference
   - When phase is planned, issue becomes a task/plan with `source_issue` reference
5. If "Create new phase":
   - Routes to `/kata:add-phase`
   - New phase created with issue context
   - Issue becomes plan source

### Flow 3: Issue Traceability in Plans (INTEG-03)

1. Plan created with `source_issue: github:#N` in frontmatter
2. When plan executed and PR created:
   - PR body includes "Closes #N"
   - GitHub auto-closes issue when PR merges
3. Plan SUMMARY.md includes issue reference for audit trail

## Open Questions

### Question 1: Issue Selection Scope

**What we know:** add-milestone can present backlog issues during milestone definition
**What's unclear:** Should selection affect:
- Just planning context (informational)
- Requirements generation (derive REQ-IDs from issues)
- Both

**Recommendation:** Start with informational (planning context). If users want requirements generation, add in follow-up. Less scope = faster ship.

### Question 2: Multiple Plans from One Issue

**What we know:** Large issues might need multiple plans
**What's unclear:** How to track when issue spans plans

**Recommendation:** Use `source_issue` for primary plan. Additional plans reference the same issue. PR for primary plan includes "Closes #N". Document pattern in planner agent.

### Question 3: Dedicated Skill vs Existing Skill Extension

**What we know:** INTEG-01 could be a new skill (`/kata:pull-issues-to-milestone`) or extend add-milestone
**What's unclear:** User preference for discovery (new skill name vs existing skill with new option)

**Recommendation:** Extend add-milestone. Users already associate milestone work with that skill. Adding a new skill fragments the mental model.

## Requirements Mapping

| Requirement | Implementation Strategy | Skill Modified | Confidence |
| ----------- | ----------------------- | -------------- | ---------- |
| INTEG-01 | Add issue selection step to add-milestone | add-milestone | HIGH |
| INTEG-02 | Complete "Link to existing phase" flow in check-issues | check-issues | HIGH |
| INTEG-03 | Add `source_issue` to PLAN.md, read in execute-phase | kata-planner, execute-phase | HIGH |

## Sources

### Primary (HIGH confidence)
- `skills/check-issues/SKILL.md` — Full skill analysis
- `skills/add-milestone/SKILL.md` — Full skill analysis
- `skills/execute-quick-task/SKILL.md` — Issue context patterns
- `agents/kata-planner.md` — PLAN.md format specification
- `.planning/ROADMAP.md` — Phase structure
- `.planning/REQUIREMENTS.md` — INTEG-01, INTEG-02, INTEG-03 definitions
- `.planning/issues/open/*.md` and `.planning/issues/in-progress/*.md` — Issue format examples

### Secondary (MEDIUM confidence)
- `.planning/phases/02-issue-execution-workflow/02-01-PLAN.md` — Recent plan example with issue context
- `.planning/phases/02-issue-execution-workflow/02-02-PLAN.md` — Planned mode implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All patterns verified from source files
- Architecture: HIGH — Builds on Phase 2's completed infrastructure
- Pitfalls: HIGH — Derived from analyzing existing code paths

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days, stable domain)
