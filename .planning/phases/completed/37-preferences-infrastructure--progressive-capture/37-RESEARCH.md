# Phase 37 Research: Preferences Infrastructure & Progressive Capture

## Standard Stack

**Confidence: HIGH** (verified against existing codebase patterns)

| Tool | Purpose | Why |
|------|---------|-----|
| `node -e` inline | JSON read/write in shell scripts | Existing pattern in kata-new-project, kata-configure-settings, kata-brainstorm |
| `fs.renameSync` | Atomic file writes | Node's rename is atomic on POSIX; used for temp-file-then-rename pattern |
| `bash` shell scripts | Script entry points (`read-pref.sh`, `has-pref.sh`, `set-config.sh`) | Matches `find-phase.sh` precedent |
| `SKILL_BASE_DIR` | Script path resolution | Skills reference scripts via `${SKILL_BASE_DIR}/scripts/` (see kata-execute-phase) |

**Runtime dependencies:** Node.js (required by Claude Code itself; always present).

**Not used:** `jq` is available on dev machine but not guaranteed on all user systems. Node.js is guaranteed because Claude Code runs on it.

## Architecture Patterns

### Pattern 1: Script Placement

Scripts live at `skills/kata-{skill-name}/scripts/` when skill-specific, referenced via `${SKILL_BASE_DIR}/scripts/`. The three new scripts (`read-pref.sh`, `has-pref.sh`, `set-config.sh`) are cross-skill utilities.

**Placement decision:** These scripts must be accessible from any skill. Two viable locations:

1. **A shared skill directory** (e.g., `skills/kata-shared-scripts/scripts/`) -- no precedent, adds a non-skill directory to skills/
2. **A dedicated top-level directory** (e.g., `scripts/`) -- exists but is build/dev scripts, not runtime
3. **Inside a "host" skill's scripts directory** (e.g., `skills/kata-configure-settings/scripts/`) -- other skills reference via relative path

**Recommendation:** Place scripts in `skills/kata-configure-settings/scripts/`. The settings skill is the natural owner of config/preference infrastructure. Other skills reference via `${SKILL_BASE_DIR}/../kata-configure-settings/scripts/read-pref.sh` or skills inline the `node -e` pattern directly (as the brainstorm report proposed with `${KATA_SCRIPTS}/read-pref.sh`).

**Critical constraint from build.js:** The build system copies `skills/*/scripts/` directories into `dist/plugin/skills/*/scripts/`. Scripts placed under any skill directory get distributed automatically. No build.js changes needed.

**Alternative (simpler):** Since skills are markdown prompts that Claude interprets, the scripts can be documented as inline `node -e` patterns in a reference file rather than standalone `.sh` files. Skills already use `node -e` inline for JSON manipulation (kata-new-project line 682, kata-configure-settings line 179). However, standalone scripts provide:
- Consistent behavior (no escaping issues with `!==` in bash `node -e`)
- Single source of truth for defaults table
- Testable in isolation

**Decision: Use standalone `.sh` scripts.** The `!==` escaping issue in bash `node -e` is a real pain point observed during this research.

### Pattern 2: Config Read (Existing)

~90 instances of this pattern across skills:

```bash
VALUE=$(cat .planning/config.json 2>/dev/null | grep -o '"key"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "default")
```

For booleans:
```bash
VALUE=$(cat .planning/config.json 2>/dev/null | grep -o '"key"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
```

**Phase 37 does NOT migrate these.** Migration is listed as a deferred requirement. The accessor script coexists with existing grep patterns. New code written in this phase uses the accessor; existing grep patterns continue working.

### Pattern 3: Config Write (Current)

Two skills write to config.json:
- `kata-configure-settings` (SKILL.md line 162): "Write updated config to `.planning/config.json`" -- Claude reads the whole file, modifies the object, and writes it back using the Write tool.
- `kata-set-profile` (SKILL.md line 56): Same approach.

These are Claude-interpreted instructions, not bash scripts. Claude uses its Write tool for JSON updates. The `set-config.sh` script is for cases where a bash code block in a skill needs to write a config value programmatically (e.g., the check-or-ask pattern in kata-plan-phase step 3.5).

### Pattern 4: Preference vs Config Boundary

From brainstorm:
- **preferences.json**: flat dot-notation keys, project-lifetime constants
- **config.json**: nested JSON, session-variable settings

The resolution chain for `read-pref.sh`:
```
preferences.json (flat key lookup)
  -> config.json (nested key resolution)
    -> built-in defaults (flat key lookup)
```

Config.json fallback handles backward compatibility. Keys like `pr_workflow` and `commit_docs` that exist in config.json today will be read correctly without migration.

### Pattern 5: Atomic Write

```bash
# Write to temp file, then atomic rename
node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('file.json', 'utf8'));
  // ... modify data ...
  const tmp = 'file.json.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, 'file.json');
"
```

`fs.renameSync` is atomic on POSIX systems (macOS, Linux). This prevents partial writes if the process is interrupted.

## Don't Hand-Roll

| Problem | Use Instead |
|---------|-------------|
| JSON parsing in bash | `node -e` with `JSON.parse` / `fs.readFileSync` |
| Nested key resolution | `resolveNested()` function that walks dot-separated path |
| File write atomicity | `fs.writeFileSync` to temp + `fs.renameSync` to target |
| Boolean/value type coercion | Node-side parsing: `true`/`false` -> boolean, numeric strings -> number |
| Defaults management | Single DEFAULTS object in each script (read-pref.sh is the canonical source) |

## Common Pitfalls

### 1. Bash escaping with `node -e` (HIGH confidence)

**Problem:** The `!==` operator in JavaScript gets mangled by bash. Shell interprets `!` as history expansion.

**Solution:** Use heredoc syntax for inline Node scripts, or use standalone `.sh` files that contain the Node invocation in a heredoc:

```bash
node << 'NODE_EOF'
  // JavaScript here -- no escaping issues
  if (typeof val !== 'object') return undefined;
NODE_EOF
```

**Verification:** Test all scripts with `bash -x` to catch escaping issues.

### 2. Inconsistent defaults across skills (HIGH confidence)

**Problem:** Found during brainstorm research. `issueMode` defaults to `"never"` in execute-phase but `"auto"` in add-milestone. The grep pattern duplicates the default value at every call site.

**Solution:** `read-pref.sh` has ONE defaults table. All new code uses the accessor. Existing grep patterns are not migrated in this phase (deferred).

### 3. `grep -o '"enabled"'` matches wrong key (MEDIUM confidence)

**Problem:** The `enabled` key in `github.enabled` could collide with a hypothetically added `notifications.enabled`. Current code uses `head -1` as a workaround.

**Solution:** The accessor script reads the full JSON structure, so key collisions are impossible. This is a benefit of moving to programmatic JSON access vs grep.

### 4. Preferences.json scaffolded empty (HIGH confidence)

**Problem:** An empty file `{}` must be valid JSON. Skills calling `read-pref.sh` on an empty preferences.json must fall through to config.json and defaults.

**Solution:** `kata-new-project` scaffolds `{}` (empty object). The accessor's `try/catch` around `JSON.parse` handles missing or empty files gracefully.

### 5. Config.json key-absence as "not yet asked" signal (HIGH confidence)

**Problem:** The check-or-ask pattern needs to distinguish "user chose balanced" from "user hasn't been asked yet." If kata-new-project writes all keys with defaults, key-absence can't be used.

**Solution from brainstorm:** Use key-absence approach. kata-new-project writes ONLY the 5 explicitly-asked keys + github block + silent-default workflow block. `model_profile` is absent from config.json until first `/kata-plan-phase` asks. `has-pref.sh` / `read-pref.sh` handles the fallback chain. Skills check config key existence to detect "first run."

Concrete: After kata-new-project, config.json contains:
```json
{
  "mode": "yolo",
  "depth": "standard",
  "commit_docs": true,
  "pr_workflow": false,
  "display": { "statusline": true },
  "workflow": { "research": true, "plan_check": true, "verifier": true },
  "github": { "enabled": false, "issueMode": "never" }
}
```

Note: `model_profile` and `parallelization` are absent. `model_profile` absence triggers the check-or-ask in kata-plan-phase step 3.5.

### 6. Parallelization key removal scope (HIGH confidence)

**Problem:** `parallelization` appears in 5+ files that need modification.

**Files containing `parallelization` that need changes:**
- `skills/kata-new-project/SKILL.md` (Round 1 question + JSON template + success criteria)
- `skills/kata-configure-settings/SKILL.md` (schema mention + JSON template)
- `skills/kata-execute-phase/references/planning-config.md` (schema table + JSON template)
- `README.md` (config schema table)

**Files to NOT change** (historical/completed references):
- `.planning/phases/completed/` files
- `.planning/quick/` completed summaries
- `.planning/brainstorms/` reports (historical record)
- `.docs/USER-JOURNEYS.md` (documentation, separate update)

### 7. Script path resolution across skills (MEDIUM confidence)

**Problem:** Skills need to find the accessor scripts. `${SKILL_BASE_DIR}` points to the current skill's directory, not a shared scripts directory.

**Solution:** Two approaches, both workable:
1. Skills that need the accessor derive the path: `SCRIPTS_DIR="${SKILL_BASE_DIR}/../kata-configure-settings/scripts"`
2. Skills inline a comment pointing to the canonical pattern and use a local copy of the `node` heredoc

Given that only 2-3 skills need the accessor in this phase (kata-plan-phase for check-or-ask, kata-new-project for scaffolding), option 1 is sufficient. The path resolution is:
```bash
KATA_SCRIPTS="${SKILL_BASE_DIR}/../kata-configure-settings/scripts"
```

This works because all skills are siblings under `skills/`.

## Code Examples

### read-pref.sh

```bash
#!/usr/bin/env bash
# Usage: read-pref.sh <key> [fallback]
# Resolution: preferences.json -> config.json -> built-in defaults -> fallback arg
set -euo pipefail

KEY="${1:?Usage: read-pref.sh <key> [fallback]}"
FALLBACK="${2:-}"

node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;
const FALLBACK = process.env.FALLBACK;

const DEFAULTS = {
  'release.changelog': 'true',
  'release.changelog_format': 'keep-a-changelog',
  'release.version_bump': 'conventional-commits',
  'docs.readme_on_milestone': 'prompt',
  'docs.auto_update_files': 'README.md',
  'conventions.commit_format': 'conventional',
  'mode': 'yolo',
  'depth': 'standard',
  'model_profile': 'balanced',
  'pr_workflow': 'false',
  'commit_docs': 'true',
  'display.statusline': 'true',
  'workflow.research': 'true',
  'workflow.plan_check': 'true',
  'workflow.verifier': 'true',
  'github.enabled': 'false',
  'github.issueMode': 'never'
};

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function resolveNested(obj, key) {
  const parts = key.split('.');
  let val = obj;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return undefined;
    val = val[p];
  }
  return val;
}

const prefs = readJSON('.planning/preferences.json');
const config = readJSON('.planning/config.json');

const v = prefs[KEY] ?? resolveNested(config, KEY) ?? DEFAULTS[KEY] ?? FALLBACK ?? '';
process.stdout.write(typeof v === 'object' ? JSON.stringify(v) : String(v));
NODE_EOF
```

**Note:** Uses `process.env` to pass KEY/FALLBACK to avoid shell interpolation issues. The script must export these: `KEY="$KEY" FALLBACK="$FALLBACK" node << 'NODE_EOF'`.

### has-pref.sh

```bash
#!/usr/bin/env bash
# Usage: has-pref.sh <key>
# Exit 0 = user has expressed preference, exit 1 = no preference set
set -euo pipefail

KEY="${1:?Usage: has-pref.sh <key>}"

KEY="$KEY" node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function resolveNested(obj, key) {
  const parts = key.split('.');
  let val = obj;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return undefined;
    val = val[p];
  }
  return val;
}

const prefs = readJSON('.planning/preferences.json');
const config = readJSON('.planning/config.json');

// Key exists in prefs (explicitly set) or config (legacy)
const inPrefs = prefs[KEY] !== undefined;
const inConfig = resolveNested(config, KEY) !== undefined;

process.exit(inPrefs || inConfig ? 0 : 1);
NODE_EOF
```

### set-config.sh

```bash
#!/usr/bin/env bash
# Usage: set-config.sh <dot.key.path> <value>
# Handles: JSON parse, nested key set, type coercion, atomic write
set -euo pipefail

KEY="${1:?Usage: set-config.sh <key> <value>}"
VALUE="${2:?Usage: set-config.sh <key> <value>}"
CONFIG_FILE=".planning/config.json"

KEY="$KEY" VALUE="$VALUE" CONFIG_FILE="$CONFIG_FILE" node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;
const VALUE = process.env.VALUE;
const FILE = process.env.CONFIG_FILE;

let config;
try { config = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
catch { config = {}; }

// Navigate/create nested path
const parts = KEY.split('.');
let obj = config;
for (let i = 0; i < parts.length - 1; i++) {
  if (!(parts[i] in obj) || typeof obj[parts[i]] !== 'object') {
    obj[parts[i]] = {};
  }
  obj = obj[parts[i]];
}

// Type coercion
let parsed;
if (VALUE === 'true') parsed = true;
else if (VALUE === 'false') parsed = false;
else if (VALUE !== '' && !isNaN(VALUE)) parsed = Number(VALUE);
else parsed = VALUE;

obj[parts[parts.length - 1]] = parsed;

// Atomic write
const tmp = FILE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
fs.renameSync(tmp, FILE);
NODE_EOF
```

### Check-or-ask pattern (kata-plan-phase step 3.5)

```bash
# Check if model_profile has been set
MODEL_PROFILE_SET=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"' | head -1)

if [ -z "$MODEL_PROFILE_SET" ]; then
  # First run: prompt user for model_profile
  # (Use AskUserQuestion in skill markdown)
  # After user responds, write via set-config:
  bash "${KATA_SCRIPTS}/set-config.sh" "model_profile" "$CHOSEN_PROFILE"

  # Display first-run agent defaults notice
fi
```

### Silent default notice (first-run box)

```markdown
+--------------------------------------------------+
| Agent defaults active: Research, Plan Check,     |
| Verification. Run /kata-configure-settings to    |
| customize agent preferences.                     |
+--------------------------------------------------+
```

Display condition: `model_profile` key was just written (this is the first plan-phase run). On subsequent runs, `model_profile` exists in config, so step 3.5 is a no-op and the box doesn't show.

## Files Modified by This Phase

### New Files
- `skills/kata-configure-settings/scripts/read-pref.sh`
- `skills/kata-configure-settings/scripts/has-pref.sh`
- `skills/kata-configure-settings/scripts/set-config.sh`

### Modified Files
- `skills/kata-new-project/SKILL.md` -- reduce Phase 5 to 5 questions, scaffold preferences.json, remove parallelization question
- `skills/kata-plan-phase/SKILL.md` -- add step 3.5 (check-or-ask model_profile), add first-run notice
- `skills/kata-configure-settings/SKILL.md` -- remove parallelization from schema
- `skills/kata-execute-phase/references/planning-config.md` -- remove parallelization from schema table
- `README.md` -- remove parallelization from config schema docs

### Unchanged (Deferred)
- Existing ~90 grep patterns for config.json reads (migrate incrementally in future)
- `.docs/USER-JOURNEYS.md` (documentation update, separate concern)

## Open Questions (Resolved)

1. **Should read-pref.sh handle nested config.json keys?** YES. The `resolveNested()` function walks dot-notation paths through nested JSON. `read-pref.sh workflow.research` resolves to `config.workflow.research`.

2. **How does KATA_SCRIPTS resolve?** Via relative path from `SKILL_BASE_DIR`: `"${SKILL_BASE_DIR}/../kata-configure-settings/scripts"`. All skills are siblings under `skills/`.

3. **Should preferences.json be committed?** It follows the `commit_docs` rule. If `commit_docs: true`, preferences.json is committed. The scaffolding in kata-new-project includes it in the initial commit alongside config.json.

4. **Key-absence vs sentinel for "not yet asked"?** Key-absence. Simpler, no schema overhead. kata-new-project omits `model_profile` from config.json. Presence = asked, absence = not asked.

## Scope Assessment

10 requirements, but many are small modifications to existing files. The work groups naturally:

1. **Foundation scripts** (PREF-02, PREF-03, CAP-04): Three shell scripts, each ~40 lines. Self-contained, testable.
2. **Preference file + defaults** (PREF-01, PREF-05): Scaffold preferences.json, populate defaults table in read-pref.sh.
3. **Onboarding reduction** (CAP-01, PREF-04, CAP-05): Modify kata-new-project Phase 5, remove parallelization, scaffold preferences.json.
4. **Progressive capture** (CAP-02, CAP-03): Modify kata-plan-phase (step 3.5), add default notices.

Groups 1-2 are natural Plan 1 (foundational). Groups 3-4 are Plan 2 (skill modifications that depend on the scripts).
