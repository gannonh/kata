<github_integration>

GitHub integration for Kata projects. Documents all integration points and configuration.

<overview>

## Purpose

GitHub integration adds automatic Milestone and Issue creation to Kata workflows. When enabled, Kata mirrors your roadmap structure to GitHub:

- **Milestones** map to Kata milestones (e.g., v1.1.0)
- **Issues** map to Kata phases within milestones

This provides visibility into project progress outside Claude Code and enables stakeholder tracking via GitHub's native tools.

## Relationship to pr_workflow

GitHub integration (`github.*`) and `pr_workflow` are independent but complementary:

| Config Key       | Controls                              | Independent? |
| ---------------- | ------------------------------------- | ------------ |
| `github.enabled` | GitHub Milestone/Issue creation       | Yes          |
| `pr_workflow`    | Branch strategy and PR-based releases | Yes          |

**Recommendation:** Enable both for full GitHub integration:
- `github.enabled: true` — Milestones and Issues track planning
- `pr_workflow: true` — PRs track execution

Either can be used independently:
- `github.enabled: true` + `pr_workflow: false` — Issues without PRs (direct commits)
- `github.enabled: false` + `pr_workflow: true` — PRs without Issues (branch workflow only)

</overview>

<config_keys>

## Configuration Keys

### `github.enabled` (default: `false`)

Master toggle for GitHub Milestone/Issue creation.

**When `true`:**
- Milestones created when starting new Kata milestones
- Issues created/updated based on `issueMode`
- Progress tracking shows GitHub status

**When `false`:**
- No GitHub API calls
- Planning stays local to `.planning/` directory

### `github.issueMode` (default: `never`)

Controls when phase Issues are created.

| Value   | Behavior                                                                |
| ------- | ----------------------------------------------------------------------- |
| `auto`  | Create Issues automatically for each phase, no prompting                |
| `ask`   | Prompt once per milestone; decision applies to all phases in milestone  |
| `never` | Never create phase Issues (Milestones still created if `enabled: true`) |

**The `ask` flow:**

1. When starting first phase in a milestone, user is prompted:
   "Create GitHub Issues for phases in v1.1.0? (y/n)"
2. Response is cached for that milestone
3. All subsequent phases in that milestone follow the cached decision
4. Next milestone prompts again

**Design rationale:**
- `auto` for teams that want full GitHub mirroring
- `ask` for teams that want control per-milestone
- `never` for teams that only want milestone-level tracking (no phase granularity)

</config_keys>

<integration_points>

## Integration Points by Phase

This section documents where GitHub hooks integrate across Kata skills.

### Phase 2: Project/Milestone Setup

#### `kata-new-project`

**Hook:** During config onboarding
**Action:** Ask if user wants GitHub integration, set initial `github.*` values
**Config checked:** None (this is where config is created)

```markdown
During project initialization:
1. Ask: "Enable GitHub Milestone/Issue tracking? (y/n)"
2. If yes, ask: "Create Issues automatically, ask per milestone, or never?"
3. Set github.enabled and github.issueMode in config.json
```

#### `kata-starting-milestones`

**Hook:** After milestone directory created, before returning
**Action:** Create GitHub Milestone via `gh` CLI
**Config checked:** `github.enabled`

```bash
if [ "$GITHUB_ENABLED" = "true" ]; then
  gh milestone create "v${MILESTONE}" --description "${MILESTONE_DESCRIPTION}"
fi
```

**Error handling:**
- If milestone exists, continue (idempotent)
- If `gh` auth fails, warn and continue (non-blocking)

#### `kata-configure-settings`

**Hook:** When displaying/updating settings
**Action:** Include `github.*` settings in configuration UI
**Config checked:** N/A (manages config)

```markdown
GitHub Integration:
- enabled: [true/false]
- issueMode: [auto/ask/never]
```

### Phase 3: Phase Issues (Implemented)

**Skill:** `kata-add-milestone`
**When:** After ROADMAP.md committed and GitHub Milestone created (Phase 9.5 of milestone workflow)
**GitHub Action:** Create Issue for each phase in milestone

**Flow:**
1. Check `github.enabled` (skip if false)
2. Check `github.issueMode` (auto/ask/never)
3. Create `phase` label (idempotent with `--force`)
4. Get milestone number from API
5. Parse phases from ROADMAP.md for this milestone
6. For each phase:
   - Check if issue exists (idempotent via `gh issue list`)
   - Create issue with goal, success criteria, requirement IDs
   - Assign to milestone, apply `phase` label

**Config Keys Checked:**
- `github.enabled` — Master toggle
- `github.issueMode` — Issue creation mode (auto/ask/never)

**Issue Body Structure:**
```markdown
## Goal

${PHASE_GOAL}

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Requirements

${REQUIREMENT_IDS}

## Plans

<!-- Checklist added by /kata:kata-plan-phase (Phase 4) -->
_Plans will be added after phase planning completes._
```

**CLI Pattern (uses --body-file for special character safety):**
```bash
# Create temp file with issue body
cat > /tmp/phase-issue-body.md << PHASE_EOF
## Goal
...
PHASE_EOF

# Create issue using file
gh issue create \
  --title "Phase ${PHASE_NUM}: ${PHASE_NAME}" \
  --body-file /tmp/phase-issue-body.md \
  --label "phase" \
  --milestone "v${VERSION}"
```

### Phase 4: Plan Updates (Implemented)

#### `kata-plan-phase`

**Hook:** After PLAN.md files created (Step 14)
**Action:** Update phase issue with plan checklist
**Config checked:** `github.enabled`, `github.issueMode`

**Flow:**
1. Check `github.enabled` and `issueMode`
2. Find phase issue by milestone and label
3. Build checklist from PLAN.md files
4. Replace placeholder text with checklist
5. Update issue with `--body-file`

```bash
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_MODE" != "never" ]; then
  # Find existing phase issue
  ISSUE_NUMBER=$(gh issue list --label phase --milestone "v${MILESTONE}" \
    --json number,title --jq ".[] | select(.title | startswith(\"Phase ${PHASE}:\")) | .number")

  # Update issue body with plan checklist
  gh issue edit $ISSUE_NUMBER --body-file /tmp/phase-issue-body.md
fi
```

**Issue body updates:**
- Adds plan checklist under `## Plans` section
- `- [ ] Plan 01: {plan-name}`
- `- [ ] Plan 02: {plan-name}`

#### `kata-execute-phase`

**Hook:** After each wave completes (Step 4.5)
**Action:** Check off completed plans in issue
**Config checked:** `github.enabled`, `github.issueMode`

**Flow:**
1. Check `github.enabled` and `issueMode`
2. Build COMPLETED_PLANS_IN_WAVE from SUMMARY.md files
3. Find phase issue by milestone and label
4. Read current issue body
5. Update checkboxes for all plans completed in wave
6. Write updated body atomically

**Race Condition Mitigation:**
Issue updated at orchestrator level per-wave, not in individual executors. This ensures sequential updates when multiple plans complete simultaneously in a wave.

### Phase 5: PR Integration (Implemented)

#### `kata-execute-phase` PR Workflow

**Hook:** At phase start, after first wave, and at phase completion
**Action:** Create branch, open draft PR, mark PR ready
**Config checked:** `pr_workflow`

**Flow:**
1. Step 1.5: Create phase branch (`{type}/v{milestone}-{phase}-{slug}`)
2. Step 4.5: Open draft PR after first wave (includes phase goal, plans checklist, "Closes #X")
3. Step 10.5: Mark PR ready after phase completion

**PR Title:** `v{milestone} Phase {N}: {Phase Name}`

**PR Body:**
```markdown
## Phase Goal
[Goal from ROADMAP.md]

## Plans
- [ ] Plan 01: [name]
- [ ] Plan 02: [name]

## Success Criteria
- [ ] [criterion 1]
- [ ] [criterion 2]

Closes #[phase-issue-number]
```

**Re-run Protection:**
- Branch creation: checks if branch exists before creating
- PR creation: checks if PR exists before creating

### Phase 4-5: Execution & Tracking

#### `kata-execute-phase`

**Hook:** After each plan completes
**Action:** Update Issue checklist, optionally create PR
**Config checked:** `github.enabled`, `github.issueMode`, `pr_workflow`

```bash
if [ "$GITHUB_ENABLED" = "true" ] && [ "$ISSUE_CREATED" = "true" ]; then
  # Update issue body to check off completed plan
  gh issue edit $ISSUE_NUMBER --body "..."
fi

if [ "$PR_WORKFLOW" = "true" ]; then
  # Create/update draft PR (existing behavior)
fi
```

**Checklist update pattern:**
- Read current issue body
- Find matching plan checkbox
- Change `- [ ]` to `- [x]`
- Write updated body

### Phase 5: Progress & Visibility

#### `kata-track-progress`

**Hook:** When displaying status
**Action:** Include GitHub Issue/Milestone/PR status
**Config checked:** `github.enabled`, `pr_workflow`

```bash
if [ "$GITHUB_ENABLED" = "true" ]; then
  # Fetch milestone progress
  gh milestone view "v${MILESTONE}" --json title,state,closedIssues,openIssues

  # Fetch phase issues
  gh issue list --milestone "v${MILESTONE}" --json number,title,state
fi

if [ "$PR_WORKFLOW" = "true" ]; then
  # Fetch PR status (existing behavior)
  gh pr list --json number,title,state,mergeable
fi
```

**Display format:**
```
GitHub Status:
  Milestone: v1.1.0 (3/6 issues closed)
  Current Phase Issue: #42 (open)
  Phase PR: #45 (draft, 2 checks passing)
```

</integration_points>

<issue_mode_behavior>

## issueMode Detailed Behavior

### `auto` Mode

Issues created immediately when phase planning completes. No prompts.

**Timeline:**
1. `/kata:kata-plan-phase 1` → Phase 1 planned → Issue #1 created
2. `/kata:kata-plan-phase 2` → Phase 2 planned → Issue #2 created
3. ...

**Use when:** Team wants full GitHub visibility, no manual intervention.

### `ask` Mode

Prompts once per milestone. Decision cached in STATE.md.

**Timeline:**
1. `/kata:kata-plan-phase 1` → "Create Issues for v1.1.0?" → User: "y"
2. Phase 1 planned → Issue #1 created (decision cached)
3. `/kata:kata-plan-phase 2` → Phase 2 planned → Issue #2 created (no prompt, uses cache)
4. New milestone v1.2.0 starts...
5. `/kata:kata-plan-phase 1` → "Create Issues for v1.2.0?" → User: "n"
6. Phase 1 planned → No issue created

**Cache location:** STATE.md under `### GitHub Decisions`

```markdown
### GitHub Decisions

| Milestone | Issues? | Decided    |
| --------- | ------- | ---------- |
| v1.1.0    | yes     | 2026-01-25 |
| v1.2.0    | no      | 2026-01-26 |
```

**Use when:** Team wants control but not per-phase prompts.

### `never` Mode

No phase Issues created. Milestones still created if `github.enabled: true`.

**Timeline:**
1. `/kata:kata-add-milestone v1.1.0` → GitHub Milestone created
2. `/kata:kata-plan-phase 1` → Phase 1 planned → No issue
3. ...

**Use when:** Team wants milestone-level tracking only, or manages Issues manually.

</issue_mode_behavior>

<cli_patterns>

## GitHub CLI Patterns

All GitHub integration uses the `gh` CLI. Authentication handled externally.

### Authentication Check

```bash
# Verify gh is authenticated
if ! gh auth status &>/dev/null; then
  echo "Warning: gh CLI not authenticated. GitHub integration skipped."
  exit 0  # Non-blocking, continue without GitHub
fi
```

### Milestone Operations

```bash
# Create milestone
gh milestone create "v${MILESTONE}" \
  --description "${DESCRIPTION}" \
  --due-date "${DUE_DATE}"  # Optional

# Check if milestone exists
gh milestone list --json title | grep -q "\"v${MILESTONE}\""

# Close milestone
gh milestone edit "v${MILESTONE}" --state closed
```

### Issue Operations

```bash
# Create issue
gh issue create \
  --title "Phase ${PHASE}: ${NAME}" \
  --milestone "v${MILESTONE}" \
  --body "$(cat <<'EOF'
## Objective
${OBJECTIVE}

## Plans
- [ ] Plan 01: ${PLAN_01_NAME}
- [ ] Plan 02: ${PLAN_02_NAME}
EOF
)"

# Update issue body
gh issue edit ${ISSUE_NUMBER} --body "..."

# Close issue
gh issue close ${ISSUE_NUMBER}

# Get issue number by title
ISSUE_NUMBER=$(gh issue list --milestone "v${MILESTONE}" --json number,title \
  | jq -r ".[] | select(.title | contains(\"Phase ${PHASE}:\")) | .number")
```

### Querying Status

```bash
# Milestone progress
gh milestone view "v${MILESTONE}" --json title,state,closedIssues,openIssues

# List phase issues
gh issue list --milestone "v${MILESTONE}" --state all --json number,title,state

# PR status
gh pr list --state open --json number,title,state,mergeable,statusCheckRollup
```

</cli_patterns>

<error_handling>

## Error Handling

GitHub operations are **non-blocking**. Failures warn but do not stop Kata workflows.

### Authentication Failures

```bash
if ! gh auth status &>/dev/null; then
  echo "⚠ GitHub CLI not authenticated. Run 'gh auth login' to enable GitHub integration."
  # Continue without GitHub operations
fi
```

### API Errors

```bash
if ! gh milestone create "v${MILESTONE}" 2>/dev/null; then
  # Milestone may already exist
  if gh milestone list --json title | grep -q "\"v${MILESTONE}\""; then
    echo "Milestone v${MILESTONE} already exists (reusing)"
  else
    echo "⚠ Failed to create milestone. GitHub integration may be unavailable."
  fi
fi
```

### Rate Limiting

If rate limited, warn and continue. GitHub operations can be retried manually.

```bash
if echo "$ERROR" | grep -q "rate limit"; then
  echo "⚠ GitHub API rate limited. Try again later."
fi
```

</error_handling>

<summary>

## Skills Affected Summary

| Skill                     | Phase | GitHub Action                     | Config Keys Checked                  | Status      |
| ------------------------- | ----- | --------------------------------- | ------------------------------------ | ----------- |
| `kata-new-project`        | 2     | Config onboarding                 | None (creates config)                | Implemented |
| `kata-add-milestone`      | 2     | Create GitHub Milestone           | `github.enabled`                     | Implemented |
| `kata-configure-settings` | 2     | Display/update github.* settings  | N/A                                  | Implemented |
| `kata-add-milestone`      | 3     | Create phase Issues (Phase 9.5)   | `github.enabled`, `github.issueMode` | Implemented |
| `kata-plan-phase`         | 4     | Update phase Issue with plan list | `github.enabled`, `github.issueMode` | Implemented |
| `kata-execute-phase`      | 4     | Update Issue checklist per wave   | `github.enabled`, `github.issueMode` | Implemented |
| `kata-track-progress`     | 5     | Show GH issue/milestone/PR status | `github.enabled`, `pr_workflow`      | Implemented |

**See:** [planning-config.md](planning-config.md) for config schema and reading patterns.

</summary>

</github_integration>
