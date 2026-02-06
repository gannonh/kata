---
phase: 02-full-conversion
plan: "06"
started: 2026-02-06T00:24:57Z
completed: 2026-02-06T00:28:35Z
duration: ~4 min
status: complete
commits:
  - hash: 81188c4
    message: "feat(02-06): update kata-research-phase to general-purpose with inlined instructions"
  - hash: c838416
    message: "feat(02-06): update reference files to general-purpose with inlined instructions"
---

# Plan 02-06: Cross-Skill Reference and Consumer Updates

## Accomplishments

### Task 1: kata-research-phase Migration
- Copied `phase-researcher-instructions.md` from `kata-plan-phase/references/` to `kata-research-phase/references/`
- Added instruction loading step (3.5) before Task() calls
- Converted 2 Task() calls from `kata-phase-researcher` to `general-purpose` with `<agent-instructions>` wrapper

### Task 2: Reference File Updates
- **verify-work.md**: Converted 3 Task() calls (2 planner, 1 plan-checker) to `general-purpose` with inlined instructions
- **phase-execute.md**: Converted 1 verifier Task() call to `general-purpose` with inlined instructions
- **project-analyze.md**: Converted all 4 codebase-mapper Task() calls to `general-purpose` with inlined instructions
- Copied instruction files locally to each consuming skill's `references/` directory

## Files Modified

- `skills/kata-research-phase/SKILL.md`
- `skills/kata-research-phase/references/phase-researcher-instructions.md` (new)
- `skills/kata-verify-work/references/verify-work.md`
- `skills/kata-verify-work/references/planner-instructions.md` (new)
- `skills/kata-verify-work/references/plan-checker-instructions.md` (new)
- `skills/kata-execute-phase/references/phase-execute.md`
- `skills/kata-execute-phase/references/verifier-instructions.md` (new)
- `skills/kata-map-codebase/references/project-analyze.md`
- `skills/kata-map-codebase/references/codebase-mapper-instructions.md` (new)

## Verification

- Zero `subagent_type="kata-*"` patterns in any skills/ file
- Plugin build succeeds
- All instruction files identical to their source copies

## Deviations

None.
