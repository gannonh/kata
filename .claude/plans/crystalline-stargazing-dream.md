# Fix Script Path Resolution Across Skills and Plugin Distributions

## Context

Script path resolution has been a recurring failure. SKILL.md files reference scripts as `scripts/find-phase.sh` and `node scripts/kata-lib.cjs` (relative to skill root, per Agent Skills spec). Two problems:

1. **`kata-lib.cjs` lives in the wrong place.** Source is at `scripts/kata-lib.cjs` (project root dev tooling dir). The build copies it to `dist/*/skills/*/scripts/`, but the source skills under `skills/kata-*/scripts/` don't have it. Copying a source skill to `.claude/skills/` produces a broken skill.

2. **Cross-skill script references exist.** Several skills reference scripts from other skills (`../kata-doctor/scripts/...`, `skills/kata-execute-phase/scripts/...`). This violates the Agent Skills spec requirement that skills are self-contained.

3. **Stale script references.** Old bash scripts (`read-config.sh`, `read-pref.sh`) that were replaced by `kata-lib.cjs` are still referenced in some files.

4. **Plugin distribution needs a build transform.** The standard skills distribution uses relative paths per spec. The plugin distribution needs these paths transformed because Claude Code's Bash execution runs from user project CWD, not the skill directory, and the "Base directory" header mechanism is unreliable.

## Step 1: Move shared scripts to a source location and distribute via build

**Principle:** One source copy of each shared script. The build distributes copies to every skill that needs it. Source skills don't contain copies — only dist output does.

**Shared scripts to relocate:**

| Script | Current Location | Consumers |
|---|---|---|
| `kata-lib.cjs` | `scripts/kata-lib.cjs` (project root) | 22 skills |
| `manage-worktree.sh` | `skills/kata-execute-phase/scripts/` | kata-execute-phase, kata-verify-work, kata-review-pull-requests, kata-complete-milestone |

**Action:**
- Move `scripts/kata-lib.cjs` to `skills/_shared/kata-lib.cjs` (new directory for shared skill scripts)
- Move `skills/kata-execute-phase/scripts/manage-worktree.sh` to `skills/_shared/manage-worktree.sh`
- Keep the original in kata-execute-phase's scripts/ too (it's the primary owner)
- Update `distributeKataLib()` in `build.js` to source from `skills/_shared/kata-lib.cjs`
- Add `distributeSharedScripts()` in `build.js` that copies `manage-worktree.sh` to the 4 skills that need it
- Build validation: every script referenced in a skill's SKILL.md exists in that skill's `scripts/` dir in dist output

**22 skills that need kata-lib.cjs:**
kata-add-issue, kata-add-milestone, kata-add-phase, kata-audit-milestone, kata-check-issues, kata-complete-milestone, kata-configure-settings, kata-customize, kata-debug, kata-doctor, kata-execute-phase, kata-execute-quick-task, kata-move-phase, kata-pause-work, kata-plan-milestone-gaps, kata-plan-phase, kata-remove-phase, kata-research-phase, kata-resume-work, kata-review-pull-requests, kata-track-progress, kata-verify-work

**4 skills that need manage-worktree.sh:**
kata-execute-phase, kata-verify-work, kata-review-pull-requests, kata-complete-milestone

## Step 2: Eliminate cross-skill script references

**Problem references found:**

| From Skill | References | Script |
|---|---|---|
| kata-insert-phase/SKILL.md | `bash ../kata-doctor/scripts/check-roadmap-format.sh` | Already in kata-lib.cjs as `check-roadmap` |
| kata-customize/SKILL.md | `bash ../kata-doctor/scripts/check-template-drift.sh` | Already in kata-lib.cjs as `check-template-drift` |
| kata-complete-milestone/references/ | `bash ../kata-configure-settings/scripts/read-config.sh` | Replaced by `node scripts/kata-lib.cjs read-config` |
| kata-complete-milestone/references/ | `bash ../kata-configure-settings/scripts/read-pref.sh` | Replaced by `node scripts/kata-lib.cjs read-pref` |
| kata-verify-work/references/ | `bash ../kata-configure-settings/scripts/read-pref.sh` | Replaced by `node scripts/kata-lib.cjs read-pref` |
| kata-verify-work/SKILL.md | `bash "skills/kata-execute-phase/scripts/manage-worktree.sh"` | Copy to skill or add to kata-lib.cjs |
| kata-review-pull-requests/SKILL.md | `bash "skills/kata-execute-phase/scripts/manage-worktree.sh"` | Copy to skill or add to kata-lib.cjs |
| kata-complete-milestone/SKILL.md | `bash "skills/kata-execute-phase/scripts/manage-worktree.sh"` | Copy to skill or add to kata-lib.cjs |
| kata-execute-phase/references/ | `bash scripts/read-config.sh` | Stale ref, replace with kata-lib.cjs |

**Actions:**
- Replace `check-roadmap-format.sh` calls → `node scripts/kata-lib.cjs check-roadmap` (functionality already exists)
- Replace `check-template-drift.sh` calls → `node scripts/kata-lib.cjs check-template-drift` (functionality already exists)
- Replace `read-config.sh` calls → `node scripts/kata-lib.cjs read-config` (functionality already exists)
- Replace `read-pref.sh` calls → `node scripts/kata-lib.cjs read-pref` (functionality already exists)
- Replace `bash "skills/kata-execute-phase/scripts/manage-worktree.sh"` → `bash "scripts/manage-worktree.sh"` (build distributes the script to each skill per Step 1)
- Replace `bash ../kata-*/scripts/X` → `node scripts/kata-lib.cjs <subcommand>` where equivalent exists

## Step 3: Audit all script references for spec compliance

Scan every SKILL.md and references/*.md file. Every script reference must be:
- Relative to skill root: `scripts/X` or `node scripts/X`
- No `../` cross-skill references
- No `skills/kata-*/scripts/` absolute-from-project-root references
- No `./scripts/X` (use `scripts/X` without `./` for consistency)
- No references to scripts that don't exist in the skill's `scripts/` directory

## Step 4: Plugin build transform

**Problem:** For plugins, Bash runs from user CWD, not skill directory. The `!` backtick feature runs commands at skill LOAD TIME and bakes the output into the prompt before Claude sees it.

**Transform approach:**
The plugin build adds a `!` backtick expression that resolves the skill's scripts directory at load time. For each SKILL.md in the plugin build:

1. Identify the skill name from the directory
2. Inject a scripts-directory resolver that checks the marketplace install path first, then falls back to searching:
   ```
   !`d="$HOME/.claude/plugins/kata/skills/SKILL_NAME/scripts"; [ -d "$d" ] && echo "$d" || find "$(pwd)" -maxdepth 5 -path "*/SKILL_NAME/scripts/kata-lib.cjs" -exec dirname {} \; -quit 2>/dev/null`
   ```
3. Replace `scripts/` prefixes in bash command contexts with the resolved path

This means standard skills SKILL.md files stay spec-compliant (relative paths). Only the plugin build output gets transformed.

**Implementation in build.js:**
- Update `transformPluginPaths(content, skillName)` to accept the skill name
- Parse bash code blocks for `scripts/` references
- Replace with `!` backtick resolved paths
- Only transform the plugin build, not the skills-sh build

## Step 5: Update build.js

- Create `skills/_shared/` directory as the source of truth for shared scripts
- Update `distributeKataLib()`: source from `skills/_shared/kata-lib.cjs` instead of `scripts/kata-lib.cjs`
- Add `distributeSharedScripts()`: copies `manage-worktree.sh` from `skills/_shared/` to the 4 skills that need it
- Add build validation: parse each skill's SKILL.md for `scripts/` references, verify every referenced script exists in that skill's `scripts/` dir in dist output
- Implement `transformPluginPaths(content, skillName)` for the plugin build (Step 4)
- Remove `scripts/kata-lib.cjs` from project root after migration
- Both `buildPlugin()` and `buildSkillsSh()` call the shared script distribution functions

## Step 6: Test every skill both ways

For each of the ~32 skills:
1. **As a standard skill:** Copy source `skills/kata-X/` to `.claude/skills/kata-X/`, invoke `/kata-X`, verify script execution works
2. **As a plugin:** Build with `npm run build:plugin`, load with `--plugin-dir dist/plugin`, invoke `/kata:kata-X`, verify script execution works

Automate this with a test script that:
- Copies each skill to `.claude/skills/`
- Runs `node .claude/skills/kata-X/scripts/kata-lib.cjs resolve-root` to verify the script exists and runs
- Builds the plugin and checks all `!` backtick expressions resolve correctly

## Verification

1. `npm run build:plugin && npm test` — build and existing tests pass
2. Copy any source skill to `.claude/skills/` — verify `kata-lib.cjs` is present
3. `grep -r '\.\.\/' skills/*/SKILL.md skills/*/references/*.md` — zero cross-skill references
4. `grep -r 'read-config\.sh\|read-pref\.sh' skills/` — zero stale script references
5. Load as plugin via `./scripts/test-local.sh`, run `/kata:kata-execute-phase 56` — scripts execute
6. Load as standard skill, run `/kata-execute-phase 56` — scripts execute
