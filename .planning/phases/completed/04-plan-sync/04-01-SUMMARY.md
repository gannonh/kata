---
phase: 04
plan: 01
subsystem: github-integration
tags: [github, issues, planning, checklist, gh-cli]
dependency-graph:
  requires: [03-01] # Phase issue creation
  provides: [plan-checklist-sync]
  affects: [04-02] # Plan completion sync
tech-stack:
  added: []
  patterns: [non-blocking-operations, temp-file-body-pattern, awk-multiline-manipulation]
key-files:
  created: []
  modified:
    - skills/kata-planning-phases/SKILL.md
decisions:
  - key: github-update-timing
    choice: "After step 13 (Present Final Status), before offer_next"
    rationale: "Plans are finalized by step 13; GitHub update is a side effect before user sees results"
  - key: checklist-source
    choice: "Extract from PLAN.md objective section"
    rationale: "Objective provides concise description; fallback to filename if extraction fails"
metrics:
  duration: "1 min"
  completed: 2026-01-26
---

# Phase 04 Plan 01: Add GitHub Issue Update to kata-planning-phases Summary

Plan checklist added to phase issues after planning completes via Step 14 in kata-planning-phases skill.

## What Was Built

Added Step 14 (Update GitHub Issue with Plan Checklist) to `kata-planning-phases` skill:

1. **Config Guard Check** - Validates `github.enabled=true` and `issueMode != never` before proceeding
2. **Phase Issue Lookup** - Finds issue by milestone version and `phase` label using `gh issue list`
3. **Plan Checklist Generation** - Iterates PLAN.md files, extracts plan number and objective text
4. **Issue Body Update** - Uses awk to replace placeholder text with actual checklist
5. **Non-blocking Pattern** - All failures warn but do not stop planning workflow

## Key Files Modified

| File | Changes |
| ---- | ------- |
| `skills/kata-planning-phases/SKILL.md` | Added Step 14 with full GitHub integration logic; updated success criteria; added GitHub status to offer_next |

## Commits

| Hash | Message |
| ---- | ------- |
| ded42be | feat(04-01): add GitHub issue update step to kata-planning-phases |
| eb20e56 | feat(04-01): update success criteria and offer_next for GitHub status |

## Implementation Details

### Step 14 Flow

```
1. Check github.enabled and issueMode config
   ├─ Skip if disabled or issueMode=never
   └─ Continue if enabled

2. Find phase issue
   ├─ Get VERSION from ROADMAP.md
   ├─ Query gh issue list with --label "phase" --milestone "v${VERSION}"
   └─ Match title starting with "Phase ${PHASE}:"

3. Build plan checklist
   ├─ List PLAN.md files in phase directory
   ├─ Extract plan number from filename
   └─ Extract objective from <objective> tag (60 char max)

4. Update issue body
   ├─ Read current body with gh issue view
   ├─ Use awk to insert checklist after ## Plans section
   ├─ Remove placeholder text
   └─ Write via --body-file for special char safety

5. Display result in offer_next if successful
```

### Key Patterns Used

1. **Config guard pattern** - Same as Phase 3: `grep -o` to extract JSON values
2. **Temp file for body** - `--body-file /tmp/phase-issue-body.md` handles special characters
3. **awk multiline manipulation** - Replace placeholder, insert checklist in correct position
4. **Non-blocking operations** - All GitHub operations warn but don't stop workflow

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All 4 verification checks passed:
- [x] SKILL.md contains "## 14." (Step 14 header)
- [x] SKILL.md includes `gh issue edit` command
- [x] SKILL.md includes `GITHUB_ENABLED` config check
- [x] SKILL.md uses `--body-file` pattern

## Success Criteria Met

1. **Step 14 added between step 13 and offer_next** - Inserted at line 473
2. **Config guard checks github.enabled and issueMode** - Both validated at step entry
3. **Phase issue lookup by milestone and label** - Uses gh issue list with jq filter
4. **Plan checklist built from PLAN.md files in phase directory** - Iterates with for loop
5. **Issue body updated with checklist (replacing placeholder)** - awk handles replacement
6. **Uses --body-file pattern for safe body updates** - printf to temp file
7. **Non-blocking error handling** - Warn statements throughout with continue logic
8. **Success criteria updated** - Added GitHub issue condition
9. **offer_next shows GitHub status when applicable** - Conditional display added

## Next Phase Readiness

**Ready for 04-02:** Plan completion sync in executor
- Phase issue update logic established
- Checklist format defined (- [ ] Plan NN: objective)
- Non-blocking pattern proven
- No blockers

## Notes for Future Plans

- Plan 04-02 will add checkbox toggling when plans complete
- Same phase issue lookup pattern can be reused
- Consider adding issue link to SUMMARY.md after plan completion
