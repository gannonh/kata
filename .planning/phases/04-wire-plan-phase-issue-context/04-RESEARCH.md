# Phase 4: Wire plan-phase to Issue Context - Research

**Researched:** 2026-02-02
**Domain:** Kata internal architecture (plan-phase to issue context wiring)
**Confidence:** HIGH

## Summary

This research investigates the gap identified in the v1.4.1 milestone audit: `plan-phase` does not read the issue context from STATE.md, causing the `source_issue` field to never be set in generated PLAN.md files. This breaks two critical flows:

1. **Planned Execution Flow**: Issues linked to phases via check-issues never have their `source_issue` field set in plans, meaning PRs don't auto-close source issues.
2. **Milestone Issue Scoping Flow**: Issues selected during add-milestone (stored in "Milestone Scope Issues" section) never inform planning.

The fix requires minimal changes to a single file (`skills/plan-phase/SKILL.md`) with ~50-80 lines of additional logic to:
1. Read STATE.md "Pending Issues" section
2. Read STATE.md "Milestone Scope Issues" section
3. Extract issues linked to the current phase
4. Pass issue context to kata-planner in the Task prompt

**Primary recommendation:** Add issue context extraction in Step 7 (Read Context Files) and include it in Step 8's Task prompt to kata-planner.

## Standard Stack

This phase modifies Kata internal files only. No external libraries needed.

### Core

| File | Purpose | Change Type |
| ---- | ------- | ----------- |
| `skills/plan-phase/SKILL.md` | Phase planning orchestrator | Primary modification target |
| `agents/kata-planner.md` | Planner agent (already has source_issue docs) | No change needed |
| `.planning/STATE.md` | Source of issue linkage data | Read only |

### Supporting

No new dependencies. Uses existing:
- Bash for parsing STATE.md sections
- Task tool for spawning kata-planner (already used)

### Alternatives Considered

| Alternative | Why Not |
| ----------- | ------- |
| Modify kata-planner to read STATE.md directly | Violates separation of concerns - orchestrator should gather context and pass it |
| Create new skill for issue-aware planning | Unnecessary duplication - plan-phase already handles planning |
| Store issue context in phase CONTEXT.md | Already have established pattern in STATE.md; adds complexity |

## Architecture Patterns

### Current Architecture

```
check-issues                    add-milestone
    |                               |
    v                               v
"Link to existing phase"       "Pull issues into scope"
    |                               |
    v                               v
STATE.md                        STATE.md
"### Pending Issues"            "### Milestone Scope Issues"
    |                               |
    X                               X
    |                               |
(plan-phase DOES NOT READ)      (plan-phase DOES NOT READ)
    |                               |
    v                               v
kata-planner                    kata-planner
(no issue context)              (no issue context)
    |                               |
    v                               v
PLAN.md                         PLAN.md
source_issue: ""                source_issue: ""
```

### Target Architecture

```
check-issues                    add-milestone
    |                               |
    v                               v
"Link to existing phase"       "Pull issues into scope"
    |                               |
    v                               v
STATE.md                        STATE.md
"### Pending Issues"            "### Milestone Scope Issues"
    |                               |
    +---------------+---------------+
                    |
                    v
            plan-phase (Step 7)
            Extract linked issues
                    |
                    v
            plan-phase (Step 8)
            Pass issue context to Task prompt
                    |
                    v
            kata-planner
            (receives issue context)
                    |
                    v
            PLAN.md
            source_issue: github:#N
```

### Pattern 1: STATE.md Section Parsing

**What:** Parse STATE.md to extract issues linked to the current phase

**When to use:** Step 7 of plan-phase, after reading base context files

**Example:**

```bash
# Extract issues linked to current phase from STATE.md
PHASE_DIR_NAME=$(basename "$PHASE_DIR")  # e.g., "04-wire-plan-phase-issue-context"
PHASE_NUM=$(echo "$PHASE_DIR_NAME" | grep -oE '^[0-9]+')  # e.g., "04"

# Check Pending Issues section
PENDING_ISSUES=$(awk '
  /^### Pending Issues/{found=1; next}
  /^###/{found=0}
  found && /→ Phase '"${PHASE_NUM}"'-|→ Phase '"${PHASE_DIR_NAME}"'/ {print}
' .planning/STATE.md 2>/dev/null)

# Check Milestone Scope Issues section
SCOPE_ISSUES=$(awk '
  /^### Milestone Scope Issues/{found=1; next}
  /^###/{found=0}
  found && /→ Phase '"${PHASE_NUM}"'-|→ Phase '"${PHASE_DIR_NAME}"'/ {print}
' .planning/STATE.md 2>/dev/null)
```

### Pattern 2: Issue Context in Task Prompt

**What:** Include issue context in planner prompt so it can set source_issue

**When to use:** Step 8 when spawning kata-planner

**Example:**

```markdown
**Linked Issues (if any):**
{linked_issues_content}

Note: For plans created from linked issues, set `source_issue:` in frontmatter.
- For GitHub issues: `source_issue: github:#N`
- For local issues: `source_issue: [file path]`
```

### Anti-Patterns to Avoid

- **Don't have planner read STATE.md directly:** Orchestrator gathers context, planner receives it
- **Don't create duplicate issue tracking:** Use existing STATE.md sections
- **Don't modify issue file format:** Leverage existing `provenance:` and `linked_phase:` fields

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Issue reference extraction | Custom parsing | Existing STATE.md format | Format already defined in check-issues |
| GitHub issue number parsing | New regex patterns | Existing `github:#N` format | Already established in provenance field |
| Phase matching | New phase identification | Existing phase directory pattern | `PHASE_DIR_NAME` already normalized |

**Key insight:** All the data structures and formats already exist. This is purely a wiring task, not a design task.

## Common Pitfalls

### Pitfall 1: Partial Section Match

**What goes wrong:** Matching issues from wrong section due to imprecise parsing
**Why it happens:** STATE.md has multiple "Issues" sections with similar structure
**How to avoid:** Use explicit section header matching (`/^### Pending Issues/`) with bounds checking (`/^###/` to stop)
**Warning signs:** Issues from wrong phase appearing in plans

### Pitfall 2: Phase Name vs Phase Number Matching

**What goes wrong:** Missing issues due to inconsistent phase reference format
**Why it happens:** STATE.md may use "Phase 04-name" or "Phase 04" interchangeably
**How to avoid:** Match both patterns: `→ Phase ${PHASE_NUM}-` AND `→ Phase ${PHASE_DIR_NAME}`
**Warning signs:** Linked issues not appearing in planner context

### Pitfall 3: Empty Issue Context Handling

**What goes wrong:** Planner receives malformed prompt when no issues linked
**Why it happens:** Not checking for empty results before including in prompt
**How to avoid:** Only add issue context section to prompt if LINKED_ISSUES is non-empty
**Warning signs:** "Linked Issues: " section with empty content in prompt

### Pitfall 4: Breaking Existing Flow

**What goes wrong:** Plans without linked issues fail to generate
**Why it happens:** Adding required issue context when most phases have none
**How to avoid:** Issue context is OPTIONAL - absence should not change existing behavior
**Warning signs:** Regression in standard phase planning

## Code Examples

### Example 1: Extract Linked Issues from STATE.md

```bash
# In Step 7 of plan-phase, after reading base context files

# Normalize phase identifier
PHASE_DIR_NAME=$(basename "$PHASE_DIR")
PHASE_NUM=$(echo "$PHASE_DIR_NAME" | grep -oE '^[0-9.]+')

# Extract linked issues from both sections
LINKED_ISSUES=""

# Check Pending Issues (from check-issues "Link to existing phase")
if grep -q "^### Pending Issues" .planning/STATE.md 2>/dev/null; then
  PENDING=$(awk '
    /^### Pending Issues/{found=1; next}
    /^### |^## /{if(found) exit}
    found && /→ Phase/ {
      # Match phase number or full phase dir name
      if ($0 ~ /→ Phase '"${PHASE_NUM}"'-/ || $0 ~ /→ Phase '"${PHASE_DIR_NAME}"'/) {
        print
      }
    }
  ' .planning/STATE.md)
  [ -n "$PENDING" ] && LINKED_ISSUES="${PENDING}"
fi

# Check Milestone Scope Issues (from add-milestone issue selection)
if grep -q "^### Milestone Scope Issues" .planning/STATE.md 2>/dev/null; then
  SCOPE=$(awk '
    /^### Milestone Scope Issues/{found=1; next}
    /^### |^## /{if(found) exit}
    found && /→ Phase/ {
      if ($0 ~ /→ Phase '"${PHASE_NUM}"'-/ || $0 ~ /→ Phase '"${PHASE_DIR_NAME}"'/) {
        print
      }
    }
  ' .planning/STATE.md)
  [ -n "$SCOPE" ] && LINKED_ISSUES="${LINKED_ISSUES}${SCOPE}"
fi
```

### Example 2: Include Issue Context in Planner Prompt

```markdown
# In Step 8, modify the Task prompt to include issue context

<planning_context>

**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:**
{state_content}

**Roadmap:**
{roadmap_content}

**Requirements (if exists):**
{requirements_content}

**Phase Context (if exists):**
{context_content}

**Research (if exists):**
{research_content}

**Linked Issues:**
{linked_issues_content}

Note: If linked issues exist, set `source_issue:` in plan frontmatter:
- GitHub issues: `source_issue: github:#N`
- Local issues: `source_issue: [path]`

</planning_context>
```

### Example 3: Conditional Issue Context Inclusion

```bash
# Build issue context section for prompt (only if issues linked)
ISSUE_CONTEXT_SECTION=""
if [ -n "$LINKED_ISSUES" ]; then
  ISSUE_CONTEXT_SECTION="
**Linked Issues:**
${LINKED_ISSUES}

Note: Set \`source_issue:\` in plan frontmatter for traceability:
- GitHub issues: \`source_issue: github:#N\` (extract from provenance field)
- Local issues: \`source_issue: [file path]\`
"
fi
```

## State of the Art

| Aspect | Current State | After This Phase |
| ------ | ------------- | ---------------- |
| plan-phase reads STATE.md | Yes (basic state) | Yes (+ issue sections) |
| Issue context in planner prompt | No | Yes (when linked) |
| source_issue in generated plans | Never set | Set when issues linked |
| Planned execution flow | Broken | Working |
| Milestone scope flow | Broken | Working |

**No deprecated patterns:** This phase adds missing wiring, doesn't change existing patterns.

## Open Questions

None. The audit clearly identifies the gap, the existing patterns are well-established, and the fix is straightforward.

## Sources

### Primary (HIGH confidence)

- `skills/plan-phase/SKILL.md` - Current implementation showing exactly where to add issue reading
- `skills/check-issues/SKILL.md` - Lines 423-549 showing how issues are linked to phases
- `skills/add-milestone/SKILL.md` - Lines 483-555 showing milestone scope issue selection
- `agents/kata-planner.md` - Lines 489-512 documenting source_issue frontmatter field
- `.planning/v1.4.1-MILESTONE-AUDIT.md` - Lines 116-178 detailing the exact gap

### Secondary (MEDIUM confidence)

- Phase 3 artifacts (`03-RESEARCH.md`, `03-VERIFICATION.md`) - Document the intended source_issue behavior

### Tertiary (LOW confidence)

None - this is purely internal Kata architecture with complete documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Modifying single known file with established patterns
- Architecture: HIGH - Adding wiring between existing components
- Pitfalls: HIGH - Based on actual codebase examination and audit findings

**Research date:** 2026-02-02
**Valid until:** N/A (internal architecture, not external dependencies)
