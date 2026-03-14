---
id: T01
parent: S06
milestone: M003
provides:
  - linear-crosslink.test.ts with 12 test cases covering shouldCrossLink, buildLinearReferencesSection, and composePRBody integration
key_files:
  - src/resources/extensions/kata/tests/linear-crosslink.test.ts
duration: 10min
verification_result: pass
completed_at: 2026-03-13T12:35:00Z
---

# T01: Write failing tests for Linear cross-linking helpers

**12 tests pinning shouldCrossLink gate, reference section formatting, and composePRBody Linear integration — initially MODULE_NOT_FOUND, all passing after T02**

## What Happened

Created `linear-crosslink.test.ts` with tests for the gate function (5 cases covering true/false combinations of linear_link and workflow mode), reference section builder (4 cases including single, multiple, empty, and undefined identifiers), and composePRBody integration (3 cases verifying Linear Issues section appears only when linearReferences are provided).

## Deviations
None.

## Files Created/Modified
- `src/resources/extensions/kata/tests/linear-crosslink.test.ts` — 12 test cases
