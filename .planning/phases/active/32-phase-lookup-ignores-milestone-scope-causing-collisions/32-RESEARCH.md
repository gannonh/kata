# Phase 3: Phase lookup ignores milestone scope causing collisions - Research

**Researched:** 2026-02-06
**Domain:** Internal Kata infrastructure (phase directory lookup, numbering, migration)
**Confidence:** HIGH

## Summary

The phase directory lookup pattern used across ~23 skill/reference files scans `.planning/phases/{active,pending,completed}/` with `find -name "${PADDED}-*" | head -1`. When multiple milestones share the same phase number prefix (e.g., eight directories start with `01-*`), `head -1` returns whichever one sorts first alphabetically, not the one belonging to the current milestone.

The locked decision (from CONTEXT.md) is to revert to globally sequential phase numbering. Phases never reset at milestone boundaries. A new milestone picks up where the previous milestone's highest phase left off. This eliminates the collision class entirely since no two phase directories will share a numeric prefix.

**Primary recommendation:** Rename all existing phase directories to globally sequential numbers, then update all skill/reference files that contain the phase lookup pattern, then update the `kata-add-milestone` and `kata-complete-milestone` instructions to use continuation numbering instead of reset-to-1.

## Standard Stack

No external libraries. This is pure internal infrastructure work:

### Core
| Component | Purpose | Location |
| --- | --- | --- |
| Phase lookup snippet | Find phase dir by number across active/pending/completed | ~17 skill/reference files |
| `find-phase.sh` | Shared script for execute-phase | `skills/kata-execute-phase/scripts/find-phase.sh` |
| `kata-add-milestone` | Creates roadmap with phase numbers | `skills/kata-add-milestone/SKILL.md` |
| `kata-complete-milestone` | Archives milestone, documents numbering policy | `skills/kata-complete-milestone/references/milestone-complete.md` |
| `kata-plan-milestone-gaps` | Finds highest phase number for gap phases | `skills/kata-plan-milestone-gaps/SKILL.md` |

### Supporting
| Component | Purpose | Relevance |
| --- | --- | --- |
| ROADMAP.md | Displays phase numbers | Phase headers use `### Phase N:` format |
| STATE.md | Tracks current phase number | `Phase: N` in Current Position |
| REQUIREMENTS.md traceability | Maps requirements to phases | Phase columns reference numbers |
| GitHub issues | Phase issues use `Phase N:` title format | `gh issue list --jq ".[] | select(.title | startswith(\"Phase N:\"))"` |

## Architecture Patterns

### Pattern 1: Universal Phase Discovery (current, to be updated)

The phase lookup appears in two forms across the codebase:

**Form A: Inline in skill/reference files (~16 instances)**
```bash
PADDED=$(printf "%02d" "$PHASE" 2>/dev/null || echo "$PHASE")
PHASE_DIR=""
for state in active pending completed; do
  PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PHASE}-*" 2>/dev/null | head -1)
  [ -n "$PHASE_DIR" ] && break
done
# Flat directory fallback
if [ -z "$PHASE_DIR" ]; then
  PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PHASE}-*" 2>/dev/null | head -1)
fi
```

**Form B: Shell script (`find-phase.sh`)**
Same logic extracted to a standalone script used by `kata-execute-phase`.

**Why it collides:** `find -name "01-*" | head -1` returns whichever `01-*` directory it finds first. With 8 directories starting with `01-*` across milestones, the result is nondeterministic.

### Pattern 2: Globally Sequential Numbering (target)

After the fix, phase numbers are globally unique:
- v0.1.4 milestone: Phase 0 (00-hard-fork-rebrand)
- v0.1.5 milestone: Phases 1-7 (01-migrate-todo-commands through 07-deprecate-npx-support)
- v1.0.0 milestone: Phases 8-11
- etc.

The lookup becomes unambiguous because only one directory matches `08-*`.

### Pattern 3: Phase Number Continuation Logic

Where numbering is determined:
1. `kata-add-milestone` SKILL.md (Phase 9, line 736): "Start phase numbering at 1"
2. `kata-add-milestone` SKILL.md (line 767): Roadmapper instructions repeat "Start phase numbering at 1"
3. `kata-complete-milestone` milestone-complete.md (line 687): Documents reset-to-1 policy
4. `kata-complete-milestone` milestone-archive-template.md (line 123): Same
5. `kata-plan-milestone-gaps` SKILL.md (line 95-106): Already scans for highest existing phase across all states

These all need updating to: "Continue from highest existing phase number + 1."

### Anti-Patterns to Avoid
- **Partial migration:** Renaming only completed directories but leaving the lookup code unchanged would still break for active/pending phases.
- **Adding milestone prefix to directory names:** The CONTEXT.md explicitly chose globally sequential numbers, not milestone-scoped directories. Don't add `v1.6.0-` prefixes.
- **Changing lookup to filter by milestone:** This was the alternative approach in the issue. The user rejected it in favor of sequential numbering.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Phase number continuation | Custom counter file | `find + sort -V + tail -1` | Already used in kata-plan-milestone-gaps |
| Directory rename | Manual mv commands | Scripted batch rename with mapping | Too many directories (33 completed) for manual work |
| Find-and-replace across files | Manual editing | Systematic pattern update | 23 files with the same snippet |

## Common Pitfalls

### Pitfall 1: Renaming breaks internal file references
**What goes wrong:** Phase directories contain files like `01-01-PLAN.md`, `01-RESEARCH.md` that embed the phase number. Renaming `01-foundation` to `08-foundation` without renaming internal files creates mismatches.
**Why it happens:** The phase number appears in both the directory name and the filenames within.
**How to avoid:** Rename both directory and all files within that reference the old phase number prefix.
**Warning signs:** `find-phase.sh` exit code 2 (no plans found) after rename.

### Pitfall 2: ROADMAP.md phase references become stale
**What goes wrong:** ROADMAP.md has `### Phase 1: Foundation` and plan references like `01-01-PLAN.md`. After renaming to Phase 8, ROADMAP.md still says Phase 1.
**Why it happens:** ROADMAP.md is documentation, not auto-generated.
**How to avoid:** Historical milestones in ROADMAP.md are in collapsed `<details>` blocks with archive links. The current milestone section needs phase number updates. Archived milestone roadmaps (`.planning/milestones/`) can be left as-is since they're historical records.

### Pitfall 3: GitHub issues reference old phase numbers
**What goes wrong:** GitHub issues titled "Phase 1: Foundation" won't match lookup queries for "Phase 8".
**Why it happens:** Issue titles are immutable once the issue is closed.
**How to avoid:** Completed milestone issues are already closed. Only the current milestone's open issues need updating. Since v1.6.0 Phase 1 and Phase 2 are already complete and their issues are closed, only Phases 3-6 (current v1.6.0 phases) need GitHub issue title updates if they have issues.

### Pitfall 4: STATE.md "Phase: 2" becomes ambiguous during transition
**What goes wrong:** STATE.md says "Phase: 2" but after renaming, Phase 2 of v1.6.0 is now some higher number.
**How to avoid:** Update STATE.md current position as part of the migration step.

### Pitfall 5: `head -1` still returns wrong match if rename is incomplete
**What goes wrong:** If some directories are renamed but not all, `find -name "01-*" | head -1` might return a partially-migrated directory.
**How to avoid:** Batch rename all directories atomically, verify no collisions exist post-rename.

### Pitfall 6: Flat directory fallback references
**What goes wrong:** The lookup pattern includes a flat fallback (`find .planning/phases -maxdepth 1`). This fallback is for backward compatibility with unmigrated projects. After this fix, it should remain for consumer projects but the Kata orchestrator project itself should not need it.
**How to avoid:** Keep the flat fallback in the lookup pattern for consumer project backward compatibility.

## Code Examples

### Continuation numbering logic (from kata-plan-milestone-gaps, already exists)

```bash
# Scan all phase directories across states
ALL_PHASE_DIRS=""
for state in active pending completed; do
  [ -d ".planning/phases/${state}" ] && ALL_PHASE_DIRS="${ALL_PHASE_DIRS} $(find .planning/phases/${state} -maxdepth 1 -type d -not -name "${state}" 2>/dev/null)"
done
# Extract highest phase number
HIGHEST=$(echo "$ALL_PHASE_DIRS" | tr ' ' '\n' | grep -oE '/[0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1)
NEXT_PHASE=$((HIGHEST + 1))
```

### Batch rename approach

```bash
# Build rename mapping from milestone history
# For each milestone in order, assign sequential numbers
# Then rename directories and internal files
for dir in .planning/phases/completed/*/; do
  OLD_PREFIX=$(basename "$dir" | grep -oE '^[0-9]+(\.[0-9]+)?')
  # Map old prefix to new sequential number
  # mv "$dir" ".planning/phases/completed/${NEW_PREFIX}-${SLUG}"
  # Rename internal files: ${OLD_PREFIX}-01-PLAN.md -> ${NEW_PREFIX}-01-PLAN.md
done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Globally sequential phases | Per-milestone reset to 1 | 2026-02-03 (v1.5.0) | Introduced the collision bug |
| Per-milestone reset to 1 | Globally sequential (this fix) | 2026-02-06 (v1.6.0 Phase 3) | Eliminates collision class |

**Deprecated/outdated:**
- "Each milestone starts phase numbering at 1" (2026-02-03 decision) -- being reverted by this phase

## Affected Files Inventory

### Phase lookup pattern (inline snippet) -- 17 unique source files

| File | Instances | Notes |
| --- | --- | --- |
| `skills/kata-plan-phase/SKILL.md` | 2 | Steps 2 and 4 |
| `skills/kata-plan-phase/references/planner-instructions.md` | 3 | |
| `skills/kata-plan-phase/references/phase-researcher-instructions.md` | 1 | |
| `skills/kata-plan-phase/references/plan-checker-instructions.md` | 1 | |
| `skills/kata-execute-phase/scripts/find-phase.sh` | 1 | Standalone script |
| `skills/kata-execute-phase/references/phase-execute.md` | 1 | |
| `skills/kata-verify-work/references/verify-work.md` | 1 | |
| `skills/kata-verify-work/references/planner-instructions.md` | 3 | |
| `skills/kata-verify-work/references/plan-checker-instructions.md` | 1 | |
| `skills/kata-research-phase/SKILL.md` | 1 | |
| `skills/kata-research-phase/references/phase-researcher-instructions.md` | 1 | |
| `skills/kata-track-progress/SKILL.md` | 1 | |
| `skills/kata-pause-work/SKILL.md` | 1 | |
| `skills/kata-remove-phase/SKILL.md` | 1 | |
| `skills/kata-discuss-phase/references/phase-discuss.md` | 1 | |
| `skills/kata-audit-milestone/SKILL.md` | 1 | Scans all phases |
| `skills/kata-audit-milestone/references/integration-checker-instructions.md` | 1 | |
| `skills/kata-check-issues/SKILL.md` | 1 | Scans all phases |
| `skills/kata-plan-milestone-gaps/SKILL.md` | 1 | Finds highest phase |
| `skills/kata-complete-milestone/references/milestone-complete.md` | 2 | Scan + docs |

### Numbering policy references -- 6 locations

| File | What to change |
| --- | --- |
| `skills/kata-add-milestone/SKILL.md` (line 736) | "Start at 1" -> "Continue from highest + 1" |
| `skills/kata-add-milestone/SKILL.md` (line 767) | Same instruction to roadmapper |
| `skills/kata-complete-milestone/references/milestone-complete.md` (line 687) | Policy note |
| `skills/kata-complete-milestone/references/milestone-archive-template.md` (line 123) | Policy note |
| `README.md` (line 37) | "Per-milestone numbering" description |
| CLAUDE.md / KATA-STYLE.md | If they reference numbering policy |

### Historical directories to rename -- 33 completed + 2 pending + 0 active

Current collision counts in `completed/`:
- `00-*`: 4 directories
- `01-*`: 8 directories (plus 3 decimal: 01.1, 01.2, 01.3)
- `02-*`: 6 directories
- `03-*`: 2 directories
- `04-*`: 2 directories
- `05-*`: 1 directory
- `06-*`: 1 directory
- `07-*`: 1 directory
- `v*-*`: 5 directories (already have version prefixes from earlier approach)

Total: 33 completed directories need globally sequential renumbering.
Pending: `03-phase-lookup-ignores-milestone-scope-causing-collisions`, `04-skills-sh-distribution` need renumbering too.

## Open Questions

1. **Internal file renaming scope:** Each phase directory contains files like `01-01-PLAN.md`, `01-RESEARCH.md`. Should internal filenames also be renamed to match the new sequential prefix? If not, the lookup works (directory name matches) but filenames would mismatch. Plan files reference each other by filename in frontmatter (`depends_on`). Historical completed plans are unlikely to be re-read, so renaming may be unnecessary for completed phases. For pending phases (03, 04), renaming is needed since they haven't been planned yet.
   - What we know: The directory name is what the lookup matches. Internal filenames matter for `find "${PHASE_DIR}" -name "*-PLAN.md"` which uses wildcard, not phase prefix.
   - Recommendation: Rename directories only. Internal filenames use `*-PLAN.md` wildcards for discovery, so the phase prefix in filenames is cosmetic for completed phases. For pending/active phases, rename both directory and internal files.

2. **Milestone-to-phase mapping for rename:** The chronological order of milestones is known from ROADMAP.md and MILESTONES.md. The mapping from milestone phases to global numbers needs to be constructed by walking through milestones in order.
   - What we know: ROADMAP.md's completed milestones section and `.planning/milestones/` archives document which phases belong to which milestone and their order.
   - Recommendation: Build a mapping script that reads milestone archives in version order, assigns sequential global numbers, then renames.

3. **Five directories already have version prefixes** (`v0.1.9-01-*`, `v1.0.6-02.1-*`, etc.). These are from an earlier attempt at disambiguation.
   - Recommendation: Treat them the same as others -- assign new sequential numbers, strip version prefix.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all 23 files containing phase lookup patterns
- CONTEXT.md locked decision: globally sequential numbering
- Issue #102 problem description and observed behavior

### Secondary (MEDIUM confidence)
- Milestone archive files for historical phase ordering

## Metadata

**Confidence breakdown:**
- Affected files inventory: HIGH -- direct grep/analysis of entire codebase
- Migration approach: HIGH -- the pattern is straightforward (rename + find-replace)
- Pitfalls: HIGH -- identified from codebase analysis of cross-references
- Internal file rename scope: MEDIUM -- needs validation during planning

**Research date:** 2026-02-06
**Valid until:** Indefinite (internal infrastructure, not external dependency)
