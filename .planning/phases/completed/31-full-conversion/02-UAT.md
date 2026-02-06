# Phase 2: Full Conversion — UAT

## Session
- Started: 2026-02-06
- Phase: 02-full-conversion
- Context: agents/ directory deleted before UAT to verify zero dependency

## Tests

### T1: Build succeeds without agents directory
- **Expected:** `npm run build:plugin` passes with no errors, dist/plugin/ has no agents/ directory
- **Status:** PASS
- **Notes:** Build succeeds, 34/34 tests pass, dist/plugin/agents/ absent

### T2: All 19 instruction files exist in skill references
- **Expected:** Each of the 19 agents has a corresponding *-instructions.md in the correct skill's references/ directory
- **Status:** PASS
- **Notes:** All 19 mapped and verified

### T3: kata-plan-phase uses general-purpose for all subagents
- **Expected:** All 4 Task() calls use subagent_type="general-purpose" with agent-instructions wrapper
- **Status:** PASS
- **Notes:** 4 general-purpose calls confirmed

### T4: kata-add-milestone uses general-purpose for all subagents
- **Expected:** All 7 Task() calls use subagent_type="general-purpose" with agent-instructions wrapper
- **Status:** PASS
- **Notes:** 7 general-purpose calls confirmed

### T5: kata-execute-phase uses general-purpose for executor and verifier
- **Expected:** Executor spawns use general-purpose with inlined instructions; verifier spawn uses general-purpose
- **Status:** PASS
- **Notes:** All Task() calls in SKILL.md and phase-execute.md use general-purpose

### T6: Cross-skill instruction files are independent copies
- **Expected:** Skills that share agents have their own copy of instruction files (no cross-skill references)
- **Status:** PASS
- **Notes:** phase-researcher (2 copies), verifier (2 copies), codebase-mapper (2 copies), planner + plan-checker (in kata-verify-work)

### T7: Migration validation test passes without agents directory
- **Expected:** All tests pass with agents/ deleted (body comparison test removed)
- **Status:** PASS
- **Notes:** 34/34 tests pass

### T8: No remaining custom subagent_type patterns in skills
- **Expected:** Zero matches for subagent_type="kata-*" in skills/
- **Status:** PASS
- **Notes:** grep returns empty

### T9: Test suite step added to execute-phase
- **Expected:** Step 6.5 runs npm test after waves complete, skips for gap_closure
- **Status:** PASS
- **Notes:** Step 6.5 present with npm test and gap_closure skip

## Summary
- Total: 9
- Pass: 9
- Fail: 0
- Pending: 0

All tests passed. agents/ directory successfully deleted with zero impact on build, tests, or skill functionality.
