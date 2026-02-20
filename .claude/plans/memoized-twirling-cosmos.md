# Plan: Agent Skills Spec-Compliant Script Resolution

## Context

Kata skills reference scripts in other skills' directories using `bash "../kata-configure-settings/scripts/read-config.sh"` (~65 cross-skill references across 20 SKILL.md files). The Agent Skills spec says: "use relative paths from the skill root" (e.g., `scripts/extract.py`) and "keep file references one level deep from SKILL.md." Cross-skill `../` references violate the spec, cause recurring path resolution failures, and are the root cause of the generate-intel.js UAT failure in phase 54.

## Approach

Create a single `scripts/kata-lib.js` Node.js CLI that consolidates all shared utility functions. The build system copies it into every skill's `scripts/` directory. SKILL.md files reference it as `node scripts/kata-lib.js <command>` (spec-compliant, one level deep, self-contained).

## Steps

### 1. Create `scripts/kata-lib.js` (~300 lines)

Single CommonJS file with CLI subcommands. Port logic verbatim from existing bash-wrapped-Node.js scripts:

| Command | Source | Behavior |
|---------|--------|----------|
| `resolve-root` | `project-root.sh` (25 lines) | Print project root path. Priority: KATA_PROJECT_ROOT > CWD/.planning > CWD/workspace/.planning > CWD/main/.planning |
| `read-config <key> [fallback]` | `read-config.sh` (41 lines) | Read from .planning/config.json with worktree fallback |
| `read-pref <key> [fallback]` | `read-pref.sh` (63 lines) | Read with DEFAULTS cascade (port DEFAULTS table verbatim) |
| `set-config <key> <value>` | `set-config.sh` (55 lines) | Write to config.json with type coercion + atomic write |
| `has-pref <key>` | `has-pref.sh` (38 lines) | Exit 0 if key exists in config, exit 1 if not |
| `check-config` | `check-config.sh` (92 lines) | Validate config against KNOWN_KEYS schema, print warnings, exit 0 |
| `check-roadmap` | `check-roadmap-format.sh` (44 lines) | Check ROADMAP.md format. Exit 0=current, 1=old, 2=missing |
| `check-template-drift` | `check-template-drift.sh` (149 lines) | Check project template overrides for missing fields. Discovers sibling skills via `path.join(__dirname, '..', '..')` |

Structure:
```
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Shared utilities: resolveRoot(), readJSON(), resolveNested()
// DEFAULTS table (from read-pref.sh)
// KNOWN_KEYS schema (from check-config.sh)
// Command implementations
// CLI router: switch on process.argv[2]
```

### 2. Update `scripts/build.js`

Add `distributeKataLib()` after skill copying in both `buildPlugin()` and `buildSkillsSh()`:

```javascript
function distributeKataLib(destSkillsDir) {
  const libSrc = path.join(ROOT, 'scripts', 'kata-lib.js');
  if (!fs.existsSync(libSrc)) return;
  const skillDirs = fs.readdirSync(destSkillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('kata-'));
  for (const skill of skillDirs) {
    const destScripts = path.join(destSkillsDir, skill.name, 'scripts');
    fs.mkdirSync(destScripts, { recursive: true });
    fs.copyFileSync(libSrc, path.join(destScripts, 'kata-lib.js'));
  }
}
```

Also add build validation: grep for remaining `../` references in SKILL.md files.

### 3. Update 20 SKILL.md files (~65 replacements)

**Before:**
```bash
MODEL_PROFILE=$(bash "../kata-configure-settings/scripts/read-config.sh" "model_profile" "balanced")
bash "../kata-doctor/scripts/check-roadmap-format.sh" 2>/dev/null
bash "../kata-doctor/scripts/check-config.sh" 2>/dev/null || true
```

**After:**
```bash
MODEL_PROFILE=$(node scripts/kata-lib.js read-config "model_profile" "balanced")
node scripts/kata-lib.js check-roadmap 2>/dev/null
node scripts/kata-lib.js check-config 2>/dev/null || true
```

Full replacement map:
- `bash "../kata-configure-settings/scripts/read-config.sh"` → `node scripts/kata-lib.js read-config` (45 refs, 18 skills)
- `bash "../kata-configure-settings/scripts/read-pref.sh"` → `node scripts/kata-lib.js read-pref` (4 refs, 2 skills)
- `bash "../kata-configure-settings/scripts/set-config.sh"` → `node scripts/kata-lib.js set-config` (2 refs, 1 skill)
- `bash "../kata-doctor/scripts/check-roadmap-format.sh"` → `node scripts/kata-lib.js check-roadmap` (8 refs, 8 skills)
- `bash "../kata-doctor/scripts/check-config.sh"` → `node scripts/kata-lib.js check-config` (3 refs, 3 skills)
- `bash "../kata-doctor/scripts/check-template-drift.sh"` → `node scripts/kata-lib.js check-template-drift` (2 refs, 2 skills)

Also fix own-skill references: `bash "./scripts/foo.sh"` → `bash scripts/foo.sh` (remove `./` prefix per spec).

Remove the "Script invocation rule" paragraph from skills that no longer have any cross-skill references.

### 4. Update skill-local bash scripts (10 scripts)

Scripts that `source "$SCRIPT_DIR/../../kata-configure-settings/scripts/project-root.sh"`:

Replace:
```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../kata-configure-settings/scripts/project-root.sh"
```

With:
```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT=$(node "$SCRIPT_DIR/kata-lib.js" resolve-root)
cd "$PROJECT_ROOT"
```

Scripts that also call `read-config.sh` or `get-phase-issue.sh` internally need those calls updated too. Affected scripts:
- `kata-execute-phase/scripts/find-phase.sh`
- `kata-execute-phase/scripts/create-phase-branch.sh`
- `kata-execute-phase/scripts/create-draft-pr.sh` (also sources read-config.sh, get-phase-issue.sh)
- `kata-execute-phase/scripts/manage-worktree.sh` (sources read-config.sh)
- `kata-execute-phase/scripts/update-issue-checkboxes.sh` (sources project-root.sh, read-config.sh, get-phase-issue.sh)
- `kata-doctor/scripts/check-config.sh` (replaced by kata-lib.js, can be deleted)
- `kata-doctor/scripts/check-roadmap-format.sh` (replaced by kata-lib.js, can be deleted)

### 5. Move `setup-worktrees.sh` to its only consumer

`kata-configure-settings/scripts/setup-worktrees.sh` is only referenced by `kata-new-project` (2 refs). Move it to `kata-new-project/scripts/setup-worktrees.sh` and update its internal calls to use kata-lib.js. Update SKILL.md references from `"../kata-configure-settings/scripts/setup-worktrees.sh"` to `scripts/setup-worktrees.sh`.

### 6. Delete replaced scripts

After all references are updated, delete:
- `kata-configure-settings/scripts/project-root.sh` (replaced by kata-lib.js resolve-root)
- `kata-configure-settings/scripts/read-config.sh` (replaced by kata-lib.js read-config)
- `kata-configure-settings/scripts/read-pref.sh` (replaced by kata-lib.js read-pref)
- `kata-configure-settings/scripts/set-config.sh` (replaced by kata-lib.js set-config)
- `kata-configure-settings/scripts/has-pref.sh` (replaced by kata-lib.js has-pref)
- `kata-configure-settings/scripts/setup-worktrees.sh` (moved to kata-new-project)
- `kata-doctor/scripts/check-config.sh` (replaced by kata-lib.js check-config)
- `kata-doctor/scripts/check-roadmap-format.sh` (replaced by kata-lib.js check-roadmap)
- `kata-doctor/scripts/check-template-drift.sh` (replaced by kata-lib.js check-template-drift)

Keep these (skill-specific, already spec-compliant):
- `kata-execute-phase/scripts/*` (7 scripts, all skill-local)
- `kata-map-codebase/scripts/generate-intel.js` (skill-local)
- `kata-customize/scripts/list-templates.sh` (skill-local)
- `kata-plan-phase/scripts/update-issue-plans.py` (skill-local)

### 7. Update generate-intel.js reference

In `kata-map-codebase/SKILL.md`, the reference is already `node "./scripts/generate-intel.js"`. Change to spec-compliant: `node scripts/generate-intel.js` (drop `./`).

## Files Modified

**Created:**
- `scripts/kata-lib.js` (new, ~300 lines)

**Modified (build):**
- `scripts/build.js`

**Modified (SKILL.md files, 20 total):**
- `skills/kata-add-issue/SKILL.md`
- `skills/kata-add-milestone/SKILL.md`
- `skills/kata-add-phase/SKILL.md`
- `skills/kata-audit-milestone/SKILL.md`
- `skills/kata-check-issues/SKILL.md`
- `skills/kata-complete-milestone/SKILL.md`
- `skills/kata-debug/SKILL.md`
- `skills/kata-doctor/SKILL.md`
- `skills/kata-execute-phase/SKILL.md`
- `skills/kata-execute-quick-task/SKILL.md`
- `skills/kata-map-codebase/SKILL.md`
- `skills/kata-move-phase/SKILL.md`
- `skills/kata-new-project/SKILL.md`
- `skills/kata-pause-work/SKILL.md`
- `skills/kata-plan-milestone-gaps/SKILL.md`
- `skills/kata-plan-phase/SKILL.md`
- `skills/kata-remove-phase/SKILL.md`
- `skills/kata-research-phase/SKILL.md`
- `skills/kata-review-pull-requests/SKILL.md`
- `skills/kata-track-progress/SKILL.md`
- `skills/kata-verify-work/SKILL.md`

**Modified (skill-local bash scripts):**
- `skills/kata-execute-phase/scripts/find-phase.sh`
- `skills/kata-execute-phase/scripts/create-phase-branch.sh`
- `skills/kata-execute-phase/scripts/create-draft-pr.sh`
- `skills/kata-execute-phase/scripts/manage-worktree.sh`
- `skills/kata-execute-phase/scripts/update-issue-checkboxes.sh`

**Moved:**
- `skills/kata-configure-settings/scripts/setup-worktrees.sh` → `skills/kata-new-project/scripts/setup-worktrees.sh`

**Deleted (9 files):**
- `skills/kata-configure-settings/scripts/project-root.sh`
- `skills/kata-configure-settings/scripts/read-config.sh`
- `skills/kata-configure-settings/scripts/read-pref.sh`
- `skills/kata-configure-settings/scripts/set-config.sh`
- `skills/kata-configure-settings/scripts/has-pref.sh`
- `skills/kata-doctor/scripts/check-config.sh`
- `skills/kata-doctor/scripts/check-roadmap-format.sh`
- `skills/kata-doctor/scripts/check-template-drift.sh`

## Verification

1. `node scripts/kata-lib.js resolve-root` from project directory prints correct root
2. `node scripts/kata-lib.js read-config "model_profile" "balanced"` returns config value
3. `node scripts/kata-lib.js check-config` validates config without errors
4. `node scripts/kata-lib.js check-roadmap` returns correct exit code
5. `npm run build:plugin` succeeds, every skill's `scripts/` contains `kata-lib.js`
6. `npm run test:scripts` passes
7. `grep -r '"\.\./' dist/plugin/skills/` returns zero results (no cross-skill refs in built output)
8. `grep -r 'bash "\.\.\|bash "\.\/' dist/plugin/skills/` returns zero results
9. Build and test on UAT project: `cd ../kata-burner/uat-54 && claude --plugin-dir /path/to/dist/plugin` then run `/kata-map-codebase` and verify `.planning/intel/` gets generated
