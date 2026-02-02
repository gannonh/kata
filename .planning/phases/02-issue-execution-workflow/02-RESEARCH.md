# Phase 2: Issue Execution Workflow - Research

**Researched:** 2026-02-02
**Domain:** Issue execution modes, quick task integration, PR workflow, roadmap integration
**Confidence:** HIGH

## Summary

This phase implements the structured execution path for working on issues. Currently, `/kata:check-issues` offers "Work on it now" which moves an issue to in-progress but provides no further guidance. This phase adds two execution modes:

1. **Quick Task Mode**: For small, self-contained issues. Creates a plan in `.planning/quick/`, executes with commits, creates PR with `Closes #X`.

2. **Planned Mode**: For issues requiring fuller treatment. Links the issue to a new phase (via `/kata:add-phase`) or an existing phase (as a task/plan reference).

The implementation extends the existing `check-issues` skill with mode selection, and enhances `execute-quick-task` skill to accept an issue reference. The PR closure pattern is already documented in Phase 1's `milestone-complete.md` reference.

**Primary recommendation:** Modify `check-issues` "Work on it now" to branch into quick vs planned mode selection. Quick mode spawns `execute-quick-task` with issue context. Planned mode routes to phase creation or existing phase linking.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| gh CLI | 2.x+ | GitHub API operations | Already used throughout Kata for issue/PR operations |
| jq | 1.6+ | JSON parsing | Standard shell JSON manipulation, used in existing skills |

### Supporting
| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| Task tool | Claude | Subagent orchestration | Spawn kata-planner, kata-executor for quick task execution |

### Alternatives Considered
None - all required infrastructure already exists in Kata.

**Installation:**
No additional installation required. All dependencies are already present.

## Architecture Patterns

### Current Issue Execution Flow (Needs Enhancement)

```
skills/check-issues/SKILL.md
├── Step "offer_actions"
│   └── "Work on it now" → moves issue to in-progress
│       └── MISSING: execution mode selection
│       └── MISSING: PR creation with Closes #X
│
└── Step "execute_action"
    └── "Work on it now" → mv to in-progress, done
        └── MISSING: spawn planner/executor
        └── MISSING: create branch/PR
```

### Pattern 1: Mode Selection at "Work on it now"

**What:** When user selects "Work on it now", present mode selection
**When to use:** All issue executions
**Example flow:**
```
User: /kata:check-issues
→ [Select issue]
→ "Work on it now"
→ AskUserQuestion:
   - "Quick task (small, self-contained)"
   - "Planned (needs research or fits a phase)"
→ Route to appropriate flow
```

### Pattern 2: Quick Task with Issue Context

**What:** Execute issue via quick task workflow with issue metadata
**When to use:** Small, self-contained issues (e.g., bug fixes, minor features)
**Example:**
```bash
# Quick task directory: .planning/quick/NNN-issue-slug/
# Plan receives issue context:
# - Issue title becomes task description
# - Issue problem/solution sections inform plan
# - Issue number stored for PR closure

QUICK_DIR=".planning/quick/${next_num}-${slug}"
ISSUE_NUMBER=$(echo "$PROVENANCE" | grep -oE '#[0-9]+' | tr -d '#')
```

### Pattern 3: Planned Execution with Phase Linking

**What:** Link issue to roadmap phase for fuller treatment
**When to use:** Issues requiring research, multiple plans, or integration with existing phases
**Options:**
1. Create new phase from issue (`/kata:add-phase` with issue context)
2. Link to existing phase (reference issue in phase plans)

### Anti-Patterns to Avoid

- **No mode auto-detection:** Let user choose; heuristics are brittle
- **Duplicate PR creation logic:** Reuse pattern from `execute-quick-task` enhancement
- **Breaking issue lifecycle:** Maintain existing open → in-progress → closed flow

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Quick task execution | Custom execution loop | `execute-quick-task` skill | Already has planner/executor spawning, commits, STATE.md tracking |
| PR creation | Direct gh pr create | PR workflow pattern from `execute-phase` | Handles branch naming, draft PR, `Closes #X` |
| Issue lookup | Parse local files only | `gh issue view` + local file | GitHub is source of truth, local has provenance link |
| Branch naming | Custom scheme | Reuse `execute-phase` pattern | Consistent: `{type}/vM.M.M-quick-NNN-slug` |

**Key insight:** The `execute-quick-task` skill already does 90% of what's needed. Enhancement is adding issue context and PR creation, not building a parallel system.

## Common Pitfalls

### Pitfall 1: Lost Issue Reference

**What goes wrong:** Issue executed but PR doesn't close it
**Why it happens:** Issue number not passed through execution chain
**How to avoid:** Store issue number at mode selection, thread through planner → executor → PR creation
```bash
# At mode selection
ISSUE_NUMBER=$(echo "$PROVENANCE" | grep -oE '#[0-9]+' | tr -d '#')
# Pass to planner context
# Include in PR body
```
**Warning signs:** Issue remains open after PR merge

### Pitfall 2: Branch Collision with Quick Tasks

**What goes wrong:** Quick task branch conflicts with existing branch
**Why it happens:** Quick task NNN may collide across sessions
**How to avoid:** Include date or unique identifier in branch name
```bash
BRANCH="fix/quick-${next_num}-${slug}"
# Or include version: fix/v${VERSION}-quick-${next_num}-${slug}
```
**Warning signs:** `git checkout -b` fails

### Pitfall 3: Mode Selection Interrupts Flow

**What goes wrong:** User has to make decision before seeing issue context
**Why it happens:** Mode selection presented before issue details
**How to avoid:** Current `check-issues` already loads issue context before actions. Mode selection is PART of actions, not before.
**Warning signs:** User confusion about which mode to choose

### Pitfall 4: Planned Mode Creates Orphan Phase

**What goes wrong:** Phase created from issue but issue not linked back
**Why it happens:** One-way reference (phase → issue) but not (issue → phase)
**How to avoid:** For "Create new phase":
1. Issue gets updated with phase reference in description
2. Phase PLAN.md includes issue reference in frontmatter
```markdown
---
source_issue: github:owner/repo#N
---
```
**Warning signs:** Issue closed by PR but no way to trace which phase

### Pitfall 5: PR Workflow Disabled but Quick Task Expects It

**What goes wrong:** Quick task tries to create PR but `pr_workflow=false`
**Why it happens:** Quick task assumes PR creation always happens
**How to avoid:** Check `pr_workflow` config; if false, skip PR creation but still close issue via `gh issue close`
```bash
if [ "$PR_WORKFLOW" = "true" ]; then
  # Create PR with Closes #X
else
  # Direct issue closure after commits
  gh issue close "$ISSUE_NUMBER" --comment "Completed via quick task"
fi
```
**Warning signs:** Issue remains open when pr_workflow=false

## Code Examples

Verified patterns from official sources:

### Mode Selection at "Work on it now"
```markdown
# Source: Pattern derived from check-issues skill action flow

Use AskUserQuestion:
- header: "Execution Mode"
- question: "How would you like to work on this issue?"
- options:
  - "Quick task" — Small fix, execute now with commits + PR
  - "Planned" — Create phase or link to existing phase
  - "Put it back" — Return to issue list
```

### Quick Task with Issue Context
```bash
# Source: Pattern from execute-quick-task skill + issue context

# Extract issue number from provenance
PROVENANCE=$(grep "^provenance:" "$ISSUE_FILE" | cut -d' ' -f2)
ISSUE_NUMBER=""
if echo "$PROVENANCE" | grep -q "^github:"; then
  ISSUE_NUMBER=$(echo "$PROVENANCE" | grep -oE '#[0-9]+' | tr -d '#')
fi

# Extract issue title and description
ISSUE_TITLE=$(grep "^title:" "$ISSUE_FILE" | cut -d':' -f2- | xargs)
ISSUE_PROBLEM=$(sed -n '/^## Problem/,/^## /p' "$ISSUE_FILE" | tail -n +2 | head -n -1)

# Pass to planner
DESCRIPTION="${ISSUE_TITLE}"
CONTEXT="From issue #${ISSUE_NUMBER}:\n\n${ISSUE_PROBLEM}"
```

### PR Creation with Issue Closure
```bash
# Source: Pattern from milestone-complete.md reference + execute-phase skill

# Build PR body with Closes line
CLOSES_LINE=""
if [ -n "$ISSUE_NUMBER" ]; then
  CLOSES_LINE="Closes #${ISSUE_NUMBER}"
fi

cat > /tmp/pr-body.md << PR_EOF
## Summary

Completes issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

## Changes

${CHANGES_SUMMARY}

${CLOSES_LINE}
PR_EOF

# Create PR (if pr_workflow enabled)
if [ "$PR_WORKFLOW" = "true" ]; then
  git push -u origin "$BRANCH"
  gh pr create \
    --title "fix: ${ISSUE_TITLE}" \
    --body-file /tmp/pr-body.md
fi
```

### Planned Mode - Create New Phase
```bash
# Source: Pattern from add-phase skill + issue linking

# Route to add-phase with issue context
# Issue description becomes phase goal
# Issue number stored for traceability

echo "Creating new phase from issue #${ISSUE_NUMBER}..."
echo ""
echo "Use: /kata:add-phase ${ISSUE_TITLE}"
echo ""
echo "The phase will be linked to issue #${ISSUE_NUMBER}"
echo "Issue will be closed when the phase PR merges."
```

### Planned Mode - Link to Existing Phase
```bash
# Source: Pattern for roadmap integration

# Find phases that might relate to this issue
# Check phase goals and affected files
MATCHING_PHASES=$(grep -l "${ISSUE_AREA}" .planning/phases/*/PLAN.md 2>/dev/null | head -3)

# Present as options
echo "This issue could fit in an existing phase:"
for phase in $MATCHING_PHASES; do
  phase_name=$(basename $(dirname "$phase"))
  echo "- ${phase_name}"
done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Manual issue tracking | `/kata:check-issues` | v1.4.0 | Unified issue lifecycle |
| Separate quick task flow | Integrated with issues | v1.4.1 (this phase) | Issues can be executed directly |
| No issue→PR linking | `Closes #X` in PR body | v1.4.1 Phase 1 | Automatic issue closure |

**Deprecated/outdated:**
- `todos` vocabulary (deprecated in v1.4.0, migrated to `issues`)

## Implementation Approach

### Requirement Mapping

| Requirement | Implementation | Effort |
| ----------- | -------------- | ------ |
| EXEC-01 | Modify `check-issues` "Work on it now" to present mode selection | Small (~30 LOC) |
| EXEC-02 | Enhance `execute-quick-task` with issue context + PR creation | Medium (~100 LOC) |
| EXEC-03 | Add "Create new phase" and "Link to existing phase" actions | Small (~50 LOC) |

### Task Breakdown Suggestion

1. **Mode Selection (EXEC-01)** - Add AskUserQuestion branch in `check-issues` "Work on it now" action
2. **Quick Task Enhancement (EXEC-02)** - Modify `execute-quick-task` to:
   - Accept issue file path parameter
   - Extract issue metadata for planner context
   - Create PR with `Closes #X` after execution
3. **Planned Mode Routing (EXEC-03)** - Add "Create new phase" and "Link to existing" options:
   - Route to `/kata:add-phase` with issue context
   - Or update issue with phase reference

### Integration Points

1. **check-issues ↔ execute-quick-task**: Pass issue file path
2. **execute-quick-task ↔ PR workflow**: Reuse `execute-phase` branch/PR patterns
3. **check-issues ↔ add-phase**: Route with issue context
4. **Issue ↔ Phase**: Bidirectional reference (issue provenance ↔ plan source_issue)

## Open Questions

Things that couldn't be fully resolved:

1. **Quick task branch naming convention**
   - What we know: Phase execution uses `{type}/v{milestone}-{phase}-{slug}`
   - What's unclear: Should quick tasks follow same pattern or simpler?
   - Recommendation: Use `fix/quick-{NNN}-{slug}` for simplicity; no milestone context needed

2. **PR workflow disabled behavior**
   - What we know: `pr_workflow=false` skips PR creation in `execute-phase`
   - What's unclear: Should quick task still close issue when pr_workflow=false?
   - Recommendation: Yes, close issue directly with `gh issue close` + comment

3. **Planned mode: issue disposition**
   - What we know: Issue should remain open until phase completes
   - What's unclear: Should issue be moved to in-progress when linked to phase?
   - Recommendation: Keep in open; phase tracking is separate from issue lifecycle

## Sources

### Primary (HIGH confidence)
- `skills/check-issues/SKILL.md` - Current issue lifecycle and actions
- `skills/execute-quick-task/SKILL.md` - Quick task planner/executor spawning
- `skills/execute-phase/SKILL.md` - PR workflow patterns (branch, draft PR, Closes #X)
- `skills/complete-milestone/references/milestone-complete.md` - Issue execution PR pattern (CLOSE-03)

### Secondary (MEDIUM confidence)
- `.planning/phases/01-pr-issue-closure/01-RESEARCH.md` - Phase 1 research (PR closure patterns)
- `agents/kata-executor.md` - Executor agent (commit protocols, summary creation)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure already exists in Kata
- Architecture: HIGH - Patterns verified from existing skills
- Pitfalls: HIGH - Based on existing codebase patterns and identified edge cases

**Research date:** 2026-02-02
**Valid until:** Indefinite - Patterns are internal to Kata, not dependent on external APIs
