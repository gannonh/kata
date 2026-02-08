# Phase 41: Validation Migration - Research

**Researched:** 2026-02-08
**Domain:** Bash validation scripts, skill pre-flight patterns, Claude Code plugin/skills hook architecture
**Confidence:** HIGH

## Summary

Phase 41 moves two SessionStart hooks into skill pre-flight steps so validation runs universally for plugin and skills-only users. The two hooks are `kata-template-drift.js` (checks project template overrides for missing required fields) and `kata-config-validator.js` (validates `.planning/config.json` against a known schema).

Both hooks currently depend on `CLAUDE_PLUGIN_ROOT`, which only exists for plugin installations. Skills-only users (installed via `npx skills add`) get zero validation. The migration repackages the same validation logic as Bash scripts using the sibling discovery pattern established in Phase 40, then adds pre-flight calls to the skills that benefit from each check.

The codebase already has an established pre-flight pattern: 12 skills call `check-roadmap-format.sh` from `kata-doctor/scripts/` using `${SKILL_BASE_DIR}/../kata-doctor/scripts/check-roadmap-format.sh`. The validation scripts follow this same pattern.

**Primary recommendation:** Create two new Bash scripts in `kata-doctor/scripts/` (the health-check skill), wire them into the existing pre-flight sections of relevant skills, and delete the two hook files plus the `hooks/hooks.json` entries.

## Standard Stack

No external libraries. This phase creates Bash validation scripts and modifies SKILL.md pre-flight sections.

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Bash | 3.2+ (macOS default) | Script runtime | Already used by all Kata scripts |
| Node.js (inline) | 20+ | JSON parsing within Bash scripts | Same pattern as `read-pref.sh` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Bash wrapper + inline Node | Pure Node.js scripts | Breaks pattern consistency with other scripts. All existing Kata scripts are Bash with optional inline Node for JSON. |
| Centralized validation script (one script, two modes) | Two separate scripts | Separate scripts are clearer, match the two distinct concerns, and can be called independently. |

## Architecture Patterns

### Current Hook Architecture (What's Being Replaced)

```
hooks/
├── hooks.json                    # SessionStart hook registry
├── kata-template-drift.js        # Template drift detection (113 lines)
└── kata-config-validator.js      # Config validation (103 lines)
```

**hooks.json wires two Node.js scripts to SessionStart:**
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-template-drift.js" },
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-config-validator.js" }
      ]
    }]
  }
}
```

**Problem:** `${CLAUDE_PLUGIN_ROOT}` is only set for plugin installations. Skills-only users (`.claude/skills/`) have no plugin root, so these hooks never run.

### Target Architecture (After Migration)

```
skills/kata-doctor/scripts/
├── check-roadmap-format.sh       # Existing (12 skills already call this)
├── check-template-drift.sh       # NEW: Template drift detection
└── check-config.sh               # NEW: Config validation
```

Skills call the new scripts in their pre-flight steps, using the same `${SKILL_BASE_DIR}/../kata-doctor/scripts/` pattern already established for roadmap checks.

### Established Pre-Flight Pattern

12 skills already include this pre-flight step:

```bash
bash "${SKILL_BASE_DIR}/../kata-doctor/scripts/check-roadmap-format.sh" 2>/dev/null
FORMAT_EXIT=$?
```

The new validation scripts follow the identical calling convention:

```bash
bash "${SKILL_BASE_DIR}/../kata-doctor/scripts/check-config.sh" 2>/dev/null
bash "${SKILL_BASE_DIR}/../kata-doctor/scripts/check-template-drift.sh" 2>/dev/null
```

**Exit codes:** 0 = clean (or not applicable), non-zero = warnings printed to stdout.
**Output:** Warning messages printed to stdout for Claude to see and relay to user. No JSON, no structured data.
**Error handling:** `2>/dev/null` suppresses stderr. Scripts must never cause skill failure (exit 0 on errors, print warnings only).

### Script Design: check-config.sh

Port `kata-config-validator.js` (103 lines) to a Bash script with inline Node.js for JSON parsing (same pattern as `read-pref.sh`).

**Input:** None (reads `.planning/config.json` from cwd)
**Output:** Warning messages to stdout (one per issue)
**Exit code:** Always 0 (validation warnings don't block skills)

Logic:
1. Check if `.planning/config.json` exists. If not, exit 0 silently.
2. Parse JSON, flatten keys, validate each against the known schema.
3. Print `[kata] Config warning: Unknown key 'X'` for unknown keys.
4. Print `[kata] Config error: Invalid value for 'X'...` for type mismatches.

The known keys schema moves from the JS file into the Bash script (or stays as inline Node.js). The inline Node approach is preferred because JSON parsing in pure Bash is fragile.

### Script Design: check-template-drift.sh

Port `kata-template-drift.js` (113 lines) to a Bash script with inline Node.js.

**Input:** None (reads `.planning/templates/` and discovers sibling skills from cwd)
**Output:** Warning messages to stdout (one per drifted template)
**Exit code:** Always 0

Logic:
1. Check if `.planning/templates/` directory exists with `.md` files. If not, exit 0.
2. For each override file in `.planning/templates/`:
   a. Find the corresponding default template via sibling discovery (Phase 40 pattern: `$(dirname "$0")/../..` reaches `skills/`, glob `kata-*/references/${filename}`)
   b. Parse the `kata-template-schema` comment from the default
   c. Check the override for missing required fields
   d. Print `[kata] Template drift: {filename} missing required field(s): {fields}. Run resolve-template.sh for defaults.`

**Key change from hook:** The hook used `path.join(pluginRoot, 'skills')`. The script uses the same sibling discovery as Phase 40's `resolve-template.sh`: navigate from `kata-doctor/scripts/` two levels up to `skills/`, then glob `kata-*/references/`.

### Skills That Need Each Validation

**Config validation** belongs in skills that read config values. The top-level orchestrator skills are:

| Skill | Reads Config | Pre-flight Already Exists |
| --- | --- | --- |
| kata-execute-phase | model_profile, pr_workflow, github, verifier, commit_docs | Yes (roadmap check) |
| kata-plan-phase | model_profile, research, plan_check, github | Yes (roadmap check) |
| kata-verify-work | pr_workflow, model_profile, commit_docs | No |
| kata-complete-milestone | version_files, pre_release_commands | Yes (roadmap check) |
| kata-configure-settings | All config keys | No (validates on write) |
| kata-new-project | Creates config.json | No (creates, doesn't validate existing) |
| kata-add-milestone | model_profile | Yes (roadmap check) |
| kata-execute-quick-task | Reads config via subagent | No pre-flight section for config |
| kata-track-progress | No direct config read | Yes (roadmap check) |

**Recommendation:** Add config validation to the 5 primary orchestrator skills that read config and already have pre-flight sections: `kata-execute-phase`, `kata-plan-phase`, `kata-complete-milestone`, `kata-add-milestone`, `kata-verify-work`. These are the entry points where invalid config would cause problems.

**Template drift validation** belongs in skills that resolve templates:

| Skill | Templates Used | Pre-flight Already Exists |
| --- | --- | --- |
| kata-execute-phase | summary-template.md | Yes |
| kata-plan-phase | plan-template.md | Yes |
| kata-verify-work | UAT-template.md, verification-report.md | No |
| kata-complete-milestone | changelog-entry.md | Yes |

**Recommendation:** Add template drift check to the same 4 skills that call `resolve-template.sh`. These are the skills where drift would cause actual problems.

### Validation Deduplication

Skills run per-invocation, so validation would re-run every time. Since these are fast filesystem checks (no network, no builds), repeated execution is acceptable. The scripts should be fast (< 100ms) and side-effect-free.

If a user runs `kata-plan-phase` then `kata-execute-phase` in the same session, config validation runs twice. This is fine because:
1. The config could have changed between invocations
2. Sub-100ms cost is negligible
3. No risk of race conditions or side effects

### Build System Impact

The `scripts/build.js` already copies `skills/` including `scripts/` subdirectories. New scripts in `kata-doctor/scripts/` are automatically included in both `dist/plugin/` and `dist/skills-sh/` builds with no build changes needed.

The `hooks/` directory and `hooks.json` are currently copied to `dist/plugin/hooks/`. After removing the hooks, the hooks directory becomes empty. The build system should either:
- Remove the hooks copy entirely (clean)
- Leave hooks in INCLUDES but the empty directory gets skipped

**Recommendation:** Remove `'hooks'` from the INCLUDES array in `scripts/build.js` and delete the `hooks/` directory entirely.

### Hook Removal

After validation is wired into skills:

1. Delete `hooks/kata-template-drift.js`
2. Delete `hooks/kata-config-validator.js`
3. Delete `hooks/hooks.json` (or empty it)
4. Remove `'hooks'` from `scripts/build.js` INCLUDES array
5. Delete `hooks/` directory
6. Remove `scripts/build-hooks.cjs` (no longer needed)
7. Remove `"build:hooks"` and `"prepublishOnly"` from `package.json` scripts

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| JSON parsing in Bash | Custom Bash JSON parser | Inline Node.js heredoc (like read-pref.sh) | JSON parsing in pure Bash is fragile and unreliable |
| Template discovery | Custom search logic | Sibling discovery pattern from Phase 40 | Proven to work across all installation layouts |
| Validation output format | Structured JSON output | Plain text `[kata]` prefixed messages | Claude reads stdout directly; no structured protocol needed |

## Common Pitfalls

### Pitfall 1: Script exits with non-zero on validation warnings

**What goes wrong:** If `check-config.sh` exits with code 1 when it finds invalid config, and the calling skill has `set -e` in its pre-flight bash block, the entire skill aborts.
**Why it happens:** The current hooks exit 0 always, but a developer might think "invalid = error = exit 1."
**How to avoid:** Both new scripts must exit 0 always. Validation warnings are informational, not blocking. Print messages to stdout so Claude sees them. Never exit non-zero from a validation check.
**Warning signs:** Skills abort immediately after the pre-flight step with no clear error.

### Pitfall 2: Breaking skills-only installs with CLAUDE_PLUGIN_ROOT references

**What goes wrong:** If any part of the new scripts references `CLAUDE_PLUGIN_ROOT`, skills-only users get no validation (the whole point of this migration).
**Why it happens:** Copy-paste from the existing hook code.
**How to avoid:** The scripts must use only `$(dirname "$0")` and sibling discovery. Zero references to `CLAUDE_PLUGIN_ROOT`. Add a test that greps for `CLAUDE_PLUGIN_ROOT` in the new scripts.

### Pitfall 3: check-template-drift.sh fails when no overrides exist

**What goes wrong:** Script errors when `.planning/templates/` doesn't exist or is empty.
**Why it happens:** Most projects don't have template overrides.
**How to avoid:** Early exit (exit 0) if the directory doesn't exist or contains no `.md` files. This is the common case.

### Pitfall 4: Inline Node.js heredoc quoting issues

**What goes wrong:** Bash variable expansion inside Node.js heredocs corrupts the JavaScript.
**Why it happens:** Using `<< EOF` instead of `<< 'EOF'` (quoted heredoc prevents expansion).
**How to avoid:** Always use `<< 'NODE_EOF'` (single-quoted delimiter) for inline Node. Pass data via environment variables, not string interpolation. Same pattern as `read-pref.sh`.

### Pitfall 5: Forgetting to update kata-verify-work pre-flight

**What goes wrong:** `kata-verify-work` uses templates and config but currently has no pre-flight section.
**Why it happens:** The roadmap check pre-flight was added to skills that read ROADMAP.md. kata-verify-work doesn't read ROADMAP.md directly.
**How to avoid:** When adding config/template validation, also add it to kata-verify-work SKILL.md, even though it doesn't have an existing pre-flight section. Create a new pre-flight step.

## Code Examples

### check-config.sh

```bash
#!/usr/bin/env bash
# Usage: check-config.sh
# Validates .planning/config.json against known schema
# Output: Warning messages to stdout
# Exit: Always 0 (warnings only, never blocks)
set -euo pipefail

# Exit silently if no config file
[ -f .planning/config.json ] || exit 0

node << 'NODE_EOF'
const fs = require('fs');

const KNOWN_KEYS = {
  'mode': { type: 'enum', values: ['yolo', 'interactive'] },
  'depth': { type: 'enum', values: ['quick', 'standard', 'comprehensive'] },
  'model_profile': { type: 'enum', values: ['quality', 'balanced', 'budget'] },
  'commit_docs': { type: 'boolean' },
  'pr_workflow': { type: 'boolean' },
  'parallelization': { type: 'boolean' },
  'workflow.research': { type: 'boolean' },
  'workflow.plan_check': { type: 'boolean' },
  'workflow.verifier': { type: 'boolean' },
  'github.enabled': { type: 'boolean' },
  'github.issueMode': { type: 'enum', values: ['auto', 'never'] },
  'workflows.execute-phase.post_task_command': { type: 'string' },
  'workflows.execute-phase.commit_style': { type: 'enum', values: ['conventional', 'semantic', 'simple'] },
  'workflows.execute-phase.commit_scope_format': { type: 'string' },
  'workflows.verify-work.extra_verification_commands': { type: 'array' },
  'workflows.complete-milestone.version_files': { type: 'array' },
  'workflows.complete-milestone.pre_release_commands': { type: 'array' }
};

function flattenConfig(obj, prefix = '') {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenConfig(value, fullKey));
    } else {
      entries.push({ key: fullKey, value });
    }
  }
  return entries;
}

function validateValue(key, value, schema) {
  switch (schema.type) {
    case 'boolean':
      if (typeof value !== 'boolean')
        return `[kata] Config error: Invalid value for '${key}': expected boolean, got '${value}'`;
      break;
    case 'enum':
      if (!schema.values.includes(value))
        return `[kata] Config error: Invalid value for '${key}': expected one of ${schema.values.join(', ')}; got '${value}'`;
      break;
    case 'array':
      if (!Array.isArray(value))
        return `[kata] Config error: Invalid value for '${key}': expected array, got '${value}'`;
      break;
    case 'string':
      if (typeof value !== 'string')
        return `[kata] Config error: Invalid value for '${key}': expected string, got '${value}'`;
      break;
  }
  return null;
}

try {
  const config = JSON.parse(fs.readFileSync('.planning/config.json', 'utf8'));
  const entries = flattenConfig(config);

  for (const { key, value } of entries) {
    const schema = KNOWN_KEYS[key];
    if (!schema) {
      console.log(`[kata] Config warning: Unknown key '${key}'`);
      continue;
    }
    const error = validateValue(key, value, schema);
    if (error) console.log(error);
  }
} catch (e) {
  // Silent fail - never block skill execution
}
NODE_EOF

exit 0
```

### check-template-drift.sh

```bash
#!/usr/bin/env bash
# Usage: check-template-drift.sh
# Checks project template overrides for missing required fields
# Output: Warning messages to stdout
# Exit: Always 0 (warnings only, never blocks)
set -euo pipefail

# Exit silently if no template overrides directory
TEMPLATES_DIR=".planning/templates"
[ -d "$TEMPLATES_DIR" ] || exit 0

# Check for .md files
OVERRIDES=$(ls "$TEMPLATES_DIR"/*.md 2>/dev/null)
[ -z "$OVERRIDES" ] && exit 0

# Discover sibling skills directory
# Script is at skills/kata-doctor/scripts/check-template-drift.sh
# Two levels up: scripts/ -> kata-doctor/ -> skills/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

TEMPLATES_DIR="$TEMPLATES_DIR" SKILLS_DIR="$SKILLS_DIR" node << 'NODE_EOF'
const fs = require('fs');
const path = require('path');

const templatesDir = process.env.TEMPLATES_DIR;
const skillsDir = process.env.SKILLS_DIR;

function parseSchemaComment(content) {
  const match = content.match(/<!--\s*kata-template-schema\n([\s\S]*?)-->/);
  if (!match) return null;
  const schema = match[1];
  const required = { frontmatter: [], body: [] };

  const fmSection = schema.match(/required-fields:\s*\n\s*frontmatter:\s*\[([^\]]*)\]/);
  if (fmSection) {
    required.frontmatter = fmSection[1].split(',').map(f => f.trim()).filter(Boolean);
  }

  const bodySection = schema.match(/body:\s*\[([^\]]*)\]/);
  if (bodySection) {
    required.body = bodySection[1].split(',').map(f => f.trim()).filter(Boolean);
  }

  return required;
}

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  return fmMatch ? fmMatch[1] : '';
}

function checkFieldPresence(content, required) {
  const missing = [];
  const frontmatter = parseFrontmatter(content);
  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  for (const field of required.frontmatter) {
    const pattern = new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm');
    if (!pattern.test(frontmatter)) missing.push(field);
  }

  for (const section of required.body) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingPattern = new RegExp(`^#+\\s+${escaped}`, 'mi');
    const tagPattern = new RegExp(`<${escaped}[>\\s]`, 'i');
    if (!headingPattern.test(bodyContent) && !tagPattern.test(bodyContent) && !bodyContent.includes(section))
      missing.push(section);
  }

  return missing;
}

try {
  const overrideFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));

  for (const filename of overrideFiles) {
    // Find corresponding default in sibling skills
    let defaultContent = null;
    const skillDirs = fs.readdirSync(skillsDir).filter(d => d.startsWith('kata-'));
    for (const skillDir of skillDirs) {
      const defaultPath = path.join(skillsDir, skillDir, 'references', filename);
      if (fs.existsSync(defaultPath)) {
        defaultContent = fs.readFileSync(defaultPath, 'utf8');
        break;
      }
    }

    if (!defaultContent) continue;

    const required = parseSchemaComment(defaultContent);
    if (!required) continue;

    const overridePath = path.join(templatesDir, filename);
    const overrideContent = fs.readFileSync(overridePath, 'utf8');
    const missing = checkFieldPresence(overrideContent, required);

    if (missing.length > 0) {
      console.log(`[kata] Template drift: ${filename} missing required field(s): ${missing.join(', ')}. Run resolve-template.sh for defaults.`);
    }
  }
} catch (e) {
  // Silent fail - never block skill execution
}
NODE_EOF

exit 0
```

### Pre-flight injection pattern (per skill)

```bash
# Add after existing roadmap format check in pre-flight section:
bash "${SKILL_BASE_DIR}/../kata-doctor/scripts/check-config.sh" 2>/dev/null
bash "${SKILL_BASE_DIR}/../kata-doctor/scripts/check-template-drift.sh" 2>/dev/null
```

These two lines get added to the pre-flight section of relevant skills. For skills without a pre-flight section (kata-verify-work), create one.

### Verification commands

```bash
# Test 1: check-config.sh with valid config
echo '{"mode":"yolo","depth":"standard"}' > /tmp/test-config.json
cd /tmp && mkdir -p .planning && cp test-config.json .planning/config.json
bash /path/to/skills/kata-doctor/scripts/check-config.sh
# Expected: no output (valid config)

# Test 2: check-config.sh with invalid config
echo '{"mode":"invalid","unknown_key":true}' > /tmp/.planning/config.json
bash /path/to/skills/kata-doctor/scripts/check-config.sh
# Expected: two warnings (invalid enum + unknown key)

# Test 3: check-config.sh with no config file
rm /tmp/.planning/config.json
bash /path/to/skills/kata-doctor/scripts/check-config.sh; echo "exit: $?"
# Expected: no output, exit 0

# Test 4: check-template-drift.sh with no overrides
bash skills/kata-doctor/scripts/check-template-drift.sh; echo "exit: $?"
# Expected: no output, exit 0

# Test 5: check-template-drift.sh with valid override
mkdir -p .planning/templates
cp skills/kata-execute-phase/references/summary-template.md .planning/templates/
bash skills/kata-doctor/scripts/check-template-drift.sh
# Expected: no output (override has all required fields)

# Test 6: check-template-drift.sh with drifted override
echo "# Minimal override" > .planning/templates/summary-template.md
bash skills/kata-doctor/scripts/check-template-drift.sh
# Expected: warning about missing required fields

# Test 7: No CLAUDE_PLUGIN_ROOT references in new scripts
grep -r "CLAUDE_PLUGIN_ROOT" skills/kata-doctor/scripts/check-*.sh && echo "FAIL" || echo "OK"

# Test 8: hooks.json removed (or empty)
[ -f hooks/hooks.json ] && echo "FAIL: hooks.json still exists" || echo "OK: hooks.json removed"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| SessionStart hook via `CLAUDE_PLUGIN_ROOT` | Skill pre-flight via sibling discovery | Phase 41 | Works for all installation methods |
| Node.js ESM hook scripts | Bash + inline Node.js scripts | Phase 41 | Consistent with all other Kata scripts |
| Validation at session start (once) | Validation per-skill-invocation | Phase 41 | Config changes detected between invocations |

**Key insight:** Moving from session-start to per-invocation means validation happens more frequently but catches config changes made mid-session. The cost is negligible (< 100ms per check, filesystem only).

## Open Questions

1. **Should kata-doctor run all three checks (roadmap + config + drift)?**
   - What we know: `kata-doctor` is the health-check skill. It currently runs roadmap and collision checks.
   - Recommendation: Yes, add config validation and template drift as new health checks in `kata-doctor/SKILL.md`. But this is a Phase 42/43 enhancement, not Phase 41. Phase 41 focuses on the migration (scripts + skill pre-flights + hook removal).

2. **Should the hooks directory be fully deleted or left empty?**
   - What we know: The `hooks/` directory is currently in the INCLUDES list in `scripts/build.js`. Removing all hooks means the directory is empty or absent.
   - Recommendation: Delete the directory and remove `'hooks'` from INCLUDES. Clean slate. If future hooks are needed, recreate the directory then.

3. **Should `scripts/build-hooks.cjs` be deleted?**
   - What we know: It only copies `kata-check-update.js` which doesn't exist in the hooks directory (it references a file that isn't present). The `prepublishOnly` script calls it but it does nothing useful.
   - Recommendation: Delete `scripts/build-hooks.cjs` and remove `build:hooks` and `prepublishOnly` from package.json scripts. Dead code.

## Sources

### Primary (HIGH confidence)
- Kata source code: `hooks/kata-template-drift.js` (113 lines), `hooks/kata-config-validator.js` (103 lines), `hooks/hooks.json`
- Kata source code: 12 skills with existing pre-flight `check-roadmap-format.sh` calls
- Kata source code: `skills/kata-execute-phase/scripts/resolve-template.sh` (Phase 40 sibling discovery pattern)
- Kata source code: `skills/kata-configure-settings/scripts/read-pref.sh` (inline Node.js heredoc pattern)
- Kata source code: `scripts/build.js` (INCLUDES array, hooks copy behavior)

### Secondary (MEDIUM confidence)
- Context7 `/anthropics/claude-code` - SessionStart hook architecture, `CLAUDE_PLUGIN_ROOT` behavior, skill structure
- Claude Code plugin-dev docs - skill vs hook differences, SKILL_BASE_DIR variable

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, reusing existing Bash + inline Node.js patterns
- Architecture: HIGH - pre-flight pattern proven by 12 existing skills, sibling discovery proven by Phase 40
- Pitfalls: HIGH - all pitfalls observed in existing codebase (exit codes, CLAUDE_PLUGIN_ROOT, heredoc quoting)

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable; validation logic and skill architecture unlikely to change)
