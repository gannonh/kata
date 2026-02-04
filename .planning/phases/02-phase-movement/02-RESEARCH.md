# Phase 2: Phase Movement - Research

**Researched:** 2026-02-03
**Domain:** Kata internal architecture (phase numbering, milestone-phase mapping, skill creation, directory renaming)
**Confidence:** HIGH

## Summary

Phase 2 implements three requirements: a new `kata-move-phase` skill (PHASE-02), within-milestone reordering with automatic renumbering (PHASE-03), and per-milestone phase numbering starting at 1 (PHASE-04).

The codebase currently enforces **cumulative phase numbering across milestones** ("continue phase numbering in next milestone, never restart at 01" in milestone-archive-template.md line 122; "Start phase numbering from [N] (continues from previous milestone)" in kata-add-milestone line 736). PHASE-04 reverses this. However, the v1.5.0 milestone already uses numbering starting at 1 (01-phase-organization, 02-phase-movement), making v1.5.0 itself an example of the target pattern. The change is about making per-milestone numbering the standard and updating the files that enforce cumulative numbering.

Renumbering logic already exists in `kata-remove-phase` (directory rename, file rename within directories, ROADMAP.md reference updates). The move-phase skill is new but follows established skill patterns (kata-add-phase, kata-insert-phase, kata-remove-phase). Phase 1's universal discovery pattern provides the directory lookup foundation for all new operations.

**Primary recommendation:** Build the `kata-move-phase` skill and reorder capability as new skills following existing patterns, then update the 4 files that enforce cumulative numbering to enforce per-milestone numbering instead.

## Standard Stack

No external libraries. Pure internal architecture change (prompt files, directory operations).

### Core
| Component | Purpose | Why Standard |
| --------- | ------- | ------------ |
| Bash `mv`, `mkdir -p` | Directory rename/move operations | Already used in remove-phase, execute-phase |
| Universal phase discovery | Find phases across state subdirectories | Established in Phase 1 across 27+ files |
| `find -maxdepth 1 -type d` | Phase directory lookup | Established pattern from Phase 1 |
| ROADMAP.md parsing | Extract milestone/phase structure | Used by add-phase, remove-phase, insert-phase |

### Supporting
| Pattern | Purpose | When to Use |
| ------- | ------- | ----------- |
| `grep -E "^#### Phase"` | Parse phase headings from ROADMAP.md | Finding phase entries within a milestone |
| `sed -E 's/Phase [0-9]+/Phase N/'` | Renumber phase references | When reordering or moving phases |
| `basename "$dir" \| sed -E 's/^([0-9]+)-.*/\1/'` | Extract phase number from directory name | Phase number detection |

## Architecture Patterns

### Current Phase Directory Structure
```
.planning/phases/
├── .archive/           # Cross-milestone archived phases
├── pending/            # Phases not yet started
│   └── 03-roadmap-enhancements/
├── active/             # Currently executing phase
│   └── (none currently)
└── completed/          # Phases with validated completion
    └── 01-phase-organization/
```

### Current Phase Numbering Model (what changes)
```
Old model (cumulative):
  v1.0: Phase 0-7
  v1.1: Phase 8-17  (continues from v1.0)
  v1.2: Phase 18-20 (continues from v1.1)

New model (per-milestone, PHASE-04):
  v1.0: Phase 1-7
  v1.1: Phase 1-3   (restarts at 1)
  v1.2: Phase 1-5   (restarts at 1)
```

### Pattern 1: Move Phase Between Milestones (PHASE-02)
**What:** A new skill `kata-move-phase` that moves a phase from one milestone to another, updating ROADMAP.md, renumbering directories, and updating STATE.md.
**When to use:** User wants to defer or advance scope between milestones.
**Key operations:**
1. Parse source phase and target milestone from arguments
2. Validate source phase exists and is unstarted (pending/)
3. Validate target milestone exists in ROADMAP.md
4. Remove phase section from source milestone in ROADMAP.md
5. Renumber remaining phases in source milestone (gaps)
6. Add phase section to target milestone in ROADMAP.md with correct number
7. Rename phase directory to match new number
8. Rename internal files (NN-01-PLAN.md -> MM-01-PLAN.md)
9. Update STATE.md, REQUIREMENTS.md traceability
10. Commit

**Example invocation:**
```
/kata:kata-move-phase 3 to v1.6.0
```

### Pattern 2: Reorder Phases Within Milestone (PHASE-03)
**What:** Change the execution order of phases within a milestone, with automatic renumbering.
**When to use:** User realizes phase execution order should change (e.g., Phase 3 should come before Phase 2).
**Key operations:**
1. Parse phase number and target position from arguments
2. Validate phase exists and is unstarted (pending/)
3. Remove phase from current position in ROADMAP.md
4. Insert at target position
5. Renumber all phases in milestone sequentially
6. Rename directories and internal files to match new numbers
7. Update cross-references (dependencies, STATE.md)
8. Commit

**Example invocation:**
```
/kata:kata-move-phase 3 before 1    (reorder: move Phase 3 to position 1)
/kata:kata-move-phase 3 after 1     (reorder: move Phase 3 to position 2)
```

### Pattern 3: Per-Milestone Phase Numbering (PHASE-04)
**What:** Each milestone starts phase numbering at 1 instead of continuing from the previous milestone.
**When to use:** Always, going forward. Changes the default behavior.
**Key operations:**
1. Update kata-add-milestone to start numbering at 1 (not continue from previous)
2. Update kata-roadmapper to start at 1 for new milestones
3. Update milestone-archive-template.md to remove "never restart at 01" guidance
4. Update milestone-complete.md to remove "Phase numbering continues" note
5. Phase directories use NN-name pattern (01, 02, 03) per milestone

**Files requiring change for PHASE-04:**
| File | Current Text | New Text |
| ---- | ------------ | -------- |
| `skills/kata-add-milestone/SKILL.md` (lines 706-709, 736) | "New phases continue from there (e.g., if v1.0 ended at phase 5, v1.1 starts at phase 6)" / "Start phase numbering from [N] (continues from previous milestone)" | "Start phase numbering at 1 (each milestone has independent numbering)" |
| `skills/kata-complete-milestone/references/milestone-archive-template.md` (line 122) | "Continue phase numbering in next milestone (never restart at 01)" | "Each milestone starts phase numbering at 1" |
| `skills/kata-complete-milestone/references/milestone-complete.md` (line 707) | "Phase numbering continues (v1.0 phases 1-4, v1.1 phases 5-8, etc.)" | "Each milestone starts phase numbering at 1" |
| `agents/kata-roadmapper.md` (lines 188-190) | "Starting number: New milestone: Start at 1, Continuing milestone: Check existing phases, start at last + 1" | "Starting number: Always start at 1 for new milestones" |

### Pattern 4: Renumbering (Shared Logic)
**What:** Renumber directories and files when phase order changes. Borrowed from kata-remove-phase.
**When to use:** After move or reorder operations.
**Example (from kata-remove-phase):**
```bash
# Process in reverse order to avoid conflicts
# Rename directory (within same state subdirectory)
for state in active pending completed; do
  SRC=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${OLD_NUM}-*" 2>/dev/null | head -1)
  [ -n "$SRC" ] && mv "$SRC" ".planning/phases/${state}/${NEW_NUM}-$(echo $(basename $SRC) | sed -E 's/^[0-9]+-(.*)/\1/')"
done

# Rename files inside directory
mv "${NEW_DIR}/${OLD_NUM}-01-PLAN.md" "${NEW_DIR}/${NEW_NUM}-01-PLAN.md"
mv "${NEW_DIR}/${OLD_NUM}-01-SUMMARY.md" "${NEW_DIR}/${NEW_NUM}-01-SUMMARY.md"
```

### Anti-Patterns to Avoid
- **Moving active/completed phases:** Only phases in pending/ should be movable/reorderable. Active or completed phases have execution artifacts that reference their phase number.
- **Cross-milestone directory conflicts:** When moving a phase to a milestone that already has a phase with the same number, renumber at the destination first.
- **Forgetting decimal phases:** When renumbering, decimal phases (2.1, 2.2) must move with their parent integer phase. kata-remove-phase already handles this.
- **Breaking PLAN.md internal references:** Plans reference `{phase}-{plan}-PLAN.md` in frontmatter. These must update when the phase number changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Phase discovery | Custom lookup per skill | Universal discovery pattern from Phase 1 | Consistency across 27+ files |
| Renumbering logic | New renumbering from scratch | Adapt from kata-remove-phase | Already handles directories, files, ROADMAP.md refs, decimal phases |
| Skill structure | Ad-hoc skill format | Follow kata-add-phase pattern (parse args, load roadmap, validate, modify, commit) | Consistent UX and error handling |
| Phase validation | Inline checks | Reuse pending/active/completed state detection from execute-phase | State is determined by directory location |

**Key insight:** The renumbering logic in kata-remove-phase is the most complex piece. It handles directory renaming, file renaming inside directories, ROADMAP.md section updates, dependency reference updates, and decimal phase handling. Both move-phase and reorder operations reuse this same renumbering pattern.

## Common Pitfalls

### Pitfall 1: File Rename Order Conflicts
**What goes wrong:** Renaming Phase 3 -> Phase 2 and Phase 2 -> Phase 1 in forward order causes Phase 3's rename to overwrite Phase 2.
**Why it happens:** Directory renames are not atomic; sequential operations can collide.
**How to avoid:** Process renames in the correct order. For downward shifts (3->2, 2->1), process from lowest to highest. For upward shifts (1->2, 2->3), process from highest to lowest. kata-remove-phase processes in "descending order to avoid overwriting."
**Warning signs:** "Directory already exists" errors during rename.

### Pitfall 2: Stale ROADMAP.md After Move
**What goes wrong:** ROADMAP.md phase section references stale phase numbers in dependency lines, progress table, or plan references.
**Why it happens:** Renumbering updates phase headings but misses inline references like "Depends on: Phase 3" or plan references "03-01:".
**How to avoid:** Comprehensive search-and-replace within ROADMAP.md for ALL occurrences of old phase numbers. kata-remove-phase step `update_roadmap` shows the 6 types of references to update: headings, list items, table rows, plan references, dependency references, and decimal phase references.
**Warning signs:** Broken "Depends on" references; progress table rows with wrong numbers.

### Pitfall 3: Moving Phase With Existing Plans
**What goes wrong:** A phase that has been planned (has PLAN.md files) gets moved or reordered, breaking plan file naming.
**Why it happens:** PLAN.md files are named `{phase}-{plan}-PLAN.md` (e.g., `03-01-PLAN.md`). Moving phase 3 to position 1 requires renaming to `01-01-PLAN.md`.
**How to avoid:** When the phase has plan files, rename them all. Also update plan frontmatter that may reference the phase number.
**Warning signs:** Plan files with inconsistent numbering (directory named `01-auth` containing `03-01-PLAN.md`).

### Pitfall 4: REQUIREMENTS.md Traceability Stale
**What goes wrong:** REQUIREMENTS.md traceability table references old phase number after move.
**Why it happens:** Requirements map to phases (e.g., "AUTH-01 | Phase 3 | Pending"). Phase renumbering doesn't update this table.
**How to avoid:** After any move/reorder, update the REQUIREMENTS.md traceability table. kata-remove-phase updates STATE.md but does not update REQUIREMENTS.md traceability (oversight for this new operation).
**Warning signs:** Traceability table showing phase numbers that don't exist in ROADMAP.md.

### Pitfall 5: Per-Milestone Numbering Collision With Archive
**What goes wrong:** When both v1.4.1 and v1.5.0 have "Phase 1", archived directories collide.
**Why it happens:** The .archive/ directory flattens all phases from all milestones into one directory.
**How to avoid:** The archive directory already handles this with version prefixes (e.g., `v0.1.9-01-plugin-structure-validation`). The milestone-complete workflow must continue prefixing phase directories with the version when moving to .archive/. Verify this is maintained.
**Warning signs:** Archive directory collisions; phases from different milestones overwriting each other.

### Pitfall 6: Move-Phase Skill Name Collision
**What goes wrong:** The requirement says `/kata:move-phase` but all skills now use `kata-` prefix.
**Why it happens:** ROADMAP.md success criteria says `/kata:move-phase` but the naming convention is `kata-move-phase`.
**How to avoid:** The skill should be named `kata-move-phase` with both move and reorder capabilities. The ROADMAP.md reference to `/kata:move-phase` should be understood as `/kata:kata-move-phase` per the `kata-` prefix convention established in Quick Task 006.
**Warning signs:** None; just note the naming discrepancy.

## Code Examples

### Skill Argument Parsing for Move-Phase
```bash
# Move between milestones: /kata:kata-move-phase 3 to v1.6.0
# Reorder within milestone: /kata:kata-move-phase 3 before 1

# Parse: first arg is phase number
PHASE_NUM="$1"
shift

# Detect operation type
if [ "$1" = "to" ]; then
  OPERATION="move"
  TARGET_MILESTONE="$2"
elif [ "$1" = "before" ] || [ "$1" = "after" ]; then
  OPERATION="reorder"
  POSITION="$1"
  TARGET_POSITION="$2"
fi
```

### Phase Directory Rename (from kata-remove-phase, adapted)
```bash
# Rename phase directory within its state subdirectory
rename_phase_dir() {
  local OLD_NUM="$1"
  local NEW_NUM="$2"
  local PADDED_OLD=$(printf "%02d" "$OLD_NUM")
  local PADDED_NEW=$(printf "%02d" "$NEW_NUM")

  for state in active pending completed; do
    local DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED_OLD}-*" 2>/dev/null | head -1)
    if [ -n "$DIR" ]; then
      local SLUG=$(basename "$DIR" | sed -E "s/^${PADDED_OLD}-//")
      mv "$DIR" ".planning/phases/${state}/${PADDED_NEW}-${SLUG}"

      # Rename files inside
      for file in ".planning/phases/${state}/${PADDED_NEW}-${SLUG}/${PADDED_OLD}-"*; do
        [ -f "$file" ] || continue
        local NEW_FILE=$(echo "$file" | sed "s/${PADDED_OLD}-/${PADDED_NEW}-/")
        mv "$file" "$NEW_FILE"
      done
      return 0
    fi
  done
  return 1
}
```

### ROADMAP.md Phase Section Extract
```bash
# Extract a phase section from ROADMAP.md (heading to next heading or section end)
# Phase heading format: #### Phase N: Name
extract_phase_section() {
  local ROADMAP="$1"
  local PHASE_NUM="$2"
  # From "#### Phase N:" to next "#### Phase" or "---" or end of section
  sed -n "/^#### Phase ${PHASE_NUM}:/,/^####\|^---/p" "$ROADMAP" | sed '$d'
}
```

### Validate Phase Is Movable
```bash
# Phase must be in pending/ (not active or completed)
validate_movable() {
  local PHASE_NUM="$1"
  local PADDED=$(printf "%02d" "$PHASE_NUM")

  # Check if in active/ or completed/ (not movable)
  for state in active completed; do
    if find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | grep -q .; then
      echo "ERROR: Phase ${PHASE_NUM} is in ${state}/ and cannot be moved"
      return 1
    fi
  done

  # Must be in pending/
  if ! find .planning/phases/pending -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | grep -q .; then
    echo "ERROR: Phase ${PHASE_NUM} not found in pending/"
    return 1
  fi
  return 0
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Flat phase directories | State subdirectories (pending/active/completed) | v1.5.0 Phase 1 | Phase state visible at directory level |
| Cumulative phase numbering across milestones | Per-milestone numbering (PHASE-04, this phase) | v1.5.0 Phase 2 | Each milestone is self-contained |
| No phase movement between milestones | Move-phase skill (PHASE-02, this phase) | v1.5.0 Phase 2 | Flexible scope management |
| Fixed phase order | Reorder within milestone (PHASE-03, this phase) | v1.5.0 Phase 2 | Flexible prioritization |

**Key context:** The current v1.5.0 milestone already uses per-milestone numbering (Phase 1, 2, 3) rather than continuing from v1.4.1. The change is about codifying this as the standard and updating the 4 files that still enforce cumulative numbering.

## Files Requiring Modification

### New Files
| File | Purpose |
| ---- | ------- |
| `skills/kata-move-phase/SKILL.md` | New skill for move and reorder operations |
| `skills/kata-help/SKILL.md` | Add move-phase to help listing |

### Existing Files (PHASE-04: Per-Milestone Numbering)
| File | Change |
| ---- | ------ |
| `skills/kata-add-milestone/SKILL.md` (lines 706-709, 736) | Change "continues from previous" to "starts at 1" |
| `agents/kata-roadmapper.md` (lines 188-190) | Change starting number to always 1 |
| `skills/kata-complete-milestone/references/milestone-archive-template.md` (line 122) | Remove "never restart at 01" |
| `skills/kata-complete-milestone/references/milestone-complete.md` (line 707) | Remove "numbering continues" |

### Existing Files (PHASE-02/03: Supporting Move Operations)
| File | Change |
| ---- | ------ |
| `skills/kata-remove-phase/SKILL.md` | Reference pattern (no change needed, but verify consistency) |
| `.planning/REQUIREMENTS.md` | Update traceability after completion |

## Open Questions

1. **Single skill or two skills for move vs reorder?**
   - What we know: PHASE-02 says "move phase to different milestone" and PHASE-03 says "reorder within milestone." These are related but distinct operations.
   - What's unclear: Should these be one skill (`kata-move-phase`) with argument-driven behavior, or two separate skills (`kata-move-phase` and `kata-reorder-phase`)?
   - Recommendation: Single skill `kata-move-phase` with two invocation patterns: `/kata:kata-move-phase 3 to v1.6.0` (move) and `/kata:kata-move-phase 3 before 1` (reorder). The operations share validation and renumbering logic. Keeping them in one skill reduces duplication. The requirement PHASE-02 explicitly names `/kata:kata-move-phase`, so that name is locked.

2. **What happens to plans in a moved phase?**
   - What we know: Move/reorder should only work on pending/ phases. But a pending phase may have been planned (PLAN.md files exist) without execution starting.
   - What's unclear: Should we allow moving planned-but-unexecuted phases? The plan files would need renaming.
   - Recommendation: Allow it. Rename plan files inside the directory as part of the move operation. Reject only if SUMMARY.md files exist (indicating execution started).

3. **Archive collision with per-milestone numbering**
   - What we know: The .archive/ directory already prefixes some phases with version (e.g., `v0.1.9-01-plugin-structure-validation`). But most archived phases don't have version prefixes.
   - What's unclear: With per-milestone numbering, archive will have multiple `01-*` directories from different milestones. Does the milestone-complete workflow already handle this?
   - Recommendation: Verify milestone-complete handles version-prefixed archival. If not, add version prefix to archived phase directories when archiving. This is a Phase 3 (Roadmap Enhancements) concern if not already handled, but worth noting here.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all relevant skills:
  - `skills/kata-add-phase/SKILL.md` (add pattern)
  - `skills/kata-insert-phase/SKILL.md` (insert pattern)
  - `skills/kata-remove-phase/SKILL.md` (remove + renumber pattern)
  - `skills/kata-execute-phase/SKILL.md` (state transitions)
  - `skills/kata-add-milestone/SKILL.md` (cumulative numbering enforcement)
  - `skills/kata-complete-milestone/SKILL.md` + references (archival, numbering guidance)
- `agents/kata-roadmapper.md` (phase numbering rules)
- `.planning/phases/01-phase-organization/01-VERIFICATION.md` (Phase 1 completion confirmation)
- `.planning/phases/01-phase-organization/01-02-SUMMARY.md` (Phase 1 scope and patterns)
- `.planning/REQUIREMENTS.md` (PHASE-02, PHASE-03, PHASE-04)
- `.planning/ROADMAP.md` (current milestone structure)
- `.planning/issues/open/2026-01-28-roadmap-phase-management.md` (original issue)

### Secondary (MEDIUM confidence)
- `.planning/phases/.archive/` directory listing (confirms version-prefixed archival pattern exists)
- Historical ROADMAP.md patterns across milestones (confirms inconsistent numbering)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Pure internal architecture, no external dependencies
- Architecture: HIGH - Based on direct analysis of existing skills with same patterns
- Pitfalls: HIGH - Derived from understanding of renumbering mechanics and archive structure

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable internal architecture, no external dependency drift)
