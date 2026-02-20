# Plan: Phase Migration Mechanism

## Context

Phase 32 fixed Kata's own phase numbering by renaming all directories to globally sequential numbers. The phase lookup code (`find ... -name "01-*" | head -1`) works correctly when prefixes are unique but returns the wrong directory when collisions exist.

Existing user projects with multiple milestones may still have colliding numeric prefixes (e.g., `01-foundation` from v0.1.0 and `01-setup` from v0.2.0 both in `completed/`). These projects need auto-detection and migration to globally sequential numbering during normal product use.

## Deliverables

### 1. New skill: `skills/kata-migrate-phases/SKILL.md`

Standalone skill (~250 lines, no references/ needed). Follows the `kata-check-issues` detect-fix-verify pattern.

**Frontmatter:** `kata-migrate-phases`, triggers: "migrate phases", "fix phase numbers", "renumber phases", "phase collision", "fix phase collisions", "fix duplicate phases", "phase numbering migration". Tools: Read, Write, Bash.

**Steps:**

1. **detect_collisions** — Scan all phase directories for duplicate numeric prefixes across `active/pending/completed/` and flat fallback. If none found, report clean and exit.

2. **validate_environment** — Read ROADMAP.md and STATE.md. Confirm project is active.

3. **build_milestone_chronology** — Parse ROADMAP.md `<details>` blocks (chronological order) to get completed milestones and their phase lists. Add current milestone phases from the active section. Each phase gets a globally sequential number starting from 0.

4. **map_directories_to_phases** — Match each phase name from the chronology to its existing directory. Build mapping table: `OLD_DIR → NEW_PREFIX-SLUG`.

5. **present_migration_plan** — Display full rename table. Use AskUserQuestion: "Rename N directories to globally sequential numbers?" Options: Proceed / Cancel.

6. **execute_renames** — Two-pass approach (from `kata-move-phase` pattern): Pass 1 renames all to `tmp-{seq}-{slug}`, Pass 2 renames to final `{padded}-{slug}`. For completed phases: directory only. For active/pending: directory + internal files with phase prefix.

7. **update_documentation** — Update ROADMAP.md current milestone phase numbers. Update STATE.md current position. Leave historical `<details>` blocks unchanged.

8. **verify** — Re-run collision detection. Report results.

9. **commit** — Respect `commit_docs` config. Single commit: `chore: migrate phase directories to globally sequential numbering`.

### 2. Detection guard in `kata-add-milestone/SKILL.md`

**Insert between line 721 and 723** (after Phase 8 commit block, before `## Phase 9: Create Roadmap`).

New section `## Phase 8.5: Collision Check`:

```bash
DUPES=$(for state in active pending completed; do
  ls .planning/phases/${state}/ 2>/dev/null
done | grep -oE '^[0-9]+' | sort -n | uniq -d)
```

- If empty: continue silently to Phase 9.
- If collisions found: display warning, use AskUserQuestion with "Migrate now" (run inline migration then recalculate NEXT_PHASE) or "Skip" (warn and continue).

~40 lines added.

### 3. Detection warning in `kata-plan-phase/SKILL.md`

**Insert after line 106** (after the phase directory lookup block, before `find "${PHASE_DIR}"` commands).

Non-blocking warning that counts matches for the padded prefix across all states. If >1 match: display warning with suggestion to run `/kata-migrate-phases`.

~15 lines added.

## Key Design Decisions

- **Completed phase internal files left unchanged** — Wildcard lookup (`*-PLAN.md`) handles them. Reduces scope and risk.
- **Active/pending internal files renamed** — These are actively referenced during execution.
- **Historical ROADMAP `<details>` blocks unchanged** — They're archived records. Milestone archive files in `.planning/milestones/` are authoritative.
- **Two-pass rename** — Avoids mid-rename collisions where a new name conflicts with an existing old name. Established pattern from `kata-move-phase`.
- **Single confirmation** — Present full table, ask once. Per-directory confirmation is impractical for 30+ phases.
- **Decimal phases** (2.1, 2.2) get sequential integer numbers after their parent. Document order in ROADMAP determines sequence.

## Files to Create/Modify

| File | Action |
|------|--------|
| `skills/kata-migrate-phases/SKILL.md` | Create (~250 lines) |
| `skills/kata-add-milestone/SKILL.md` | Insert Phase 8.5 between lines 721-723 (~40 lines) |
| `skills/kata-plan-phase/SKILL.md` | Insert collision warning after line 106 (~15 lines) |

## Implementation Order

1. Create `kata-migrate-phases` skill (standalone, no deps)
2. Add guard to `kata-add-milestone` (references the skill in its warning message)
3. Add warning to `kata-plan-phase` (references the skill in its warning message)

Steps 2 and 3 can run in parallel after step 1.

## Verification

1. **Skill loads:** `npm run build:plugin` then verify `/kata-migrate-phases` appears in skill list
2. **Detection logic:** In a test project with duplicate phase prefixes, confirm detection fires in both `kata-add-milestone` and `kata-plan-phase`
3. **Migration logic:** Run `/kata-migrate-phases` on a project with collisions, verify all directories get unique sequential prefixes and ROADMAP/STATE are updated
4. **Idempotency:** Run the skill again after migration, confirm "no collisions" exit
5. **Clean project:** Run detection on a project with no collisions, confirm silent pass-through
