# Phase 39 Research: Config Workflow Variants & Settings

**Confidence Level:** HIGH (all codebase investigation)

**Research Type:** Level 0-1 (internal codebase patterns, no external libraries)

---

## Current Config Structure

### config.json Schema (as of Phase 38)

```json
{
  "mode": "yolo|interactive",
  "depth": "quick|standard|comprehensive",
  "parallelization": true,  // DEAD KEY - to be removed
  "commit_docs": true|false,
  "pr_workflow": true|false,
  "model_profile": "quality|balanced|budget",
  "display": {
    "statusline": true|false
  },
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false
  },
  "github": {
    "enabled": true|false,
    "issueMode": "auto|never"
  }
}
```

**Location:** `.planning/config.json`

**Current read pattern:** Skills use inline `grep` parsing, NOT accessor scripts (90+ patterns across codebase)

**Example from kata-execute-phase/SKILL.md:**
```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

---

## Phase 37 Accessor Pattern (Dependencies)

### Utilities Created in Phase 37

| Script | Purpose | Signature |
|--------|---------|-----------|
| `read-pref.sh` | Read preference with fallback chain | `read-pref.sh <key> [fallback]` |
| `has-pref.sh` | Check if user has expressed preference | `has-pref.sh <key>` (exit 0/1) |
| `set-config.sh` | Write nested config keys atomically | `set-config.sh <dot.key.path> <value>` |

### Resolution Chain (read-pref.sh)

1. `preferences.json` (flat keys, project-lifetime constants)
2. `config.json` (nested keys via `resolveNested()`, session variables)
3. Built-in DEFAULTS table (17 keys)
4. Fallback argument

### DEFAULTS Table

```javascript
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
```

**Key insight:** Accessor scripts exist for preferences.json, but config.json reads still use grep patterns everywhere.

---

## Where Workflow Config Should Be Wired

### WKFL-02: kata-execute-phase (post_task_command, commit_style, commit_scope_format)

**Current behavior:**
- Commits use hardcoded conventional commit style: `{type}({phase}-{plan}): {message}`
- No post-task hooks exist
- Commit scope format is hardcoded: `{phase}-{plan}`

**Wire points:**

| Config Key | Where to Read | Where to Apply | Current Hardcode Location |
|------------|---------------|----------------|---------------------------|
| `workflows.execute-phase.post_task_command` | SKILL.md orchestrator before spawning executor | Executor subagent prompt as `<post_task_command>` | N/A (new feature) |
| `workflows.execute-phase.commit_style` | executor-instructions.md step `commit_task` | Commit message format logic | executor-instructions.md lines with `git commit` |
| `workflows.execute-phase.commit_scope_format` | executor-instructions.md step `commit_task` | Scope calculation in commit message | Hardcoded `{phase}-{plan}` |

**Where to inject into subagent prompts:**
- Read config in orchestrator (`kata-execute-phase/SKILL.md` step 0)
- Pass to executor via Task tool `args` parameter as JSON
- Executor reads from args, applies during commit step

**Example injection:**
```bash
# In orchestrator
POST_TASK_CMD=$(bash read-pref.sh "workflows.execute-phase.post_task_command" "")
COMMIT_STYLE=$(bash read-pref.sh "workflows.execute-phase.commit_style" "conventional")

# Pass to executor
Task(
  name: "execute-plan-${PLAN_NUM}",
  agent_type: "general-purpose",
  args: "--config-json '{\"post_task_command\":\"${POST_TASK_CMD}\",\"commit_style\":\"${COMMIT_STYLE}\"}'"
)
```

### WKFL-03: kata-verify-work (extra_verification_commands)

**Current behavior:**
- UAT tests come from SUMMARY.md extraction only
- No project-specific verification commands

**Wire points:**

| Config Key | Where to Read | Where to Apply | Effect |
|------------|---------------|----------------|--------|
| `workflows.verify-work.extra_verification_commands` | verify-work.md step `check_active_session` | After UAT complete, before finalize | Run array of shell commands, report output |

**Where to inject:**
- Read in orchestrator (`kata-verify-work/SKILL.md` or `verify-work.md`)
- After UAT testing completes (step 7, before step 7.5 finalize)
- Execute each command, capture output, append to UAT.md

**Example:**
```bash
# In verify-work.md after UAT complete
EXTRA_CMDS=$(bash read-pref.sh "workflows.verify-work.extra_verification_commands" "")
if [ -n "$EXTRA_CMDS" ]; then
  # Parse JSON array, execute each
  # Append results to UAT.md under ## Extra Verification
fi
```

### WKFL-04: kata-complete-milestone (version_files, pre_release_commands)

**Current behavior:**
- Version files detected via `version-detector.md` heuristics (package.json, pyproject.toml, etc.)
- No pre-release hooks

**Wire points:**

| Config Key | Where to Read | Where to Apply | Current Behavior |
|------------|---------------|----------------|------------------|
| `workflows.complete-milestone.version_files` | milestone-complete.md step `release_workflow` | Override auto-detection | version-detector.md pattern matching |
| `workflows.complete-milestone.pre_release_commands` | milestone-complete.md before step `create_archive` | Run before archiving | N/A (new feature) |

**Where to inject:**
- Read in `milestone-complete.md` step `ensure_release_branch`
- version_files: pass to version-detector.md as override (skip heuristics if config present)
- pre_release_commands: execute after version bump, before archive creation

**Example:**
```bash
# In milestone-complete.md
VERSION_FILES=$(bash read-pref.sh "workflows.complete-milestone.version_files" "")
if [ -n "$VERSION_FILES" ]; then
  # Use explicit list, skip detection
else
  # Run version-detector.md heuristics
fi

PRE_RELEASE_CMDS=$(bash read-pref.sh "workflows.complete-milestone.pre_release_commands" "")
if [ -n "$PRE_RELEASE_CMDS" ]; then
  # Execute each command before archiving
fi
```

---

## WKFL-05: Schema Validation (SessionStart Hook)

### Hook Architecture

**Location:** `hooks/hooks.json` registers SessionStart hooks

**Current hooks:**
1. `kata-setup-statusline.js` - Copies statusline hook to project
2. `kata-template-drift.js` - Validates template overrides against schema

**Pattern:** Node.js scripts that:
1. Read JSON from stdin (SessionStart hook input with `cwd`, `pluginRoot`)
2. Parse `.planning/config.json`
3. Validate or transform
4. Silent fail (never block session start)
5. Output warnings/errors to stdout

### Schema Validation Requirements

**From WKFL-05:** Warn on unknown keys, error on invalid value types

**Implementation approach:**

```javascript
// hooks/kata-config-validator.js
const KNOWN_KEYS = {
  'mode': ['yolo', 'interactive'],
  'depth': ['quick', 'standard', 'comprehensive'],
  'model_profile': ['quality', 'balanced', 'budget'],
  'commit_docs': 'boolean',
  'pr_workflow': 'boolean',
  'display.statusline': 'boolean',
  'workflow.research': 'boolean',
  'workflow.plan_check': 'boolean',
  'workflow.verifier': 'boolean',
  'github.enabled': 'boolean',
  'github.issueMode': ['auto', 'never'],
  'workflows.execute-phase.post_task_command': 'string',
  'workflows.execute-phase.commit_style': ['conventional', 'semantic', 'simple'],
  'workflows.execute-phase.commit_scope_format': 'string',
  'workflows.verify-work.extra_verification_commands': 'array',
  'workflows.complete-milestone.version_files': 'array',
  'workflows.complete-milestone.pre_release_commands': 'array'
};

function validateConfig(config, path = '') {
  // Recursive descent
  // Unknown keys → warn
  // Invalid types → error
  // Return { warnings: [], errors: [] }
}
```

**Register in hooks.json:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-setup-statusline.js"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-template-drift.js"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-config-validator.js"
          }
        ]
      }
    ]
  }
}
```

---

## WKFL-06: Update kata-configure-settings

### Current Behavior (kata-configure-settings/SKILL.md)

**Step 2:** Reads config.json, parses 9 keys with defaults

**Step 3:** Presents AskUserQuestion with 7 settings (model_profile + 6 toggles)

**Step 4:** Writes to config.json via inline node script (not using `set-config.sh`)

**Issues:**
1. Doesn't use Phase 37 accessor scripts (`read-pref.sh`, `set-config.sh`)
2. Still presents `parallelization` toggle (dead key)
3. Doesn't manage `preferences.json` at all
4. No workflow variants UI

### Required Changes

| Current | Phase 39 |
|---------|----------|
| Read config.json via `cat` + grep | Use `read-pref.sh` for each key |
| Write config.json via inline node | Use `set-config.sh` for each write |
| 7 toggles include parallelization | Remove parallelization, keep 6 |
| No preferences.json management | Add section for preferences |
| No workflow variants UI | Add workflow variants section |

**New structure:**

```
1. Project-Lifetime Preferences (preferences.json)
   - release.changelog_format
   - docs.readme_on_milestone
   - conventions.commit_format

2. Session Settings (config.json)
   - mode, depth, model_profile
   - commit_docs, pr_workflow
   - display.statusline
   - workflow.{research,plan_check,verifier}
   - github.{enabled,issueMode}

3. Workflow Variants (config.json workflows section)
   - workflows.execute-phase.*
   - workflows.verify-work.*
   - workflows.complete-milestone.*
```

**UI approach:**
- Three separate AskUserQuestion calls (or tabs if supported)
- Use `read-pref.sh` to get current values for pre-selection
- Use `set-config.sh` to write changes atomically

---

## Standard Stack

**No external libraries.** This is pure internal Kata work using:

- Bash scripts (accessor pattern from Phase 37)
- Node.js (SessionStart hooks, JSON manipulation)
- Markdown (skill updates, reference docs)
- JSON (config schema)

**Build artifacts:**
- `hooks/kata-config-validator.js` (new SessionStart hook)
- Updated `hooks/hooks.json` (register validator)
- Updated `skills/kata-configure-settings/SKILL.md` (use accessor scripts)
- Updated `skills/kata-execute-phase/SKILL.md` (read workflow config)
- Updated `skills/kata-verify-work/SKILL.md` (read workflow config)
- Updated `skills/kata-complete-milestone/SKILL.md` (read workflow config)

---

## Architecture Patterns

### 1. Config Read Pattern (from Phase 37)

**Use accessor scripts, not grep:**

```bash
# OLD (to be replaced)
PR_WORKFLOW=$(cat .planning/config.json 2>/dev/null | grep -o '"pr_workflow"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")

# NEW (Phase 39)
PR_WORKFLOW=$(bash "${SKILL_BASE_DIR}/../kata-configure-settings/scripts/read-pref.sh" "pr_workflow" "false")
```

**Why:** Centralized defaults, nested key support, preferences.json resolution

### 2. Config Write Pattern (from Phase 37)

**Use set-config.sh:**

```bash
bash "${SKILL_BASE_DIR}/../kata-configure-settings/scripts/set-config.sh" "workflows.execute-phase.commit_style" "conventional"
```

**Handles:** Nested key creation, type coercion, atomic write via rename

### 3. Subagent Config Injection Pattern

**Pass config to subagents via Task args:**

```bash
# Orchestrator reads config
POST_TASK_CMD=$(bash read-pref.sh "workflows.execute-phase.post_task_command" "")

# Spawn executor with config
Task(
  name: "execute-plan",
  agent_type: "general-purpose",
  args: "--post-task-cmd '${POST_TASK_CMD}'"
)
```

**Subagent receives via $ARGUMENTS parsing in prompt context**

### 4. SessionStart Hook Pattern (from Phase 38)

**Standard structure:**
1. Read stdin as JSON (SessionStart hook input)
2. Parse cwd, pluginRoot from input
3. Read `.planning/config.json`
4. Validate/transform
5. Output warnings to stdout (prefixed with `[kata]`)
6. Silent fail on errors (never block session start)

### 5. Schema Comment Pattern (from Phase 38)

**For documenting config schema:**

```javascript
// workflows section schema
const WORKFLOWS_SCHEMA = {
  'execute-phase': {
    post_task_command: { type: 'string', optional: true },
    commit_style: { type: 'enum', values: ['conventional', 'semantic', 'simple'], default: 'conventional' },
    commit_scope_format: { type: 'string', default: '{phase}-{plan}' }
  },
  'verify-work': {
    extra_verification_commands: { type: 'array', items: 'string', optional: true }
  },
  'complete-milestone': {
    version_files: { type: 'array', items: 'string', optional: true },
    pre_release_commands: { type: 'array', items: 'string', optional: true }
  }
};
```

---

## Don't Hand-Roll

**Nothing to hand-roll.** All primitives exist:

- JSON parsing: Node.js built-in
- Nested key access: `set-config.sh` already handles this
- Preference resolution: `read-pref.sh` already implements chain
- SessionStart hooks: Pattern established in Phase 38

**Reuse existing:**
- `set-config.sh` for all config writes
- `read-pref.sh` for all config reads
- SessionStart hook pattern from `kata-template-drift.js`

---

## Common Pitfalls

### 1. Grep Pattern Migration Scope Creep

**Pitfall:** Attempting to replace all 90+ grep patterns across codebase

**Reality:** Phase 39 only needs to wire 3 skills for workflow config reads

**Fix:** Wire only WKFL-02/03/04 reads. Leave existing grep patterns alone (migrate in future phase if needed)

### 2. Config Key Naming Collision

**Pitfall:** Top-level `workflows` key might collide with existing `workflow` key

**Current:**
```json
{
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  }
}
```

**Adding:**
```json
{
  "workflows": {
    "execute-phase": { ... }
  }
}
```

**No collision:** Different keys (`workflow` vs `workflows`)

### 3. DEFAULTS Table Out of Sync

**Pitfall:** Adding config keys without updating DEFAULTS table in `read-pref.sh`

**Fix:** Every new config key MUST have a DEFAULTS entry

**Example addition:**
```javascript
const DEFAULTS = {
  // ... existing keys ...
  'workflows.execute-phase.commit_style': 'conventional',
  'workflows.verify-work.extra_verification_commands': '[]',
  'workflows.complete-milestone.version_files': '[]',
  'workflows.complete-milestone.pre_release_commands': '[]'
};
```

### 4. Array Config Values in Bash

**Pitfall:** Bash struggles with JSON arrays

**Pattern for array config:**

```bash
# Read as JSON string
CMDS_JSON=$(bash read-pref.sh "workflows.verify-work.extra_verification_commands" "[]")

# Parse in Node
CMDS_JSON="$CMDS_JSON" node << 'NODE_EOF'
const cmds = JSON.parse(process.env.CMDS_JSON);
cmds.forEach(cmd => {
  // Execute cmd
});
NODE_EOF
```

### 5. SessionStart Hook Failure Blocks Session

**Pitfall:** Validation errors that exit non-zero block session start

**Fix:** Always exit 0, output warnings/errors as messages

```javascript
try {
  const validation = validateConfig(config);
  if (validation.errors.length > 0) {
    console.log(`[kata] Config errors: ${validation.errors.join(', ')}`);
  }
  if (validation.warnings.length > 0) {
    console.log(`[kata] Config warnings: ${validation.warnings.join(', ')}`);
  }
  process.exit(0); // Always succeed
} catch (e) {
  // Silent fail
  process.exit(0);
}
```

### 6. Nested Config Write Fragility

**Pitfall:** Manually constructing nested JSON breaks on concurrent writes

**Fix:** Always use `set-config.sh` which handles atomic write via rename

### 7. Unknown Config Keys vs Typos

**Pitfall:** Typo in config key name silently falls back to default

**Detection:** Schema validator warns on unknown keys at session start

**Example:**
```json
{
  "workflows": {
    "execute-phase": {
      "comit_style": "conventional"  // Typo: comit vs commit
    }
  }
}
```

**Validator output:** `[kata] Config warning: Unknown key 'workflows.execute-phase.comit_style'`

---

## Code Examples

### Example 1: Wire execute-phase Config Read

**In kata-execute-phase/SKILL.md step 0:**

```bash
# Read workflow config for executor
POST_TASK_CMD=$(bash "${SKILL_BASE_DIR}/../kata-configure-settings/scripts/read-pref.sh" "workflows.execute-phase.post_task_command" "")
COMMIT_STYLE=$(bash "${SKILL_BASE_DIR}/../kata-configure-settings/scripts/read-pref.sh" "workflows.execute-phase.commit_style" "conventional")
COMMIT_SCOPE_FMT=$(bash "${SKILL_BASE_DIR}/../kata-configure-settings/scripts/read-pref.sh" "workflows.execute-phase.commit_scope_format" "{phase}-{plan}")
```

**Pass to executor:**

```bash
Task(
  name: "execute-plan-${PLAN_NUM}",
  agent_type: "general-purpose",
  instructions: "@${SKILL_BASE_DIR}/references/executor-instructions.md",
  args: "--post-task-cmd '${POST_TASK_CMD}' --commit-style '${COMMIT_STYLE}' --commit-scope-fmt '${COMMIT_SCOPE_FMT}'"
)
```

**In executor-instructions.md parse args:**

```bash
# Parse args (assuming --key value format)
POST_TASK_CMD=""
COMMIT_STYLE="conventional"
COMMIT_SCOPE_FMT="{phase}-{plan}"

while [ $# -gt 0 ]; do
  case "$1" in
    --post-task-cmd) POST_TASK_CMD="$2"; shift 2 ;;
    --commit-style) COMMIT_STYLE="$2"; shift 2 ;;
    --commit-scope-fmt) COMMIT_SCOPE_FMT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
```

### Example 2: Schema Validator Hook

**hooks/kata-config-validator.js:**

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const SCHEMA = {
  'mode': { type: 'enum', values: ['yolo', 'interactive'] },
  'depth': { type: 'enum', values: ['quick', 'standard', 'comprehensive'] },
  'workflows.execute-phase.commit_style': {
    type: 'enum',
    values: ['conventional', 'semantic', 'simple'],
    optional: true
  },
  'workflows.verify-work.extra_verification_commands': {
    type: 'array',
    optional: true
  }
  // ... etc
};

function validateNested(config, schema, path = '') {
  const warnings = [];
  const errors = [];

  for (const [key, value] of Object.entries(config)) {
    const fullKey = path ? `${path}.${key}` : key;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = validateNested(value, schema, fullKey);
      warnings.push(...nested.warnings);
      errors.push(...nested.errors);
      continue;
    }

    const rule = schema[fullKey];
    if (!rule) {
      warnings.push(`Unknown key: ${fullKey}`);
      continue;
    }

    if (rule.type === 'enum' && !rule.values.includes(value)) {
      errors.push(`Invalid value for ${fullKey}: ${value} (expected: ${rule.values.join('|')})`);
    }
    if (rule.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Invalid type for ${fullKey}: expected boolean, got ${typeof value}`);
    }
    if (rule.type === 'array' && !Array.isArray(value)) {
      errors.push(`Invalid type for ${fullKey}: expected array, got ${typeof value}`);
    }
  }

  return { warnings, errors };
}

// Read stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');

    if (!fs.existsSync(configPath)) {
      process.exit(0);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const result = validateNested(config, SCHEMA);

    if (result.errors.length > 0) {
      console.log(`[kata] Config errors: ${result.errors.join(', ')}`);
    }
    if (result.warnings.length > 0) {
      console.log(`[kata] Config warnings: ${result.warnings.join(', ')}`);
    }
  } catch (e) {
    // Silent fail
  }
  process.exit(0);
});
```

### Example 3: Update configure-settings to Use Accessor Scripts

**OLD (inline node):**
```bash
cat .planning/config.json
# ... parse and update inline ...
```

**NEW (use set-config.sh):**
```bash
# Read current values
MODE=$(bash "${SKILL_BASE_DIR}/scripts/read-pref.sh" "mode" "yolo")
DEPTH=$(bash "${SKILL_BASE_DIR}/scripts/read-pref.sh" "depth" "standard")
MODEL_PROFILE=$(bash "${SKILL_BASE_DIR}/scripts/read-pref.sh" "model_profile" "balanced")

# ... present AskUserQuestion ...

# Write new values
bash "${SKILL_BASE_DIR}/scripts/set-config.sh" "mode" "$NEW_MODE"
bash "${SKILL_BASE_DIR}/scripts/set-config.sh" "depth" "$NEW_DEPTH"
bash "${SKILL_BASE_DIR}/scripts/set-config.sh" "model_profile" "$NEW_MODEL_PROFILE"
```

---

## Research Gaps

**None.** All required information available in codebase:

✅ Current config.json structure documented
✅ Phase 37 accessor scripts located and understood
✅ Three target skills (execute-phase, verify-work, complete-milestone) mapped
✅ Wire points identified for each config key
✅ SessionStart hook pattern established in Phase 38
✅ DEFAULTS table structure documented
✅ kata-configure-settings current behavior understood

---

## Confidence Assessment

| Area | Confidence | Evidence |
|------|-----------|----------|
| Config schema | HIGH | Actual config.json read + skill inspection |
| Accessor pattern | HIGH | Phase 37 scripts read, DEFAULTS table mapped |
| Wire points | HIGH | All three skills inspected, grep patterns found |
| Hook pattern | HIGH | Existing hooks read, pattern documented |
| Settings skill | HIGH | Full SKILL.md read, current behavior understood |
| Pitfalls | HIGH | Grep pattern count verified (90+), collision check done |

**Overall confidence: HIGH** — Pure codebase investigation, no external dependencies, all required context gathered.
