# Plan: Move UAT Walkthrough from Complete Milestone to Audit Milestone

## Context

The milestone demo walkthrough (UAT session) currently lives in `kata-complete-milestone` as step 3. Discovering issues at completion time creates friction in the release flow. Moving it to `kata-audit-milestone` lets users catch issues earlier, when the natural response is "plan more work" rather than "delay the release."

The gap handoff problem: milestone-level UAT gaps need to become phase work. The existing `kata-plan-milestone-gaps` skill already reads `MILESTONE-AUDIT.md` gaps and creates new phases from them. Rather than building a new pipeline, UAT gaps merge into the audit file so the existing flow handles them.

## Changes

### 1. `skills/kata-audit-milestone/SKILL.md` — add UAT walkthrough

Add **step 8** after step 7 (Present Results), before `<offer_next>`.

**Step 8: Offer UAT Walkthrough**

Use AskUserQuestion:
- header: "UAT Walkthrough"
- question: "Would you like a complete walk-through UAT session?"
- options:
  - "Full walkthrough" — walk through all user-observable deliverables
  - "Integration only" — focus on cross-phase flows
  - "Skip" — done with audit

**If Skip:** Proceed to `<offer_next>`.

**If walkthrough chosen:**

1. Read all phase SUMMARY.md files in milestone scope
2. Extract user-observable deliverables (features, behaviors, UI changes)
3. Synthesize demo scenarios:
   - "Full walkthrough": all user-observable outcomes across phases
   - "Integration only": cross-phase touchpoints and E2E flows
4. Create `.planning/v{version}-UAT.md` using the existing UAT template format from `skills/kata-verify-work/references/UAT-template.md` — adapted for milestone scope:
   - `milestone: {version}` instead of `phase:`
   - `source:` lists all phase SUMMARY.md files
5. Walk through scenarios one at a time (yes/next = pass, anything else = issue with severity inferred)
6. Update UAT.md after each response
7. On completion: commit UAT.md

**If all scenarios pass:** Proceed to `<offer_next>` (audit status unchanged).

**If issues found — merge gaps into audit file:**

1. Append UAT gap entries to `MILESTONE-AUDIT.md` under `gaps.flows` (for E2E breaks) or `gaps.requirements` (for unmet requirements), using the same YAML structure the audit already uses
2. Update MILESTONE-AUDIT.md frontmatter: `status: gaps_found` (if it was `passed` or `tech_debt`)
3. Update UAT.md summary counts

Then use AskUserQuestion:
- header: "Issues Found"
- question: "{N} issues found during walkthrough. How to proceed?"
- options:
  - "Plan fix phases" — route to `/kata-plan-milestone-gaps` (reads the updated audit file)
  - "Accept as known issues" — document in UAT.md, revert MILESTONE-AUDIT.md status to original
  - "Stop" — halt for manual intervention

Update `<offer_next>` to mention UAT file when it exists.

Update `<success_criteria>` to add:
- `[ ] UAT walkthrough offered`
- `[ ] v{version}-UAT.md created (if walkthrough chosen)`
- `[ ] MILESTONE-AUDIT.md updated with UAT gaps (if issues found)`

### 2. `skills/kata-complete-milestone/SKILL.md` — remove UAT walkthrough

Remove step 3 ("Milestone demo walkthrough (optional)") entirely (lines 227-265). This includes the AskUserQuestion for "Demo Walkthrough" and all sub-logic for scenario creation, issue handling, and UAT.md generation.

Renumber subsequent steps (current step 4 "Gather stats" becomes step 3, etc.).

### 3. `.docs/diagrams/FLOWS.md` — update diagrams

**Update Complete Milestone diagram (section 8, lines 442-505):**
- Remove G3 walkthrough branch (nodes: G3, DEMO, G3_ISS, ASK_FIX, BACK, DOC_ISS)
- Connect CONFIRM directly to STATS

**Add new Audit Milestone diagram (new section, before section 8):**
- START → Resolve milestone scope
- Read phase verifications
- Spawn integration checker
- Collect and aggregate results
- Check requirements coverage
- Create MILESTONE-AUDIT.md
- Present results (route by status)
- UAT walkthrough decision gate
- If UAT chosen: scenario walkthrough loop → issues found?
  - Yes → merge gaps into audit → offer plan-milestone-gaps
  - No → return to offer_next
- offer_next routing (passed/gaps_found/tech_debt)

## Files Modified

| File | Change |
|------|--------|
| `skills/kata-audit-milestone/SKILL.md` | Add step 8 (UAT walkthrough), update offer_next, update success_criteria |
| `skills/kata-complete-milestone/SKILL.md` | Remove step 3 (walkthrough), renumber steps |
| `.docs/diagrams/FLOWS.md` | Simplify Complete Milestone diagram, add Audit Milestone diagram |

## Verification

1. Read both SKILL.md files after edits — walkthrough logic exists only in audit-milestone
2. Confirm complete-milestone step numbering is sequential after removal
3. Confirm FLOWS.md diagram syntax is valid (no dangling node references)
4. Confirm the gap format appended to MILESTONE-AUDIT.md matches what `kata-plan-milestone-gaps` step 1 parses
