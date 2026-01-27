---
phase: 03
plan: 01
subsystem: github-integration
tags: [github, issues, phases, milestones, gh-cli]
dependency-graph:
  requires: [02.2-02] # kata-adding-milestones skill
  provides: [phase-issue-creation]
  affects: [03-02, 04-*] # tests, plan sync
tech-stack:
  added: []
  patterns: [non-blocking-operations, temp-file-body-pattern, idempotent-label-creation]
key-files:
  created: []
  modified:
    - skills/kata-adding-milestones/SKILL.md
    - skills/kata-adding-milestones/references/github-mapping.md
decisions:
  - key: phase-issue-timing
    choice: "Create during add-milestone (Phase 9.5)"
    rationale: "Phase content from ROADMAP.md available; milestone number available from Phase 5.5"
  - key: body-construction
    choice: "Use --body-file with temp file"
    rationale: "Handles special characters in phase goals safely"
metrics:
  duration: "4 min"
  completed: 2026-01-26
---

# Phase 03 Plan 01: Add Phase Issue Creation Summary

Phase issues created with `phase` label when milestone created, assigned to GitHub Milestone, respecting issueMode config.

## What Was Built

Added Phase 9.5 (Create Phase Issues) to `kata-adding-milestones` skill:

1. **issueMode Config Check** - Respects `github.issueMode` setting (auto/ask/never)
2. **Label Creation** - Creates "phase" label idempotently with `--force` flag
3. **Milestone Number Lookup** - Retrieves milestone number for issue assignment
4. **ROADMAP Parsing** - Extracts phases within current milestone section using awk/sed
5. **Issue Existence Check** - Skips creation if phase issue already exists (idempotent)
6. **Issue Creation** - Creates issues with goal, success criteria, milestone assignment

## Key Files Modified

| File | Changes |
| ---- | ------- |
| `skills/kata-adding-milestones/SKILL.md` | Added Phase 9.5 with ROADMAP parsing, issue creation logic |
| `skills/kata-adding-milestones/references/github-mapping.md` | Updated mapping table; added Phase 9.5 flow documentation |

## Commits

| Hash | Message |
| ---- | ------- |
| 511846f | feat(03-01): add Phase 9.5 for phase issue creation |
| 9a56b74 | docs(03-01): update github-mapping.md for phase issues |

## Implementation Details

### Issue Body Template

```markdown
## Goal
{phase goal from ROADMAP.md}

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Requirements
{requirement IDs, if any}

## Plans
<!-- Checklist added by /kata:planning-phases (Phase 4) -->
_Plans will be added after phase planning completes._
```

### Key Patterns Used

1. **Temp file for body** - `--body-file /tmp/phase-issue-body.md` handles special characters
2. **Idempotent label** - `gh label create --force` succeeds whether label exists or not
3. **Non-blocking operations** - All GitHub operations warn but don't stop milestone flow

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All 10 verification checks passed:
- [x] SKILL.md contains "Phase 9.5: Create Phase Issues"
- [x] SKILL.md includes issueMode check (auto/ask/never)
- [x] SKILL.md includes label creation with --force
- [x] SKILL.md includes milestone number lookup
- [x] SKILL.md includes ROADMAP parsing with awk/sed commands
- [x] SKILL.md assigns PHASE_GOAL, SUCCESS_CRITERIA_AS_CHECKLIST, REQUIREMENT_IDS
- [x] SKILL.md includes idempotent issue existence check
- [x] SKILL.md uses --body-file pattern
- [x] github-mapping.md mapping table shows add-milestone for Phase
- [x] github-mapping.md has Phase 9.5 flow documentation

## Success Criteria Met

1. **Phase issues created with `phase` label when milestone created** - Implemented in Phase 9.5
2. **Issue body includes phase goal and success criteria from ROADMAP.md** - ROADMAP parsing extracts both
3. **Phase issues assigned to corresponding GitHub Milestone** - `--milestone "v${VERSION}"` in create command
4. **Issues created respecting `github.issueMode` config setting** - Auto/ask/never check at start of Phase 9.5

## Next Phase Readiness

**Ready for 03-02:** Tests and integration documentation
- Phase issue creation logic complete
- Documentation updated
- No blockers

## Notes for Future Phases

- Phase 4 (Plan Sync) will add plan checklists to phase issue bodies
- Phase 5 (PR Integration) will link PRs to phase issues with "Closes #X"
