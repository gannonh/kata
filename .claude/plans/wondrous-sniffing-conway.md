# Plan: README Documentation Support (Hybrid Approach)

## Summary

Implement README documentation at two checkpoints:
1. **Phase completion (`kata-executing-phases`):** Offer README review before marking PR ready
2. **Milestone completion (`kata-completing-milestones`):** Offer final README review before release commit

Also add PR workflow documentation to README directly (since Phase 5 is already planned).

## Changes

### 1. Update kata-executing-phases SKILL.md

**File:** `skills/kata-executing-phases/SKILL.md`

**Add Step 10.25** between "Commit phase completion" (step 10) and "Mark PR Ready" (step 10.5):

```markdown
10.25. **Review Documentation (Non-blocking, pr_workflow only):**

   If PR_WORKFLOW=true, before marking PR ready, offer README review:

   Use AskUserQuestion:
   - header: "README Review"
   - question: "This phase may have added user-facing features. Review README before marking PR ready?"
   - options:
     - "Yes, I'll update README" — Pause for user edits, wait for "continue"
     - "Skip" — Proceed to mark PR ready
     - "Show README" — Display current README, then ask if updates needed

   **If user chooses to update:**
   ```
   Update README.md with any documentation for this phase's features.
   Say "continue" when ready to mark the PR ready.
   ```

   After README updates (if any), stage and commit:
   ```bash
   git add README.md
   git commit -m "docs({phase}): update README for phase features"
   ```

   *Non-blocking: phase completion continues regardless of choice.*
```

**Also update phase-execute.md reference** with corresponding step.

### 2. Update kata-completing-milestones SKILL.md

**File:** `skills/kata-completing-milestones/SKILL.md`

**Add Step 6.5** between "Update PROJECT.md" (step 6) and "Commit and tag" (step 7):

```markdown
6.5. **Review Documentation (Non-blocking):**

   Before committing, offer final README review:

   Use AskUserQuestion:
   - header: "Final README Review"
   - question: "Review README.md before completing milestone v{{version}}?"
   - options:
     - "Yes, I'll review now" — Pause for user review, wait for "continue"
     - "Skip for now" — Proceed directly to commit
     - "Show README" — Display content, ask if accurate

   **If "Yes, I'll review now":**
   ```
   Review README.md for the complete v{{version}} milestone.
   Ensure all shipped features are documented.
   Say "continue" when ready to proceed.
   ```

   **If "Show README":**
   Display README.md, then ask: "Does this look accurate? (yes / needs updates)"

   **If "Skip" or review complete:** Proceed to Step 7.

   *Non-blocking: milestone completion continues regardless of choice.*
```

**Also update milestone-complete.md reference** with `<step name="review_documentation">`.

### 3. Add PR Workflow Documentation to README.md

**File:** `README.md`

**Add "### GitHub PR Workflow" subsection** under "## Configuration" (after Execution section ~line 567):

```markdown
### GitHub PR Workflow

| Setting       | Options       | Default | What it controls                           |
| ------------- | ------------- | ------- | ------------------------------------------ |
| `pr_workflow` | `true/false`  | `false` | Create PRs for phase execution             |

When enabled (`pr_workflow: true`), phase execution creates GitHub PRs:

1. **Branch creation** at phase start: `{type}/v{milestone}-{phase}-{slug}`
2. **Draft PR** after first wave with phase goal, plans checklist, and issue linking
3. **PR marked ready** when phase completes

**PR title format:** `v{milestone} Phase {N}: {Phase Name}`

**Works with GitHub Integration:** Enable both `github.enabled: true` and `pr_workflow: true` for full integration. Issues track planning, PRs track execution.
```

**Add cross-reference** in Core Settings section after the settings table.

## Files Modified

| File | Change |
|------|--------|
| `skills/kata-executing-phases/SKILL.md` | Add Step 10.25 (README review before PR ready) |
| `skills/kata-executing-phases/references/phase-execute.md` | Add review_documentation step |
| `skills/kata-completing-milestones/SKILL.md` | Add Step 6.5 (final README review) |
| `skills/kata-completing-milestones/references/milestone-complete.md` | Add review_documentation step |
| `README.md` | Add GitHub PR Workflow section |

## Verification

```bash
# kata-executing-phases has README review
grep "Review Documentation" skills/kata-executing-phases/SKILL.md

# kata-completing-milestones has README review
grep "Review Documentation" skills/kata-completing-milestones/SKILL.md

# README has PR workflow docs
grep "GitHub PR Workflow" README.md
```

## Design Rationale

**Two checkpoints:**
- **Phase completion:** Catches README updates while the feature work is fresh (before PR marked ready)
- **Milestone completion:** Final pass to ensure complete milestone documentation (before release)

**Both are non-blocking:** User can skip either review without stopping the workflow. This keeps automation smooth while offering documentation checkpoints.

**Step numbering:** Using decimal steps (10.25, 6.5) follows Kata's insertion pattern and keeps existing step numbers stable.
