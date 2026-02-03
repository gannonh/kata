# Phase 1: PR Issue Closure - Research

**Researched:** 2026-02-01
**Domain:** GitHub Issue lifecycle, PR body composition, Kata skill integration
**Confidence:** HIGH

## Summary

This phase addresses the missing link between PRs and their associated GitHub Issues in Kata workflows. Currently, Kata creates PRs for phase execution and milestone completion, but the `Closes #X` linking is incomplete or missing in several flows.

Three distinct PR-to-Issue closure scenarios need implementation:
1. **Phase execution PRs** - Should close the phase GitHub Issue (created by `kata-add-milestone`)
2. **Milestone completion PRs** - Should close ALL phase issues in that milestone
3. **Issue execution PRs** - Should close the source backlog issue (for Phase 2's issue execution workflow)

The implementation involves modifying PR body generation in three skills: `execute-phase`, `complete-milestone`, and (for Phase 2) the issue execution workflow. No new dependencies are required - all functionality exists via `gh` CLI.

**Primary recommendation:** Audit existing `Closes #X` implementation in `execute-phase`, add multi-issue closure to `complete-milestone`, and prepare the pattern for issue execution PRs.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| gh CLI | 2.x+ | GitHub API operations | Official CLI, already used throughout Kata |
| jq | 1.6+ | JSON parsing | Standard for shell JSON manipulation |

### Supporting
| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| grep/sed | System | Text manipulation | Pattern matching in issue bodies |

### Alternatives Considered
None - gh CLI is the established pattern in Kata for all GitHub operations.

**Installation:**
No additional installation required. gh CLI is already a dependency.

## Architecture Patterns

### Current PR Creation Locations

Three skills create PRs that should close issues:

```
skills/
├── execute-phase/SKILL.md          # Phase PRs (CLOSE-01)
│   └── Step 4.5: Open Draft PR
│       └── Already has CLOSES_LINE logic (lines 226-229)
│
├── complete-milestone/             # Milestone PRs (CLOSE-02)
│   └── SKILL.md Step 7
│   └── references/milestone-complete.md
│       └── NO Closes #X implementation
│
└── check-issues/SKILL.md           # Issue execution (CLOSE-03)
    └── Step "Work on it now"
        └── Phase 2 scope - creates PR with Closes #X
```

### Pattern 1: Single Issue Closure (Phase Execution)

**What:** PR body includes `Closes #X` for a single phase issue
**When to use:** Phase execution PRs, issue execution PRs
**Example:**
```bash
# Source: skills/execute-phase/SKILL.md lines 226-229
CLOSES_LINE=""
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
  PHASE_ISSUE=$(gh issue list --label phase --milestone "v${MILESTONE}" \
    --json number,title --jq ".[] | select(.title | startswith(\"Phase ${PHASE_NUM}:\")) | .number" 2>/dev/null)
  [ -n "$PHASE_ISSUE" ] && CLOSES_LINE="Closes #${PHASE_ISSUE}"
fi
```

### Pattern 2: Multi-Issue Closure (Milestone Completion)

**What:** PR body includes `Closes #X, Closes #Y, ...` for all phase issues in milestone
**When to use:** Milestone completion PRs
**Example:**
```bash
# Build list of all phase issue numbers in milestone
PHASE_ISSUES=$(gh issue list --label phase --milestone "v${MILESTONE}" \
  --json number --jq '.[].number' 2>/dev/null | tr '\n' ' ')

# Build multi-close line
CLOSES_LINES=""
for ISSUE_NUM in $PHASE_ISSUES; do
  CLOSES_LINES="${CLOSES_LINES}Closes #${ISSUE_NUM}\n"
done
```

### Anti-Patterns to Avoid
- **Assuming issue exists:** Always check if `ISSUE_NUMBER` is non-empty before adding `Closes #X`
- **Single-line multi-close:** GitHub prefers each `Closes #X` on its own line for readability
- **Closing non-default-branch PRs:** GitHub only auto-closes when merged to default branch (main)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Issue lookup | Custom API calls | `gh issue list --jq` | Auth, pagination, error handling built-in |
| PR body editing | String manipulation | `gh pr edit --body-file` | Handles escaping, newlines, encoding |
| Milestone lookup | Parse ROADMAP.md | `gh api repos/:owner/:repo/milestones --jq` | Source of truth is GitHub |

**Key insight:** The gh CLI handles all the complexity of GitHub API interactions. Use `--jq` filters for extraction.

## Common Pitfalls

### Pitfall 1: Missing Issue Number

**What goes wrong:** PR body has "Closes #" but no number
**Why it happens:** Issue doesn't exist yet, or query failed silently
**How to avoid:** Only append `Closes #X` when `ISSUE_NUMBER` is non-empty:
```bash
[ -n "$PHASE_ISSUE" ] && CLOSES_LINE="Closes #${PHASE_ISSUE}"
```
**Warning signs:** Empty `Closes #` in PR body, no issue closed on merge

### Pitfall 2: Non-Default Branch PRs

**What goes wrong:** Issue not closed despite `Closes #X` in PR body
**Why it happens:** GitHub only auto-closes on merge to default branch (typically `main`)
**How to avoid:** Kata PRs always target `main` - this is already correct
**Warning signs:** Phase/release branches merged but issues remain open

### Pitfall 3: Duplicate Closure Attempts

**What goes wrong:** Explicit `gh issue close` runs after PR merge, fails or duplicates comment
**Why it happens:** Both `Closes #X` and explicit closure logic exist
**How to avoid:** The explicit backup closure in `execute-phase` (line 417-420) is correct - it handles the case where `Closes #X` didn't trigger. Check if already closed before commenting.
**Warning signs:** "Issue already closed" errors, duplicate closure comments

### Pitfall 4: Race Condition on PR Body

**What goes wrong:** Multiple plans complete in same wave, each tries to update PR body
**Why it happens:** Parallel execution without coordination
**How to avoid:** Current `execute-phase` updates issue checkboxes per-wave (not per-plan), which is correct. PR body is static after creation.
**Warning signs:** Partial checkbox updates, lost edits

## Code Examples

Verified patterns from official sources:

### Lookup Phase Issue by Milestone and Label
```bash
# Source: skills/execute-phase/SKILL.md lines 159-165
VERSION=$(grep -oE 'v[0-9]+\.[0-9]+(\.[0-9]+)?' .planning/ROADMAP.md | head -1 | tr -d 'v')
ISSUE_NUMBER=$(gh issue list \
  --label "phase" \
  --milestone "v${VERSION}" \
  --json number,title \
  --jq ".[] | select(.title | startswith(\"Phase ${PHASE}:\")) | .number" \
  2>/dev/null)
```

### Build Multi-Issue Closes Line
```bash
# Pattern for milestone completion PRs
PHASE_ISSUES=$(gh issue list --label phase --milestone "v${VERSION}" \
  --json number,title --jq '.[].number' 2>/dev/null)

# Build line-separated closes
CLOSES_SECTION=""
for num in $PHASE_ISSUES; do
  CLOSES_SECTION="${CLOSES_SECTION}Closes #${num}
"
done
```

### GitHub Keywords Reference
```markdown
# Source: GitHub official documentation
# https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue

Supported keywords (case-insensitive, colon optional):
- close, closes, closed
- fix, fixes, fixed
- resolve, resolves, resolved

Examples:
- Closes #10
- CLOSES: #10
- Fixes octo-org/octo-repo#100
- Resolves #10, resolves #123
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Manual issue closure | `Closes #X` in PR body | GitHub default | Automatic closure on merge |
| Explicit `gh issue close` | Backup closure after merge | v1.4.0 | Handles edge cases |

**Deprecated/outdated:**
- None for this domain - GitHub linking keywords have been stable since 2011

## Existing Implementation Analysis

### CLOSE-01: Phase Execution PRs (PARTIALLY IMPLEMENTED)

**Location:** `skills/execute-phase/SKILL.md` lines 226-229

**Current state:** Logic EXISTS but needs verification:
```bash
CLOSES_LINE=""
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
  PHASE_ISSUE=$(gh issue list --label phase --milestone "v${MILESTONE}" \
    --json number,title --jq ".[] | select(.title | startswith(\"Phase ${PHASE_NUM}:\")) | .number" 2>/dev/null)
  [ -n "$PHASE_ISSUE" ] && CLOSES_LINE="Closes #${PHASE_ISSUE}"
fi
```

**Gap:** The `CLOSES_LINE` variable is built but needs to be verified that it's included in PR body at line 249:
```markdown
${CLOSES_LINE}
```

**Also:** Backup explicit closure at step 10.6 (lines 417-420) handles the case where `Closes #X` didn't trigger.

**Verdict:** Likely ALREADY WORKING but needs verification/testing.

### CLOSE-02: Milestone Completion PRs (NOT IMPLEMENTED)

**Location:** `skills/complete-milestone/SKILL.md` step 7, `references/milestone-complete.md`

**Current state:** PR creation exists but NO `Closes #X` logic:
```bash
gh pr create \
  --title "v{{version}}: [Milestone Name]" \
  --body "$(cat <<'EOF'
## Summary
Completes milestone v{{version}}.
...
EOF
)"
```

**Gap:** PR body has no issue linking. Need to:
1. Query all phase issues for the milestone
2. Build multi-line `Closes #X` section
3. Include in PR body

**Verdict:** NEEDS IMPLEMENTATION

### CLOSE-03: Issue Execution PRs (PHASE 2 SCOPE)

**Location:** `skills/check-issues/SKILL.md` "Work on it now" action

**Current state:** Moves issue to in-progress, no PR creation yet

**Gap:** Phase 2 will add PR creation - that PR needs `Closes #X` for the source issue

**Verdict:** PHASE 2 SCOPE - document the pattern here for Phase 2 planning

## Implementation Approach

### Requirement Mapping

| Requirement | Implementation | Effort |
| ----------- | -------------- | ------ |
| CLOSE-01 | Verify existing `execute-phase` implementation works | Verify only |
| CLOSE-02 | Add multi-issue `Closes #X` to `complete-milestone` PR body | Small (~50 LOC) |
| CLOSE-03 | Document pattern for Phase 2's issue execution PR | Design only |

### Task Breakdown Suggestion

1. **Verify CLOSE-01** - Test execute-phase PR → issue closure end-to-end
2. **Implement CLOSE-02** - Add `Closes #X` lines to milestone PR body
3. **Document CLOSE-03** - Pattern documentation for Phase 2

## Open Questions

Things that couldn't be fully resolved:

1. **execute-phase verification status**
   - What we know: Code exists for `Closes #X` inclusion
   - What's unclear: Whether it's actually working in production
   - Recommendation: Test manually or review recent PRs for closure behavior

2. **Milestone completion timing**
   - What we know: Phase issues may already be closed by phase PRs
   - What's unclear: Whether re-closing already-closed issues causes errors
   - Recommendation: GitHub silently ignores `Closes #X` for already-closed issues - safe to include all

## Sources

### Primary (HIGH confidence)
- `skills/execute-phase/SKILL.md` - Current implementation (lines 226-229, 249, 417-420)
- `skills/complete-milestone/SKILL.md` - PR creation (step 7)
- GitHub official docs - Issue linking keywords

### Secondary (MEDIUM confidence)
- `skills/check-issues/SKILL.md` - Issue execution flow (Phase 2 reference)
- `.planning/REQUIREMENTS.md` - Requirement definitions

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - gh CLI is established Kata pattern
- Architecture: HIGH - Code locations verified, patterns documented
- Pitfalls: HIGH - Based on existing codebase patterns and GitHub docs

**Research date:** 2026-02-01
**Valid until:** Indefinite - GitHub linking keywords are stable
