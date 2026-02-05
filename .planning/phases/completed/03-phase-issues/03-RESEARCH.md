# Phase 3: Phase Issues - Research

**Researched:** 2026-01-26
**Domain:** GitHub API (Issues, Labels, Milestones), gh CLI
**Confidence:** HIGH

## Summary

This research documents how to implement GitHub Issue creation for Kata phases. The gh CLI provides straightforward commands for creating issues with labels, milestones, and structured bodies. The implementation should integrate with the existing `kata-adding-milestones` skill where phases are already defined, or with `kata-roadmapper` which creates phases.

The key decision is **when** to create phase issues: during milestone creation (when phases are first defined in ROADMAP.md) or during phase planning (when plans are created). Based on requirements GHI-01-03, issues should be created "when milestone created" - meaning when the roadmap with phases is finalized.

**Primary recommendation:** Add phase issue creation to `kata-adding-milestones` skill after the roadmapper creates ROADMAP.md, respecting the `github.issueMode` config setting.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Tool | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| gh CLI | 2.x | GitHub API interactions | Already used for milestone creation in kata-adding-milestones |
| jq | 1.6+ | JSON parsing for API responses | Standard for shell-based JSON manipulation |

### Supporting
| Tool | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| grep | any | Config parsing | Already used in Kata for config.json reading |
| sed | any | Text extraction from ROADMAP.md | For parsing phase goals/criteria |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| gh issue create | gh api POST /repos/:owner/:repo/issues | gh issue create is simpler, gh api gives more control |
| Parsing ROADMAP.md with sed | Using a proper parser | sed/grep is sufficient for Kata's structured format |

**Installation:**
No new dependencies - gh CLI and jq already available in Kata environments.

## Architecture Patterns

### Integration Point

Phase issues should be created in `kata-adding-milestones` because:
1. This is where ROADMAP.md (containing phases) is created/updated
2. GitHub Milestone already created here (Phase 5.5)
3. Phase issues need milestone assignment, which is available at this point
4. Respects existing `github.issueMode` config check

### Recommended Flow Addition (Phase 5.6: Create Phase Issues)

```
After ROADMAP.md is committed and GitHub Milestone created:

1. Check github.issueMode config (auto | ask | never)
2. If "never" -> skip silently
3. If "ask" -> prompt user
4. If "auto" or user approved -> proceed

For each phase in this milestone:
  a. Parse phase goal and success criteria from ROADMAP.md
  b. Construct issue body with structured content
  c. Check if phase issue already exists (idempotent)
  d. Create issue with:
     - title: "Phase {N}: {Phase Name}"
     - label: "phase" (create if doesn't exist)
     - milestone: {milestone number from Phase 5.5}
     - body: structured content
```

### Issue Body Template

```markdown
## Goal

{phase goal from ROADMAP.md}

## Success Criteria

{success criteria as checklist}
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Requirements

{requirement IDs covered by this phase}

## Plans

<!-- Checklist added by /kata:planning-phases (Phase 4) -->
_Plans will be added after phase planning completes._

---
<sub>Created by Kata | Phase {N} of milestone v{VERSION}</sub>
```

### Pattern: Label Idempotency

```bash
# Create label if doesn't exist (force flag handles existing)
gh label create "phase" --color "0E8A16" --description "Kata phase tracking" --force
```

### Pattern: Issue Existence Check

```bash
# Check if issue with title already exists
EXISTING=$(gh issue list --label "phase" --search "Phase ${PHASE_NUM}:" --json number,title --jq '.[0].number // empty')
if [ -n "$EXISTING" ]; then
  echo "Phase issue already exists: #${EXISTING}"
else
  # Create new issue
fi
```

### Anti-Patterns to Avoid

- **Creating issues before ROADMAP exists:** Issues need phase content from ROADMAP.md
- **Creating issues in kata-planning-phases:** Would create issues too late (after user already working)
- **Ignoring issueMode config:** Would create unwanted issues in "never" mode
- **Creating duplicate issues on re-run:** Must check for existing phase issues

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| GitHub API calls | Custom curl/HTTP | `gh` CLI | Handles auth, rate limits, pagination |
| Label management | Manual creation | `gh label create --force` | Idempotent, handles both create and update |
| Issue search | Full listing | `gh issue list --search` | GitHub's search API is efficient |
| JSON parsing | Manual string parsing | `jq` | Reliable, handles edge cases |
| ROADMAP parsing | Complex regex | sed/awk with known patterns | Kata ROADMAP.md has consistent format |

**Key insight:** The gh CLI handles authentication, pagination, and error states. Raw API calls would require reimplementing all of this.

## Common Pitfalls

### Pitfall 1: Milestone Number vs Title
**What goes wrong:** Using milestone title in issue creation instead of number
**Why it happens:** `gh issue create -m` accepts both, but API behavior differs
**How to avoid:** Always use milestone number retrieved from API
**Warning signs:** "No milestone found" errors despite milestone existing

```bash
# GOOD: Use number from previous step
gh issue create -m "$MILESTONE_NUMBER" ...

# BAD: Use title string
gh issue create -m "v1.1.0" ...  # May fail if title format differs
```

### Pitfall 2: Label Creation Race Condition
**What goes wrong:** Issue creation fails if label doesn't exist yet
**Why it happens:** Label creation and issue creation done in wrong order
**How to avoid:** Create label before creating any issues
**Warning signs:** "Label not found" errors on first run

### Pitfall 3: Parsing Multiline Success Criteria
**What goes wrong:** Only first criterion extracted from ROADMAP.md
**Why it happens:** sed/grep not handling multiline patterns
**How to avoid:** Use awk or loop over lines in success criteria block
**Warning signs:** Issues missing criteria 2-N

```bash
# Parse success criteria block properly
awk '/Success Criteria.*:/,/^[^[:space:]]/' ROADMAP.md | grep "^ *[0-9]"
```

### Pitfall 4: Special Characters in Issue Body
**What goes wrong:** Issue body contains shell metacharacters that break gh CLI
**Why it happens:** Phase goals might contain quotes, backticks, etc.
**How to avoid:** Use `--body-file` with HEREDOC or temp file
**Warning signs:** Truncated or malformed issue bodies

```bash
# GOOD: Use body file
cat > /tmp/issue-body.md << 'EOF'
${PHASE_BODY}
EOF
gh issue create --body-file /tmp/issue-body.md ...

# BAD: Inline body with special chars
gh issue create --body "${PHASE_BODY}" ...  # May fail with quotes/backticks
```

### Pitfall 5: Phase Numbering in Search
**What goes wrong:** Search for "Phase 3:" matches "Phase 30:", "Phase 31:", etc.
**Why it happens:** Search is substring-based
**How to avoid:** Use exact title match or include phase name
**Warning signs:** False positive matches preventing new issue creation

```bash
# More specific search
gh issue list --search "Phase ${PHASE_NUM}: ${PHASE_NAME} in:title"
```

## Code Examples

Verified patterns from gh CLI documentation:

### Creating Issue with All Options
```bash
# Source: gh issue create --help
gh issue create \
  --title "Phase 3: Phase Issues" \
  --body-file /tmp/phase-body.md \
  --label "phase" \
  --milestone 5 \
  2>/dev/null && echo "Issue created" || echo "Warning: Issue creation failed"
```

### Creating Label Idempotently
```bash
# Source: gh label create --help
gh label create "phase" \
  --color "0E8A16" \
  --description "Kata phase tracking" \
  --force 2>/dev/null || true
```

### Getting Milestone Number by Title
```bash
# Source: gh api documentation
MILESTONE_NUM=$(gh api /repos/:owner/:repo/milestones \
  --jq ".[] | select(.title==\"v${VERSION}\") | .number")
```

### Checking for Existing Issue
```bash
# Source: gh issue list --help
EXISTING=$(gh issue list \
  --label "phase" \
  --milestone "$MILESTONE_NUM" \
  --json number,title \
  --jq ".[] | select(.title | startswith(\"Phase ${PHASE_NUM}:\")) | .number" \
  2>/dev/null)
```

### Parsing Phase from ROADMAP.md
```bash
# Extract phase details for Phase N
# Assumes ROADMAP format: "#### Phase N: Name"
PHASE_BLOCK=$(awk "/^#### Phase ${PHASE_NUM}:/,/^#### Phase [0-9]|^### /" ROADMAP.md)

PHASE_NAME=$(echo "$PHASE_BLOCK" | head -1 | sed 's/.*Phase [0-9]*: //')
PHASE_GOAL=$(echo "$PHASE_BLOCK" | grep -A1 "Goal" | tail -1 | sed 's/^\*\*Goal\*\*: //')

# Extract success criteria as checklist
CRITERIA=$(echo "$PHASE_BLOCK" | awk '/Success Criteria/,/^\*\*/' | grep "^ *[0-9]" | sed 's/^ *[0-9]*\. /- [ ] /')
```

### Full Issue Creation with issueMode Check
```bash
# Read issueMode config
ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "auto")

case "$ISSUE_MODE" in
  "never")
    echo "Skipping phase issue creation (issueMode: never)"
    ;;
  "ask")
    # Prompt user via AskUserQuestion
    # If approved, fall through to auto
    ;;
  "auto"|*)
    # Create phase issue
    ;;
esac
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| curl + manual auth | gh CLI | 2020 | No token management needed |
| REST API only | gh api (wraps REST) | 2021 | Better pagination, error handling |
| v3 REST | v3 REST (v4 GraphQL for complex queries) | Ongoing | REST sufficient for issue CRUD |

**Deprecated/outdated:**
- Hub CLI: Replaced by gh CLI (2020)
- Manual OAuth token management: gh auth handles this now

## Open Questions

Things that couldn't be fully resolved:

1. **Phase issue updates vs re-creation**
   - What we know: Can check if issue exists and skip
   - What's unclear: Should we update existing issue body if ROADMAP changes?
   - Recommendation: Start with skip-if-exists (idempotent), defer update logic to Phase 4

2. **Multi-milestone phases**
   - What we know: Phases belong to one milestone
   - What's unclear: What happens with decimal phases (2.1, 2.2)?
   - Recommendation: Decimal phases should create issues in their parent milestone

3. **Issue close automation**
   - What we know: Phase completion could close the issue
   - What's unclear: When exactly is a phase "complete"? After all plans? After verification?
   - Recommendation: Defer to Phase 4/5, out of scope for Phase 3

## Sources

### Primary (HIGH confidence)
- gh CLI help output (`gh issue create --help`, `gh label create --help`) - verified 2026-01-26
- Kata codebase: `skills/kata-adding-milestones/SKILL.md` - existing GitHub Milestone pattern
- Kata codebase: `skills/kata-adding-milestones/references/github-mapping.md` - Kata-GitHub mapping

### Secondary (MEDIUM confidence)
- gh CLI documentation patterns from existing Kata implementation
- ROADMAP.md structure from Kata project

### Tertiary (LOW confidence)
- None - all findings verified against local tools and codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - gh CLI already in use, verified locally
- Architecture: HIGH - integrates with existing kata-adding-milestones pattern
- Pitfalls: HIGH - based on actual gh CLI behavior testing

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (gh CLI stable, unlikely to change)
