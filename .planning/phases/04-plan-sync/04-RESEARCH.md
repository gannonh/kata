# Phase 4: Plan Sync - Research

**Researched:** 2026-01-26
**Domain:** GitHub API (Issue body updates), gh CLI, Kata workflow integration
**Confidence:** HIGH

## Summary

This research documents how to implement plan checklist synchronization between Kata phase planning/execution and GitHub Issues. The gh CLI provides straightforward commands for reading issue bodies (`gh issue view --json body`) and updating them (`gh issue edit --body-file`). The key challenge is reliable parsing and updating of markdown checklists within issue bodies.

Phase 4 has two integration points:
1. **kata-planning-phases** — After plans are created, update the phase issue's "## Plans" section with a checklist of plan names
2. **kata-executor** (via kata-executing-phases) — After each plan completes, update the checklist item from `- [ ]` to `- [x]`

**Primary recommendation:** Add conditional GitHub logic to both skills that: (1) reads the current issue body, (2) manipulates the Plans section programmatically, and (3) writes the updated body using `--body-file` for special character safety. All operations are non-blocking (failures warn but don't stop execution).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Tool | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| gh CLI | 2.x | GitHub API interactions | Already used for milestone/issue creation |
| jq | 1.6+ | JSON parsing for issue body | Standard for extracting fields from API responses |
| sed/awk | any | Markdown manipulation | Reliable for checklist pattern matching |

### Supporting
| Tool | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| grep | any | Config parsing, pattern matching | Already used in Kata for config.json reading |
| cat | any | File concatenation | Building issue bodies with heredocs |
| mktemp | any | Safe temp file creation | Alternative to /tmp for body files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| `gh issue edit --body` | `gh issue edit --body-file` | `--body-file` handles special characters safely |
| sed for checklist update | Full body replacement | sed is simpler; replacement avoids position errors |
| In-place sed edit | Read-modify-write pattern | R-M-W is more reliable for complex bodies |

**Installation:**
No new dependencies - gh CLI, jq, sed, awk already available in Kata environments.

## Architecture Patterns

### Integration Points

**Integration Point 1: kata-planning-phases (add plan checklist)**

After planner creates PLAN.md files:
1. Check `github.enabled` and `github.issueMode`
2. Find phase issue number
3. Read current issue body
4. Replace Plans section placeholder with actual checklist
5. Write updated body

**Integration Point 2: kata-executor (check off completed plans)**

After each plan completes (in `<final_commit>` step):
1. Check `github.enabled` config
2. Find phase issue number
3. Read current issue body
4. Find matching plan checkbox
5. Change `- [ ]` to `- [x]`
6. Write updated body

### Recommended Flow for Planning (kata-planning-phases, after step 13)

```
## Step 14: Update GitHub Issue with Plan Checklist (if enabled)

Check github.enabled:
```bash
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**If `GITHUB_ENABLED=false`:** Skip to completion.

**If `GITHUB_ENABLED=true`:**

1. Parse milestone version from current phase directory
2. Find phase issue number
3. Read current issue body
4. Build plan checklist from PLAN.md files
5. Update issue body with checklist
```

### Recommended Flow for Execution (kata-executor, in final_commit step)

```
After SUMMARY.md created, before final commit:

Check github.enabled:
```bash
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**If `GITHUB_ENABLED=false`:** Skip GitHub update.

**If `GITHUB_ENABLED=true`:**

1. Parse phase and plan info from plan path
2. Find phase issue number
3. Read current issue body
4. Update checklist item to checked
5. Write updated body
```

### Issue Body Update Pattern

**Read-Modify-Write with temp files:**

```bash
# 1. Read current body
ISSUE_BODY=$(gh issue view $ISSUE_NUMBER --json body --jq '.body')

# 2. Modify body (example: add plan checklist)
NEW_BODY=$(echo "$ISSUE_BODY" | sed '/^## Plans$/,/^## /{
  /^## Plans$/a\
\
- [ ] Plan 01: Initialize database schema\
- [ ] Plan 02: Create API endpoints
  /^_Plans will be added/d
}')

# 3. Write to temp file (handles special chars safely)
echo "$NEW_BODY" > /tmp/issue-body-update.md

# 4. Update issue
gh issue edit $ISSUE_NUMBER --body-file /tmp/issue-body-update.md
```

### Checklist Update Pattern

**Toggle checkbox from unchecked to checked:**

```bash
# Find plan identifier in body and update checkbox
# Plan identifier format: "Plan 01:", "Plan 02:", etc.

PLAN_IDENTIFIER="Plan ${PLAN_NUM}:"

# Update the specific line
NEW_BODY=$(echo "$ISSUE_BODY" | sed "s/^- \[ \] ${PLAN_IDENTIFIER}/- [x] ${PLAN_IDENTIFIER}/")
```

### Anti-Patterns to Avoid

- **Using `--body` flag directly:** Special characters in plan names or descriptions can break the command. Always use `--body-file`.
- **Not checking issue exists:** Always verify phase issue exists before attempting updates.
- **Ignoring issueMode:** If `issueMode=never`, no issue exists to update.
- **Partial body updates:** GitHub doesn't support partial updates; must replace entire body.
- **Race conditions:** If multiple executors run in parallel (same wave), they could overwrite each other's checklist updates. Mitigate by updating issue body per-wave, not per-plan.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Issue body reading | Custom API calls | `gh issue view --json body --jq '.body'` | Handles auth, pagination |
| Issue body writing | `--body` with escaping | `--body-file` with temp file | Special character safety |
| Checklist parsing | Custom regex engine | sed with simple patterns | Reliable, well-tested |
| Phase issue lookup | Title search with API | `gh issue list --label "phase" --milestone --jq` | Efficient filtering |

**Key insight:** The gh CLI handles authentication, rate limiting, and API versioning. Building custom HTTP calls would require reimplementing all of this.

## Common Pitfalls

### Pitfall 1: Race Condition in Parallel Wave Execution
**What goes wrong:** Multiple executors in same wave update issue simultaneously, overwriting each other
**Why it happens:** Each executor reads body, modifies, writes back; interleaving causes lost updates
**How to avoid:**
- Option A: Update issue once per wave (after all plans in wave complete), not per-plan
- Option B: Use atomic read-modify-write in orchestrator only (kata-executing-phases), not in executor
**Warning signs:** Plan checkboxes missing after execution completes; inconsistent checklist state

**Recommended approach:** Option B - The orchestrator (`kata-executing-phases`) should update the issue after each wave completes, not the individual executor agents. This ensures sequential updates.

### Pitfall 2: Placeholder Not Found
**What goes wrong:** sed fails to find "## Plans" section or placeholder text
**Why it happens:** Issue body format changed, or issue created before Phase 3 implementation
**How to avoid:** Check for section existence before sed; if missing, append section
**Warning signs:** Issue body unchanged after planning; sed returns without error but no modification

```bash
# Check if Plans section exists
if ! echo "$ISSUE_BODY" | grep -q "^## Plans"; then
  # Append Plans section
  NEW_BODY="${ISSUE_BODY}

## Plans

${PLAN_CHECKLIST}"
else
  # Update existing section
  # ... sed command ...
fi
```

### Pitfall 3: Issue Number Lookup Fails
**What goes wrong:** Can't find phase issue number, update silently skipped
**Why it happens:** issueMode=never (no issue created), milestone name mismatch, label missing
**How to avoid:** Pre-check all conditions; warn explicitly if issue not found
**Warning signs:** "Warning: Could not find phase issue" message (acceptable), or silent skip (bad)

### Pitfall 4: Decimal Phase Numbers in Issue Title
**What goes wrong:** Phase 2.1 doesn't match "Phase 2:" pattern
**Why it happens:** Inserted phases use decimal notation (2.1, 2.2)
**How to avoid:** Use flexible pattern: `startswith("Phase ${PHASE_NUM}:")` where PHASE_NUM includes decimals
**Warning signs:** Inserted phase issues never updated

### Pitfall 5: Special Characters in Plan Names
**What goes wrong:** Plan name contains `$`, backticks, quotes that break sed or shell
**Why it happens:** Plan names derived from feature descriptions, may contain punctuation
**How to avoid:**
- Use single-quoted heredocs for body construction
- Escape special chars in plan names before sed
- Use `--body-file` always (already recommended)
**Warning signs:** Garbled checklist items, sed errors, truncated plan names

## Code Examples

Verified patterns from gh CLI documentation and Kata codebase:

### Finding Phase Issue Number
```bash
# Source: gh issue list --help, Kata conventions

# Get milestone version from STATE.md or ROADMAP.md
VERSION=$(grep "Current Milestone" .planning/PROJECT.md | sed 's/.*v//' | cut -d' ' -f1)

# Or from phase directory path: .planning/phases/04-plan-sync -> look up in ROADMAP
PHASE_NUM=$(echo "$PHASE_DIR" | sed -E 's/.*\/([0-9.]+)-.*/\1/')

# Find phase issue
ISSUE_NUMBER=$(gh issue list \
  --label "phase" \
  --milestone "v${VERSION}" \
  --json number,title \
  --jq ".[] | select(.title | startswith(\"Phase ${PHASE_NUM}:\")) | .number" \
  2>/dev/null)

if [ -z "$ISSUE_NUMBER" ]; then
  echo "Warning: Could not find GitHub Issue for Phase ${PHASE_NUM}. Skipping update."
  # Continue without GitHub update (non-blocking)
fi
```

### Reading Issue Body
```bash
# Source: gh issue view --help

ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body' 2>/dev/null)

if [ -z "$ISSUE_BODY" ]; then
  echo "Warning: Could not read issue #${ISSUE_NUMBER} body. Skipping update."
fi
```

### Building Plan Checklist from PLAN.md Files
```bash
# Source: Kata plan naming conventions

# List all plans in phase directory
PLAN_FILES=$(ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null | sort)

# Build checklist
PLAN_CHECKLIST=""
for plan_file in $PLAN_FILES; do
  # Extract plan number and name from frontmatter or filename
  PLAN_NUM=$(basename "$plan_file" | sed -E 's/.*-([0-9]+)-PLAN\.md/\1/')

  # Try to get name from plan objective (first line of <objective>)
  PLAN_NAME=$(grep -A1 "<objective>" "$plan_file" | tail -1 | sed 's/^ *//' | head -c 60)

  # Fallback: use filename-derived name
  if [ -z "$PLAN_NAME" ]; then
    PLAN_NAME=$(basename "$plan_file" .md | sed 's/-PLAN$//' | sed 's/-/ /g')
  fi

  PLAN_CHECKLIST="${PLAN_CHECKLIST}- [ ] Plan ${PLAN_NUM}: ${PLAN_NAME}
"
done
```

### Updating Issue with Plan Checklist (kata-planning-phases)
```bash
# Source: gh issue edit --help, Phase 3 patterns

# Replace placeholder with actual checklist
# The placeholder is: "_Plans will be added after phase planning completes._"

NEW_BODY=$(echo "$ISSUE_BODY" | sed '/^_Plans will be added/d')

# Find the Plans section and append checklist
# Using awk for multiline manipulation
NEW_BODY=$(echo "$NEW_BODY" | awk -v checklist="$PLAN_CHECKLIST" '
  /^## Plans$/ { print; print ""; print checklist; next }
  { print }
')

# Write to temp file
cat > /tmp/phase-issue-body.md << 'BODY_EOF'
$NEW_BODY
BODY_EOF

# Alternative: direct heredoc (safer for variable expansion)
printf '%s\n' "$NEW_BODY" > /tmp/phase-issue-body.md

# Update issue
gh issue edit "$ISSUE_NUMBER" --body-file /tmp/phase-issue-body.md 2>/dev/null \
  && echo "Updated Phase ${PHASE_NUM} issue with ${PLAN_COUNT} plans" \
  || echo "Warning: Failed to update issue #${ISSUE_NUMBER}"
```

### Checking Off Completed Plan (kata-executor)
```bash
# Source: sed documentation, GitHub checklist syntax

# PLAN_IDENTIFIER derived from plan file: "Plan 01:", "Plan 02:", etc.
PLAN_IDENTIFIER="Plan $(printf "%02d" $PLAN_NUMBER):"

# Escape any special regex characters in plan identifier
ESCAPED_ID=$(echo "$PLAN_IDENTIFIER" | sed 's/[[\.*^$()+?{|]/\\&/g')

# Update checkbox: - [ ] -> - [x]
NEW_BODY=$(echo "$ISSUE_BODY" | sed "s/^- \[ \] ${ESCAPED_ID}/- [x] ${ESCAPED_ID}/")

# Write and update
printf '%s\n' "$NEW_BODY" > /tmp/phase-issue-body.md
gh issue edit "$ISSUE_NUMBER" --body-file /tmp/phase-issue-body.md 2>/dev/null \
  && echo "Checked off ${PLAN_IDENTIFIER} in issue #${ISSUE_NUMBER}" \
  || echo "Warning: Failed to update issue #${ISSUE_NUMBER}"
```

### Full Config Guard Pattern
```bash
# Pattern used throughout Kata for GitHub guards

# Check github.enabled
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")

if [ "$GITHUB_ENABLED" != "true" ]; then
  # Skip GitHub operations silently (user opted out)
  return 0  # or just continue to next step
fi

# Check if issue mode allows issues
ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "auto")

if [ "$ISSUE_MODE" = "never" ]; then
  # No issues created, so no issue to update
  return 0
fi

# Verify GitHub remote exists
if ! git remote -v 2>/dev/null | grep -q 'github\.com'; then
  echo "Warning: No GitHub remote found. Skipping issue update."
  return 0
fi

# Verify gh authenticated
if ! gh auth status &>/dev/null; then
  echo "Warning: gh CLI not authenticated. Skipping issue update."
  return 0
fi

# All guards passed - proceed with GitHub operation
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| REST API for issue updates | gh CLI wraps API | 2020 | Simpler auth, better error handling |
| GraphQL mutations | REST via gh (sufficient for CRUD) | Ongoing | GraphQL only needed for complex queries |
| Manual body escaping | `--body-file` flag | gh 2.0 | Special characters handled automatically |

**Deprecated/outdated:**
- Hub CLI: Replaced by gh CLI (2020)
- `gh issue edit --body` without file: Still works but risky for special chars

## Testing Strategy

### Unit Testing Approach

1. **Mock gh CLI responses:**
   - Create fixture files with sample issue bodies
   - Test sed/awk transformations independently
   - Verify checklist patterns match expected output

2. **Integration testing without hitting GitHub:**
   - Use `GH_TOKEN=""` to disable API calls
   - Check that guards correctly skip operations
   - Verify warning messages appear

3. **E2E testing with GitHub (manual):**
   - Create test milestone and issues
   - Run planning flow, verify checklist appears
   - Run execution flow, verify checkboxes toggle

### Test Cases for Checklist Manipulation

```bash
# Test: Add checklist to issue body
INPUT_BODY="## Plans

_Plans will be added after phase planning completes._

---"

EXPECTED="## Plans

- [ ] Plan 01: Initialize schema
- [ ] Plan 02: Create endpoints

---"

# Test: Check off plan
INPUT_BODY="## Plans

- [ ] Plan 01: Initialize schema
- [x] Plan 02: Create endpoints

---"

EXPECTED="## Plans

- [x] Plan 01: Initialize schema
- [x] Plan 02: Create endpoints

---"
```

## Open Questions

Things that couldn't be fully resolved:

1. **Wave-level vs plan-level updates**
   - What we know: Parallel executors can race condition
   - What's unclear: Should orchestrator update after each wave, or should executors coordinate?
   - Recommendation: Orchestrator updates after each wave (sequential, no races)

2. **Issue body format versioning**
   - What we know: Issue body format defined in Phase 3
   - What's unclear: How to handle issues created before Phase 3?
   - Recommendation: Check for Plans section; if missing, append it; if format differs, best-effort update

3. **Rollback on execution failure**
   - What we know: If executor fails, checkbox might be checked prematurely
   - What's unclear: Should we uncheck on failure?
   - Recommendation: Don't update checkbox until SUMMARY.md exists (proven completion)

## Sources

### Primary (HIGH confidence)
- gh CLI help output (`gh issue edit --help`, `gh issue view --help`) - verified 2026-01-26
- Kata codebase: `skills/kata-adding-milestones/SKILL.md` - existing issue creation pattern (Phase 9.5)
- Kata codebase: `skills/kata-executing-phases/SKILL.md` - executor workflow
- Kata codebase: `agents/kata-executor.md` - plan completion flow

### Secondary (MEDIUM confidence)
- Kata codebase: `skills/kata-adding-milestones/references/github-mapping.md` - issue body template
- Kata codebase: `skills/kata-executing-phases/references/github-integration.md` - planned integration points

### Tertiary (LOW confidence)
- None - all findings verified against local tools and codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - gh CLI patterns already established in Phase 3
- Architecture: HIGH - integration points clearly documented in existing references
- Pitfalls: HIGH - race condition analysis based on executor architecture understanding

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (gh CLI stable, Kata architecture stable)
