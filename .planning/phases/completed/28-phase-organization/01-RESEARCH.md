# Phase 1: Phase Organization - Research

**Researched:** 2026-02-03
**Domain:** Kata internal architecture (prompt files, directory structure, phase state management)
**Confidence:** HIGH

## Summary

This phase introduces directory-based phase state management: organizing phase directories under `pending/`, `active/`, and `completed/` subdirectories within `.planning/phases/`. Additionally, it adds completion validation requiring PLAN.md + SUMMARY.md (and VERIFICATION.md for non-gap phases) before a phase can be considered complete.

The primary challenge is the breadth of files that reference `.planning/phases/` with flat directory lookups. At least 34 source files (skills, agents, references, and tests) use patterns like `ls .planning/phases/${PHASE}-*` or `for phase_dir in .planning/phases/*/`. All must be updated to search within subdirectories or accept an expanded path structure.

**Primary recommendation:** Update phase discovery patterns across all 34+ files to search `pending/`, `active/`, and `completed/` subdirectories. Add a completion validation gate to `kata-execute-phase` (step 7-8 area) that checks for required artifacts before marking a phase complete. The existing `.archive/` directory (used for cross-milestone archived phases) remains separate from `completed/` (within-milestone completed phases).

## Standard Stack

No external libraries required. This is a pure prompt-engineering and directory-structure change within the Kata meta-prompting system.

### Core
| Component                       | Purpose                             | Why Standard                                   |
| ------------------------------- | ----------------------------------- | ---------------------------------------------- |
| Bash `ls`, `mv`, `mkdir`        | Directory operations within prompts | Already used throughout Kata skills/agents     |
| Bash `test -f` / `ls *-PLAN.md` | File existence validation           | Consistent with existing verification patterns |
| Grep/sed for frontmatter        | Extracting phase metadata           | Already used in kata-verifier, kata-executor   |

### Supporting
| Pattern                                                     | Purpose                            | When to Use                                            |
| ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `find .planning/phases -name "${PHASE}-*" -type d`          | Cross-subdirectory phase discovery | When a skill needs to find a phase regardless of state |
| `ls .planning/phases/{pending,active,completed}/${PHASE}-*` | State-aware phase lookup           | When state matters (e.g., only look in active)         |

## Architecture Patterns

### Current Directory Structure
```
.planning/phases/
├── .archive/           # Cross-milestone archived phases (from complete-milestone)
├── 01-phase-name/      # All phases flat, regardless of state
├── 02-phase-name/
└── 03-phase-name/
```

### Target Directory Structure
```
.planning/phases/
├── .archive/           # Cross-milestone archived phases (unchanged)
├── pending/            # Phases not yet started (no plans executed)
│   └── 03-feature-x/
├── active/             # Currently executing phase (0-1 phases)
│   └── 02-auth-system/
└── completed/          # Phases with all plans executed + validated
    └── 01-core-models/
```

### Pattern 1: Universal Phase Discovery
**What:** A standardized bash snippet that finds a phase directory regardless of which subdirectory it's in.
**When to use:** Every skill/agent that needs to locate a phase by number.
**Example:**
```bash
# Find phase directory across all state subdirectories
find_phase_dir() {
  local PHASE="$1"
  local PADDED=$(printf "%02d" "$PHASE" 2>/dev/null || echo "$PHASE")
  # Search in order: active first (most common lookup), then pending, then completed
  for state in active pending completed; do
    local dir=$(ls -d .planning/phases/${state}/${PADDED}-* .planning/phases/${state}/${PHASE}-* 2>/dev/null | head -1)
    [ -n "$dir" ] && echo "$dir" && return 0
  done
  # Fallback: check flat (migration compatibility)
  ls -d .planning/phases/${PADDED}-* .planning/phases/${PHASE}-* 2>/dev/null | head -1
}
PHASE_DIR=$(find_phase_dir "$PHASE_ARG")
```

### Pattern 2: Phase State Transitions
**What:** Moving phase directories between state subdirectories at lifecycle events.
**When to use:** At plan-phase (pending -> active), execute-phase start (pending -> active), execute-phase complete + verified (active -> completed).
**Example:**
```bash
# Move phase to new state
move_phase_state() {
  local PHASE_DIR="$1"
  local NEW_STATE="$2"
  local DIR_NAME=$(basename "$PHASE_DIR")
  mkdir -p ".planning/phases/${NEW_STATE}"
  mv "$PHASE_DIR" ".planning/phases/${NEW_STATE}/${DIR_NAME}"
  echo ".planning/phases/${NEW_STATE}/${DIR_NAME}"
}
```

### Pattern 3: Completion Validation
**What:** Check required artifacts before allowing a phase to be marked complete.
**When to use:** Before moving a phase to `completed/` state.
**Example:**
```bash
# Validate phase completion requirements
validate_phase_completion() {
  local PHASE_DIR="$1"
  local ERRORS=""

  # Check PLAN.md exists
  local PLAN_COUNT=$(ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$PLAN_COUNT" -eq 0 ] && ERRORS="${ERRORS}\n- No PLAN.md files found"

  # Check SUMMARY.md exists for each plan
  for plan in "$PHASE_DIR"/*-PLAN.md; do
    local plan_id=$(basename "$plan" | sed 's/-PLAN\.md$//')
    [ ! -f "$PHASE_DIR/${plan_id}-SUMMARY.md" ] && ERRORS="${ERRORS}\n- Missing SUMMARY.md for ${plan_id}"
  done

  # Check VERIFICATION.md for non-gap phases
  # Gap phases have "gap_closure: true" in plan frontmatter
  local IS_GAP=$(grep -l "gap_closure: true" "$PHASE_DIR"/*-PLAN.md 2>/dev/null | head -1)
  if [ -z "$IS_GAP" ]; then
    [ ! -f "$PHASE_DIR"/*-VERIFICATION.md ] && ERRORS="${ERRORS}\n- Missing VERIFICATION.md (required for non-gap phases)"
  fi

  if [ -n "$ERRORS" ]; then
    echo "INCOMPLETE:${ERRORS}"
    return 1
  fi
  echo "COMPLETE"
  return 0
}
```

### Anti-Patterns to Avoid
- **Hardcoded flat paths:** Never use `.planning/phases/${PHASE}-*` without searching subdirectories. Always use the universal discovery pattern.
- **Moving .archive:** The `.archive/` directory is for cross-milestone archival (managed by `kata-complete-milestone`). Do NOT conflate it with `completed/`. They serve different purposes.
- **Multiple active phases:** Enforce 0-1 phases in `active/` at any time. Multiple active phases indicates a workflow error.

## Don't Hand-Roll

| Problem            | Don't Build                  | Use Instead                               | Why                                                        |
| ------------------ | ---------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Phase discovery    | Custom per-file lookup logic | Single universal `find_phase_dir` pattern | 34+ files need the same logic; copy-paste leads to drift   |
| State validation   | Ad-hoc file checks           | `validate_phase_completion` pattern       | Consistent validation across execute-phase and verify-work |
| Directory creation | Manual mkdir in each skill   | Create all three dirs at project init     | Avoid mkdir -p scattered throughout                        |

**Key insight:** The universal phase discovery pattern must be identical across all 34+ files. Any divergence creates bugs where one skill finds the phase and another doesn't.

## Common Pitfalls

### Pitfall 1: Backward Compatibility During Migration
**What goes wrong:** Existing projects have phases in the flat structure. After updating skills, they can't find their phases.
**Why it happens:** Skills search only in subdirectories but phases haven't been migrated.
**How to avoid:** The universal discovery pattern includes a fallback that checks the flat `.planning/phases/` directory. This provides backward compatibility for unmigrated projects.
**Warning signs:** "No phase directory matching" errors in projects that have phases.

### Pitfall 2: .archive Confusion
**What goes wrong:** Someone moves completed phases into `.archive/` instead of `completed/`, or vice versa.
**Why it happens:** Both hold "done" phases but serve different purposes.
**How to avoid:** Clear naming and documentation. `.archive/` = cross-milestone historical archive (managed by complete-milestone). `completed/` = current-milestone completed phases.
**Warning signs:** Phases disappearing from milestone view, archive growing during execution.

### Pitfall 3: Race Conditions with Active Directory
**What goes wrong:** Two concurrent operations both try to move phases into or out of `active/`.
**Why it happens:** Kata supports parallel plan execution within a phase. If phase state transitions happen during execution, directory moves could conflict.
**How to avoid:** Phase state transitions should only happen at orchestrator level (kata-execute-phase skill), never within subagents (kata-executor). The orchestrator is single-threaded.
**Warning signs:** "directory not found" errors during parallel execution.

### Pitfall 4: Phase Directory References in PLAN.md and SUMMARY.md
**What goes wrong:** PLAN.md files contain hardcoded references like `.planning/phases/01-name/01-01-PLAN.md` that break when the phase moves between states.
**Why it happens:** Plans are created when the phase is in `pending/` or `active/`, but the directory moves to `completed/` after execution.
**How to avoid:** Use relative paths within plans (files within the same phase directory). For cross-references, use the phase discovery pattern. SUMMARY.md already uses relative references. PLAN.md `@` references are resolved at load time, so the current path is correct when loaded.
**Warning signs:** Broken `@` references in plans loaded after phase movement.

### Pitfall 5: Incomplete File List
**What goes wrong:** A few files are missed in the update, causing some skills to work and others to fail.
**Why it happens:** 34+ files need updating; it's easy to miss one.
**How to avoid:** Use the complete file inventory (below) as a checklist during planning.

## Code Examples

### Complete File Inventory Requiring Updates

**Skills (12 files):**
1. `skills/kata-plan-phase/SKILL.md` — Step 4 (ensure phase dir), step 5 (research lookup)
2. `skills/kata-execute-phase/SKILL.md` — Step 1.5 (branch setup), step 2-4 (plan discovery)
3. `skills/kata-track-progress/SKILL.md` — Step "position" and "route" (phase dir listing)
4. `skills/kata-verify-work/SKILL.md` — Phase directory lookup
5. `skills/kata-research-phase/SKILL.md` — Phase directory lookup
6. `skills/kata-add-phase/SKILL.md` — Phase creation (new phases go to `pending/`)
7. `skills/kata-remove-phase/SKILL.md` — Phase directory deletion
8. `skills/kata-insert-phase/SKILL.md` — Phase creation for decimal phases
9. `skills/kata-pause-work/SKILL.md` — Phase directory lookup
10. `skills/kata-check-issues/SKILL.md` — Phase scanning for issue linkage
11. `skills/kata-audit-milestone/SKILL.md` — Phase scanning for milestone audit
12. `skills/kata-plan-milestone-gaps/SKILL.md` — Phase scanning

**Skill References (9 files):**
1. `skills/kata-execute-phase/references/phase-execute.md` — validate_phase step
2. `skills/kata-execute-phase/references/summary-template.md` — path references
3. `skills/kata-execute-phase/references/execute-plan.md` — path references
4. `skills/kata-discuss-phase/references/context-template.md` — phase dir references
5. `skills/kata-discuss-phase/references/phase-discuss.md` — phase dir references
6. `skills/kata-verify-work/references/verify-work.md` — phase dir references
7. `skills/kata-verify-work/references/UAT-template.md` — phase dir references
8. `skills/kata-resume-work/references/resume-project.md` — phase dir references
9. `skills/kata-complete-milestone/references/milestone-complete.md` — phase scanning

**Agents (4 files):**
1. `agents/kata-planner.md` — Phase directory lookup and plan creation
2. `agents/kata-plan-checker.md` — Phase directory lookup for plan verification
3. `agents/kata-phase-researcher.md` — Phase directory lookup for research output
4. `agents/kata-integration-checker.md` — Cross-phase scanning

**Other (2 files):**
1. `CLAUDE.md` — Phase directory reference in examples
2. `.planning/codebase/ARCHITECTURE.md` — Architecture documentation

### New Phase Creation (kata-add-phase, kata-roadmapper)
```bash
# New phases always start in pending/
mkdir -p ".planning/phases/pending/${PHASE}-${PHASE_NAME}"
PHASE_DIR=".planning/phases/pending/${PHASE}-${PHASE_NAME}"
```

### Phase Activation (kata-execute-phase, start of execution)
```bash
# Move from pending to active when execution begins
CURRENT_STATE=$(dirname "$PHASE_DIR" | xargs basename)
if [ "$CURRENT_STATE" = "pending" ]; then
  PHASE_DIR=$(move_phase_state "$PHASE_DIR" "active")
fi
```

### Phase Completion (kata-execute-phase, after verification passes)
```bash
# Validate and move from active to completed
if validate_phase_completion "$PHASE_DIR"; then
  PHASE_DIR=$(move_phase_state "$PHASE_DIR" "completed")
fi
```

### Project Initialization (kata-new-project, kata-add-milestone)
```bash
# Create state subdirectories at project init
mkdir -p .planning/phases/pending
mkdir -p .planning/phases/active
mkdir -p .planning/phases/completed
```

## State of the Art

| Old Approach             | Current Approach                                | When Changed        | Impact                                 |
| ------------------------ | ----------------------------------------------- | ------------------- | -------------------------------------- |
| Flat `.planning/phases/` | State subdirectories `pending/active/completed` | v1.5.0 (this phase) | Phase state visible at directory level |
| No completion validation | PLAN.md + SUMMARY.md + VERIFICATION.md checks   | v1.5.0 (this phase) | Prevents premature phase completion    |

**Key context on `.archive/`:** The `.planning/phases/.archive/` directory already exists and contains phases from previous milestones (moved there by `kata-complete-milestone`). This is a different lifecycle event from within-milestone completion. `.archive/` = historical record after milestone ships. `completed/` = phase done within current milestone.

## Open Questions

1. **Migration path for existing projects**
   - What we know: Existing projects have flat `.planning/phases/` structure. The universal discovery pattern includes a fallback for flat dirs.
   - What's unclear: Should we provide an explicit migration command, or just rely on the fallback? How long should the fallback be maintained?
   - Recommendation: Include fallback in discovery pattern. No explicit migration needed since projects naturally evolve (new phases go to `pending/`, executed phases move to `active/` then `completed/`). Existing flat phases are discovered by fallback and moved on first access.

2. **Phase state in ROADMAP.md**
   - What we know: ROADMAP.md currently tracks phase completion with checkbox markers like `[x]` and `[ ]`.
   - What's unclear: Should ROADMAP.md also reflect the directory state (pending/active/completed)?
   - Recommendation: No change to ROADMAP.md format. Directory structure is the source of truth for state; ROADMAP.md tracks completion status as before.

3. **`active/` enforcement**
   - What we know: Only one phase should be active at a time.
   - What's unclear: Should this be enforced (error if another phase is active) or advisory (warning)?
   - Recommendation: Advisory warning, not hard enforcement. Kata supports re-execution of phases (e.g., `--gaps` mode) which might temporarily overlap. Log a warning if `active/` has more than one phase.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all 34+ files referencing `.planning/phases/`
- `.planning/issues/open/2026-01-20-folder-based-phase-state-management.md` — original issue describing this feature
- `.planning/REQUIREMENTS.md` — PHASE-01 and PHASE-05 requirements
- `skills/kata-execute-phase/SKILL.md` — current execution flow
- `agents/kata-verifier.md` — current verification patterns
- `skills/kata-plan-phase/SKILL.md` — current planning flow

### Secondary (MEDIUM confidence)
- `.planning/milestones/v1.4.1-ROADMAP.md` — confirms this was explicitly deferred to v1.5.0
- `.planning/todos/_archived/pending/2026-01-20-folder-based-phase-state-management.md` — earlier todo description

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Pure internal architecture change, no external dependencies
- Architecture: HIGH — Based on direct codebase analysis and existing issue specification
- Pitfalls: HIGH — Derived from thorough file inventory and understanding of existing patterns

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable internal architecture, no external dependency drift)
