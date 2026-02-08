---
phase: 38-template-overrides
plan: 01
subsystem: templates
tags: [templates, schema, resolution, bash]

# Dependency graph
requires:
  - phase: 37-preferences-infrastructure
    provides: read-pref.sh resolution pattern
provides:
  - Five standalone template files with schema comments
  - resolve-template.sh project-override-first resolution script
affects: [38-template-overrides, template-drift, project-overrides]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "kata-template-schema HTML comment for drift detection"
    - "resolve-template.sh project-override-first resolution"

key-files:
  created:
    - skills/kata-complete-milestone/references/changelog-entry.md
    - skills/kata-plan-phase/references/plan-template.md
    - skills/kata-verify-work/references/verification-report.md
    - skills/kata-execute-phase/scripts/resolve-template.sh
  modified:
    - skills/kata-complete-milestone/references/changelog-generator.md
    - skills/kata-plan-phase/references/planner-instructions.md
    - skills/kata-verify-work/references/verifier-instructions.md
    - skills/kata-execute-phase/references/summary-template.md
    - skills/kata-verify-work/references/UAT-template.md

key-decisions:
  - "Templates stay in owning skill's references/ directory, not centralized"
  - "Schema comment uses YAML-like format inside HTML comment block"
  - "resolve-template.sh placed in kata-execute-phase/scripts/ alongside find-phase.sh"

patterns-established:
  - "kata-template-schema comment format: required-fields, optional-fields, version"
  - "Template extraction: replace inline content with @-reference to standalone file"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 38 Plan 01: Template Extraction and Resolution Summary

**Extracted 3 inline templates into standalone files, added schema comments to all 5 templates, and created resolve-template.sh resolution script**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T14:02:00Z
- **Completed:** 2026-02-08T14:05:35Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Extracted changelog-entry.md, plan-template.md, and verification-report.md from their parent reference files into standalone templates
- Added kata-template-schema HTML comments with required-fields and optional-fields to all 5 template files
- Created resolve-template.sh with project-override-first, plugin-default-second resolution
- Replaced inline template content with @-references in changelog-generator.md, planner-instructions.md, and verifier-instructions.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract three inline templates and add schema comments** - `f1c5eb6` (feat)
2. **Task 2: Create resolve-template.sh resolution script** - `c22ce42` (feat)

## Files Created/Modified
- `skills/kata-complete-milestone/references/changelog-entry.md` - Standalone changelog format and commit type mapping template
- `skills/kata-plan-phase/references/plan-template.md` - Standalone PLAN.md structure template
- `skills/kata-verify-work/references/verification-report.md` - Standalone VERIFICATION.md template
- `skills/kata-execute-phase/scripts/resolve-template.sh` - Template resolution script
- `skills/kata-complete-milestone/references/changelog-generator.md` - Replaced inline format/mapping with @-reference
- `skills/kata-plan-phase/references/planner-instructions.md` - Replaced inline plan structure with @-reference
- `skills/kata-verify-work/references/verifier-instructions.md` - Replaced inline verification template with @-reference
- `skills/kata-execute-phase/references/summary-template.md` - Added schema comment
- `skills/kata-verify-work/references/UAT-template.md` - Added schema comment

## Decisions Made
- Templates stay in owning skill's references/ directory per research recommendation
- Schema comment format: `<!-- kata-template-schema ... -->` with required-fields, optional-fields, version
- resolve-template.sh placed in kata-execute-phase/scripts/ alongside existing find-phase.sh

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness
- All 5 templates are standalone with schema comments, ready for drift detection hook (Plan 02)
- resolve-template.sh ready to be wired into skill orchestrators (Plan 02)
- No blockers

---
*Phase: 38-template-overrides*
*Completed: 2026-02-08*
