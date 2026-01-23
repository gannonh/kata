# Phase 5: PR Integration — Pre-populated Context

This context was created during v0.1.9 development to capture implementation details for future use.

## Spec Reference

**Authoritative source:** `kata/references/planning-config.md#pr_workflow_behavior`

Read this file first. It defines:
- Branch naming convention: `{type}/v{milestone}-{phase}-{slug}`
- PR-per-phase lifecycle (draft → ready → merge)
- Release = milestone (1:1 mapping)
- Workflow timing table
- Command integration points

## Already Implemented

These skills already support `pr_workflow: true`:

### kata-completing-milestones (SKILL.md lines 140-213)
- Checks `PR_WORKFLOW` config
- If true: skips local git tag, offers to create PR via `gh pr create`
- Shows next steps for GitHub Release

### kata-configuring-settings (SKILL.md lines 89-97)
- `pr_workflow` toggle in settings
- Options: "Yes" (protect main, PRs, GitHub Release) vs "No" (direct commits)

### kata-starting-projects (SKILL.md lines 284-521)
- `pr_workflow` question in Round 1 preferences
- If true: asks about GitHub Actions scaffold
- Creates `.github/workflows/release.yml` if accepted

## What Needs Implementing

### kata-executing-phases

The skill now @-references `planning-config.md` but doesn't implement the behavior.

**Add these capabilities when `pr_workflow: true`:**

1. **Check config at phase start:**
   ```bash
   PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
   ```

2. **Create branch before execution:**
   ```bash
   # Derive type from phase goal (default: feat)
   TYPE="feat"  # or fix/docs/refactor/chore based on phase

   # Get milestone and phase from context
   MILESTONE="0.1.10"
   PHASE_NUM="05"
   SLUG="pr-integration"  # kebab-case from phase name

   BRANCH="${TYPE}/v${MILESTONE}-${PHASE_NUM}-${SLUG}"
   git checkout -b "$BRANCH"
   ```

3. **Open draft PR at first commit:**
   ```bash
   git push -u origin "$BRANCH"
   gh pr create --draft \
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

4. **Mark PR ready when phase complete:**
   ```bash
   gh pr ready
   ```

## Where to Insert in SKILL.md

Current process steps in `kata-executing-phases/SKILL.md`:

```
0. Resolve model profile
1. Validate phase exists          ← AFTER: check pr_workflow, create branch if true
2. Discover plans
3. Group by wave
4. Execute waves                  ← AFTER first commit: open draft PR if true
5. Aggregate results
6. Commit orchestrator corrections
7. Verify phase goal
8. Update roadmap and state
9. Update requirements
10. Commit phase completion       ← AFTER: mark PR ready if true
11. Offer next steps
```

**New steps to add:**

- **Step 1.5: PR Workflow Setup** (after validate, before discover)
  - Check `pr_workflow` config
  - If true: create branch, switch to it
  - Store branch name for later

- **Step 4.5: Open Draft PR** (after first wave completes)
  - If pr_workflow and first commit just happened
  - Push branch, open draft PR
  - Store PR number for later

- **Step 10.5: Mark PR Ready** (after commit phase completion)
  - If pr_workflow: run `gh pr ready`
  - Update offer_next to show PR URL

## Branch Naming

**Pattern:** `{type}/v{milestone}-{phase}-{slug}`

| Component | Source                                               | Example          |
| --------- | ---------------------------------------------------- | ---------------- |
| type      | Infer from phase goal (feat/fix/docs/refactor/chore) | `feat`           |
| milestone | From ROADMAP.md current milestone                    | `0.1.10`         |
| phase     | Zero-padded phase number                             | `05`             |
| slug      | Phase name, kebab-case, max 40 chars                 | `pr-integration` |

**Examples:**
- `feat/v0.1.10-05-pr-integration`
- `feat/v0.1.9-02-marketplace-distribution`
- `fix/v0.1.9-01.1-document-pr-workflow`

## PR Format

**Title:** `v{milestone} Phase {N}: {Phase Name}`
- Example: `v0.1.10 Phase 5: PR Integration`

**Body:**
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

## Testing

After implementation, verify:

1. Set `pr_workflow: true` in `.planning/config.json`
2. Run `/kata:phase-execute` on a test phase
3. Confirm:
   - Branch created with correct naming
   - Draft PR opened at first commit
   - PR marked ready when phase completes
   - PR body has correct format

---
*Pre-populated: 2026-01-22 during v0.1.9 Phase 1.1 discussion*
