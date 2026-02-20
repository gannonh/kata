# Plan: Create `kata-doctor` Skill

## Context

Kata's ROADMAP.md format has evolved. Old-format roadmaps lack `## Milestones` overview, `## Current Milestone:` heading, `<details>` blocks for completed milestones, and `## Progress Summary` table. Skills that parse ROADMAP.md using format-specific patterns (`grep -E "Current Milestone:|🔄"`, `<details>` blocks, etc.) break on old-format files. Projects using older Kata versions won't automatically migrate when touched by skills.

Additionally, `kata-migrate-phases` handles phase directory collision detection/fix as a standalone skill. This functionality folds into `kata-doctor` as a second health check, and `kata-migrate-phases` gets deprecated.

## New Files

### 1. `skills/kata-doctor/scripts/check-roadmap-format.sh` (~25 lines)

Fast bash detection script. Exit codes:
- 0 = current format (no action needed)
- 1 = old format (needs migration)
- 2 = no ROADMAP.md (skip, not a problem)

Detection: requires BOTH `## Milestones` section AND either `## Current Milestone:` or `## Completed Milestones` heading.

### 2. `skills/kata-doctor/references/roadmap-format-spec.md` (~80 lines)

Canonical ROADMAP.md format specification. Mirrors the format from `kata-complete-milestone/references/milestone-complete.md` lines 662-717. Defines:
- Required sections and heading format
- Status icon conventions (checkmark/spinner/circle)
- Phase line format within milestones
- `<details>` block structure for completed milestones
- Progress Summary table format

### 3. `skills/kata-doctor/SKILL.md` (~300 lines)

Unified health check skill with two checks:

**Check 1: Roadmap format migration**
1. Run `check-roadmap-format.sh`. Exit 0 = skip. Exit 2 = skip.
2. Read old-format ROADMAP.md and parse: project name, phases, completion status, milestone groupings
3. Rewrite to canonical format per `roadmap-format-spec.md`
4. Re-run check script to verify
5. Commit: `docs: migrate ROADMAP.md to current format`

**Check 2: Phase directory collision detection** (folded from `kata-migrate-phases`)
1. Scan active/pending/completed dirs for duplicate numeric prefixes
2. If none found, skip
3. Build chronology from ROADMAP.md, map directories to global sequence
4. Present migration plan, get user confirmation
5. Two-pass rename (tmp then final), update ROADMAP.md phase numbers
6. Commit: `chore: migrate phase directories to globally sequential numbering`

When invoked by other skills (no user present for confirmation), run in auto mode: format migration always proceeds, collision fix reports the problem and suggests `/kata-doctor` for interactive resolution.

## Modified Files

### 4. Deprecate `skills/kata-migrate-phases/SKILL.md`

Replace SKILL.md content with a redirect:
- Keep the frontmatter (name, description, triggers) so existing trigger phrases still work
- Process becomes: display deprecation notice, invoke `Skill("kata:kata-doctor")`
- Preserves backward compatibility for users who type `/kata-migrate-phases`

### 5-17. Add pre-flight check to 13 skills

Each skill that touches ROADMAP.md gets a pre-flight step added. The pattern (inserted as the first step that runs after argument parsing):

```markdown
## Pre-flight: Verify ROADMAP format

If `.planning/ROADMAP.md` exists:

```bash
bash "${SKILL_BASE_DIR}/../kata-doctor/scripts/check-roadmap-format.sh" 2>/dev/null
```

If exit code 1 (old format): display `Migrating ROADMAP.md to current format...` and invoke `Skill("kata:kata-doctor")`

If exit code 0 or 2: continue normally.
```

**Skills and insertion points:**

| # | Skill | Insert before |
|---|-------|--------------|
| 5 | `kata-execute-phase` | Step 1 (validate phase exists) |
| 6 | `kata-add-milestone` | Phase 1 (Load Context) |
| 7 | `kata-complete-milestone` | Step 0 (branch setup) |
| 8 | `kata-plan-phase` | Step 2 (normalize phase input) |
| 9 | `kata-move-phase` | Step `parse_arguments` |
| 10 | `kata-insert-phase` | Step `load_roadmap` |
| 11 | `kata-plan-milestone-gaps` | Step 1 (Load Audit Results) |
| 12 | `kata-add-phase` | Step `load_roadmap` |
| 13 | `kata-remove-phase` | Step `load_state` |
| 14 | `kata-track-progress` | Step `load` |
| 15 | `kata-discuss-phase` | Before step 1 |
| 16 | `kata-research-phase` | Before step 1 |
| 17 | `kata-audit-milestone` | Before step 1 |

### 18. Update `kata-add-milestone/SKILL.md` Phase 8.5

The collision check in Phase 8.5 currently has inline migration logic. Replace with: run `kata-doctor` which now handles collisions. Remove the ~20 lines of inline collision/migration logic and replace with `Skill("kata:kata-doctor")`.

## Verification

1. Build plugin: `npm run build:plugin`
2. Run tests: `npm test && npm run test:smoke`
3. Manual test: create an old-format ROADMAP.md in `../kata-burner/` test project, run `/kata-track-progress` and verify it auto-migrates before displaying status
4. Verify `/kata-migrate-phases` still works (redirects to doctor)
5. Verify `/kata-doctor` works standalone
