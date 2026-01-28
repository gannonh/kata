# Phase 5: PR Integration - Research

**Researched:** 2026-01-26
**Domain:** GitHub CLI PR workflows, Kata skill orchestration
**Confidence:** HIGH

## Summary

This phase implements Phase PR functionality in `kata-executing-phases` and PR status display in `kata-tracking-progress`. The spec is already well-documented in `planning-config.md#pr_workflow_behavior` and detailed implementation guidance exists in the pre-populated `05-CONTEXT.md` file.

The research confirms there's a clarity issue in the success criteria: items 1-5 reference `/kata:completing-milestones` but actually describe **Phase PR** behavior that belongs in `/kata:executing-phases`. Release PRs (which `/kata:completing-milestones` handles) are already partially implemented. This phase focuses on Phase PRs during execution.

**Primary recommendation:** Implement PR workflow in `kata-executing-phases` by adding branch creation (step 1.5), draft PR opening (step 4.5), and PR ready marking (step 10.5) as detailed in `05-CONTEXT.md`.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Tool       | Version | Purpose                | Why Standard                             |
| ---------- | ------- | ---------------------- | ---------------------------------------- |
| `gh` CLI   | latest  | GitHub PR operations   | Official GitHub CLI, already used in Kata|
| `git`      | 2.x+    | Branch management      | Standard VCS, already used throughout    |

### Supporting

| Tool  | Purpose              | When to Use                    |
| ----- | -------------------- | ------------------------------ |
| `jq`  | JSON parsing from gh | Extract PR numbers from API    |
| `sed` | Checkbox updates     | Pattern already in execute     |

**Installation:**
```bash
# gh CLI should already be installed and authenticated
gh auth status
```

## Architecture Patterns

### PR Workflow Flow

```
kata-executing-phases with pr_workflow: true
├── Step 1.5: Create phase branch
│   └── git checkout -b {type}/v{milestone}-{phase}-{slug}
├── Step 4.5: Open draft PR (after first wave)
│   ├── git push -u origin {branch}
│   └── gh pr create --draft
├── Step 10.5: Mark PR ready (after phase complete)
│   └── gh pr ready
└── Offer next: include PR URL
```

### Branch Naming Convention

Already specified in `planning-config.md`:

```
{type}/v{milestone}-{phase}-{slug}
```

| Component | Source                           | Example            |
| --------- | -------------------------------- | ------------------ |
| type      | Infer from phase goal            | `feat`             |
| milestone | From ROADMAP.md                  | `1.1.0`            |
| phase     | Zero-padded phase number         | `05`               |
| slug      | Phase name, kebab-case, max 40   | `pr-integration`   |

**Examples:**
- `feat/v1.1.0-05-pr-integration`
- `fix/v1.1.0-01.1-document-pr-workflow`

### Type Inference from Phase Goal

```bash
# Default to feat
TYPE="feat"

# Check phase goal for keywords
GOAL=$(grep "Goal:" ${PHASE_DIR} | head -1)
[[ "$GOAL" =~ fix|bug|patch ]] && TYPE="fix"
[[ "$GOAL" =~ doc|document ]] && TYPE="docs"
[[ "$GOAL" =~ refactor|restructure ]] && TYPE="refactor"
[[ "$GOAL" =~ chore|maintain ]] && TYPE="chore"
```

### Existing `kata-executing-phases` Process Structure

The skill currently has these steps (from SKILL.md):

```
0. Resolve model profile
1. Validate phase exists          ← ADD: step 1.5 (branch creation)
2. Discover plans
3. Group by wave
4. Execute waves                  ← ADD: step 4.5 (draft PR after first wave)
5. Aggregate results
6. Commit orchestrator corrections
7. Verify phase goal
8. Update roadmap and state
9. Update requirements
10. Commit phase completion       ← ADD: step 10.5 (mark PR ready)
11. Offer next steps              ← UPDATE: include PR URL
```

### PR Body Format (from spec)

```markdown
## Phase Goal
[One-line objective from ROADMAP.md]

## Plans Completed
- [x] Plan 01: [name]
- [x] Plan 02: [name]

## Success Criteria
- [ ] [criterion 1 from ROADMAP.md]
- [ ] [criterion 2 from ROADMAP.md]

Closes #[phase-issue-number]
```

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem          | Don't Build        | Use Instead              | Why                                 |
| ---------------- | ------------------ | ------------------------ | ----------------------------------- |
| PR creation      | Custom API calls   | `gh pr create --draft`   | Handles auth, formatting, errors    |
| Branch creation  | Manual git flow    | `git checkout -b`        | Standard, atomic                    |
| PR ready marking | API calls          | `gh pr ready`            | Single command, idempotent          |
| PR lookup        | Manual parsing     | `gh pr list --json`      | Structured output, reliable         |
| Issue linking    | Manual body edit   | "Closes #X" in PR body   | GitHub native, auto-closes on merge |

**Key insight:** The `gh` CLI handles authentication, error messages, and edge cases. Always prefer gh commands over raw git/API operations for GitHub-specific features.

## Common Pitfalls

### Pitfall 1: Branch Already Exists
**What goes wrong:** `git checkout -b` fails if branch exists from previous partial run
**Why it happens:** User re-runs after failure, or branch wasn't cleaned up
**How to avoid:** Check if branch exists first, or use force checkout
**Warning signs:** "branch already exists" error

```bash
# Safe pattern
if git show-ref --verify --quiet refs/heads/"$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH"
fi
```

### Pitfall 2: PR Already Open
**What goes wrong:** `gh pr create` fails if draft PR already exists for branch
**Why it happens:** Re-running execution after first wave completed
**How to avoid:** Check for existing PR before creating
**Warning signs:** "pull request already exists" error

```bash
# Check for existing PR
EXISTING_PR=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)
if [ -n "$EXISTING_PR" ]; then
  echo "PR #${EXISTING_PR} already exists, skipping creation"
else
  gh pr create --draft ...
fi
```

### Pitfall 3: No Phase Issue to Link
**What goes wrong:** PR body has "Closes #" but no issue number
**Why it happens:** `github.enabled=false` or `issueMode=never`
**How to avoid:** Only include "Closes #X" when issue actually exists
**Warning signs:** Broken issue link in PR body

```bash
# Conditional issue linking
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
  ISSUE_NUMBER=$(gh issue list --label phase --milestone "v${MILESTONE}" \
    --json number,title --jq ".[] | select(.title | startswith(\"Phase ${PHASE}:\")) | .number")
  [ -n "$ISSUE_NUMBER" ] && CLOSES_LINE="Closes #${ISSUE_NUMBER}"
fi
```

### Pitfall 4: Wrong Branch for PR
**What goes wrong:** PR created against wrong base branch
**Why it happens:** Default base might not be `main`
**How to avoid:** Explicitly specify base branch
**Warning signs:** PR targeting feature branch instead of main

```bash
gh pr create --draft --base main ...
```

### Pitfall 5: PR Status Display When No PR Exists
**What goes wrong:** `tracking-progress` shows error or confusing output
**Why it happens:** Checking PR status when no PR exists for current phase
**How to avoid:** Graceful handling when no PR found
**Warning signs:** "no open pull requests" errors in status

## Code Examples

Verified patterns from existing Kata codebase:

### Config Reading Pattern
```bash
# Source: kata-executing-phases SKILL.md line 44-45
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

### Branch Creation Pattern
```bash
# Source: planning-config.md lines 265-266
if [ "$PR_WORKFLOW" = "true" ]; then
  git checkout -b "feat/v${MILESTONE}-${PHASE}-${SLUG}"
fi
```

### Draft PR Creation Pattern
```bash
# Source: 05-CONTEXT.md lines 63-78
git push -u origin "$BRANCH"
gh pr create --draft \
  --base main \
  --title "v${MILESTONE} Phase ${PHASE_NUM}: ${PHASE_NAME}" \
  --body "$(cat <<'EOF'
## Phase Goal
[Goal from ROADMAP.md]

## Plans
- [ ] Plan 01: [name]
- [ ] Plan 02: [name]

## Success Criteria
- [ ] [criterion 1]
- [ ] [criterion 2]
EOF
)"
```

### Mark PR Ready Pattern
```bash
# Source: planning-config.md line 235
gh pr ready
```

### PR Status Check Pattern
```bash
# Source: github-integration.md lines 274-277
if [ "$PR_WORKFLOW" = "true" ]; then
  gh pr list --state open --json number,title,state,mergeable,statusCheckRollup
fi
```

### Get PR for Current Branch
```bash
# Find PR for current phase branch
CURRENT_BRANCH=$(git branch --show-current)
PR_INFO=$(gh pr list --head "$CURRENT_BRANCH" --json number,state,title --jq '.[0]' 2>/dev/null)
PR_NUMBER=$(echo "$PR_INFO" | jq -r '.number // empty')
PR_STATE=$(echo "$PR_INFO" | jq -r '.state // empty')
```

## State of the Art

| Old Approach            | Current Approach               | When Changed | Impact                    |
| ----------------------- | ------------------------------ | ------------ | ------------------------- |
| Direct main commits     | Phase branches + PRs           | v1.0.0       | Better review, CI/CD      |
| Manual PR creation      | `gh pr create --draft`         | v1.0.0       | Automation, consistency   |
| Tag at milestone        | GH Release after merge         | v1.0.0       | CI/CD trigger for publish |

**Already implemented in Kata:**
- `kata-completing-milestones`: Release PR creation (partial, offers but doesn't require)
- `kata-starting-projects`: pr_workflow config question
- `kata-configuring-settings`: pr_workflow toggle

## Integration Points

### Skills Requiring Changes

| Skill                    | Changes Needed                                          | Priority |
| ------------------------ | ------------------------------------------------------- | -------- |
| `kata-executing-phases`  | Add steps 1.5, 4.5, 10.5 for branch/PR lifecycle        | High     |
| `kata-tracking-progress` | Add PR status display in step "report"                  | Medium   |

### Config Dependencies

| Config Key        | Purpose                    | Default |
| ----------------- | -------------------------- | ------- |
| `pr_workflow`     | Enable phase branch/PR     | `false` |
| `github.enabled`  | Enable issue linking       | `false` |
| `github.issueMode`| Control issue creation     | `never` |

### Relationship Between Configs

- `pr_workflow: true` alone enables branch/PR workflow
- `github.enabled: true` + `pr_workflow: true` enables issue linking in PR body
- `pr_workflow: false` means all commits go directly to current branch

## Open Questions

Things that couldn't be fully resolved:

1. **Success Criteria Wording**
   - What we know: Items 1-5 say `/kata:completing-milestones` but describe Phase PR behavior
   - What's unclear: Was this intentional (extend completing-milestones) or a typo?
   - Recommendation: Implement in `kata-executing-phases` as spec says; the CONTEXT.md file confirms this is correct

2. **PR Update After Wave Completion**
   - What we know: Issue checkboxes update after each wave
   - What's unclear: Should PR body also update with checked plans?
   - Recommendation: Only update PR body on creation and when marked ready (less churn, clearer history)

## Sources

### Primary (HIGH confidence)
- `kata/references/planning-config.md` - Authoritative PR workflow spec
- `.planning/phases/v1.1.0-05-pr-integration/05-CONTEXT.md` - Pre-populated implementation guidance
- `skills/kata-executing-phases/SKILL.md` - Current skill structure
- `skills/kata-executing-phases/references/github-integration.md` - GitHub CLI patterns

### Secondary (MEDIUM confidence)
- `skills/kata-completing-milestones/SKILL.md` - Existing PR workflow in milestone completion
- `tests/skills/executing-phases.test.js` - Test patterns to follow

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - gh CLI is already the standard in Kata
- Architecture: HIGH - Spec documented in planning-config.md
- Pitfalls: HIGH - Based on common git/gh failure modes
- Code examples: HIGH - All sourced from existing Kata files

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (stable, gh CLI patterns unlikely to change)
