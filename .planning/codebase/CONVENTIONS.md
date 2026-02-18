# Coding Conventions

**Analysis Date:** 2026-02-18

## Language Profile

Kata is a **meta-prompting framework** with significant supporting infrastructure. The codebase consists of:
- **Markdown files** (80%+) — Prompts, templates, workflows, skills
- **JavaScript** (20%) — Build system, test suite, codebase analysis
- **Bash scripts** (<5%) — Project initialization, git automation, shared utilities
- **CommonJS** (<5%) — Shared library distributed to all skills

## Naming Patterns

**Files:**
- **JavaScript/Node.js:** camelCase (e.g., `build.js`, `generate-intel.js`)
- **Bash scripts:** kebab-case (e.g., `find-phase.sh`, `manage-worktree.sh`)
- **Test files:** `{name}.test.js` (Node.js test runner convention)
- **Markdown documentation:** kebab-case (e.g., `CONVENTIONS.md`)
- **Skill directories:** `kata-{function}` (e.g., `kata-plan-phase`, `kata-execute-phase`)

**Functions:**
- **JavaScript/Node.js:** camelCase for all functions
  - Example: `function resolveRoot()`, `export function invokeClaude()`
- **Bash scripts:** snake_case for function definitions (none currently in use)
- **CommonJS exports:** Object literal with function properties at end of file

**Variables:**
- **JavaScript:** camelCase for local variables
  - Example: `testDir`, `allowedTools`, `skillName`
- **Bash/Node.js:** SCREAMING_SNAKE_CASE for environment and shell variables
  - Example: `KATA_PROJECT_ROOT`, `PHASE_ARG`, `PROJECT_ROOT`
- **Constants:** SCREAMING_SNAKE_CASE
  - Example: `DEFAULTS`, `PLUGIN_INCLUDES`, `KNOWN_KEYS`

**XML Tags in Markdown:**
- kebab-case for semantic tags: `<execution_context>`, `<success_criteria>`
- snake_case for attribute values: `name="load_project_state"`
- Type attributes use colon separator: `type="checkpoint:human-verify"`

## File Structure Conventions

### Skills (`skills/kata-{name}/`)

**YAML frontmatter required in SKILL.md:**
```yaml
---
name: skill-name
description: Triggers and purpose
user-invocable: true
allowed-tools: [Read, Write, Bash, ...]
---
```

**Section order in SKILL.md:**
1. `<objective>` — What/why/when (always present)
2. `<execution_context>` — @-references to templates, references
3. `<context>` — Dynamic content
4. `<process>` or `<step>` elements — Implementation
5. `<success_criteria>` — Completion checklist

### JavaScript/Node.js Build System (`scripts/build.js`)

**Pattern:**
```javascript
#!/usr/bin/env node

/**
 * Module-level JSDoc with purpose and usage
 */

import fs from 'fs';
import path from 'path';
// ... other imports

// Constants
const DEFAULTS = { ... };
const INCLUDES = [ ... ];

// Pure utility functions
function helperFunction() { ... }

// Main orchestration
function main() { ... }

main();
```

**Build system features:**
- ANSI color codes for output (green ✓, red ×, amber !)
- Plugin path transformation: replaces `scripts/` with `${CLAUDE_PLUGIN_ROOT}/skills/*/scripts/`
- Shared script distribution: kata-lib.cjs to all skills, manage-worktree.sh to 4 skills
- Comprehensive validation: script refs, cross-skill refs, frontmatter

### Bash Scripts (`skills/*/scripts/*.sh`)

**Pattern:**
```bash
#!/usr/bin/env bash
# Single-line purpose
# Usage: script.sh <arg>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT=$(node "$SCRIPT_DIR/kata-lib.cjs" resolve-root)
cd "$PROJECT_ROOT"

# Implementation with guards
[ -d "$dir" ] || continue  # Guard against missing directories
find ... || true           # Fallback to avoid pipeline failure

# Output format: key=value pairs for machine parsing
echo "PHASE_DIR=$PHASE_DIR"
echo "PLAN_COUNT=$PLAN_COUNT"
echo "PHASE_STATE=$PHASE_STATE"

exit 0  # or explicit error codes (1, 2, 3)
```

**Error handling:**
- Exit codes: 0 (success), 1 (not found), 2 (found but invalid), 3 (collision error)
- `set -euo pipefail` at top for fail-fast
- Explicit error messages to stderr
- Guard clauses prevent pipeline failure: `[ -d "$dir" ] || continue`

### CommonJS Shared Library (`skills/_shared/kata-lib.cjs`)

**Pattern:**
```javascript
'use strict';

const fs = require('fs');
const path = require('path');

// Utility functions
function resolveRoot() { ... }
function readJSON(filePath) { ... }

// Defaults and schema
const DEFAULTS = { ... };
const KNOWN_KEYS = { ... };

// CLI entry point with command routing
const command = process.argv[2];
switch (command) {
  case 'resolve-root':
    console.log(resolveRoot());
    break;
  // ...
}

module.exports = { resolveRoot, readJSON, ... };
```

## Code Style

**Formatting:**
- 2-space indents (consistent throughout)
- No automatic formatter configured
- Manual review for consistency

**Import Organization (JavaScript):**
1. Node.js built-ins (fs, path, child_process)
2. npm packages (rarely used)
3. Local modules (relative paths)

Example from `build.js`:
```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
```

## Error Handling

**Bash Scripts:**
- `set -euo pipefail` — Exit on error, undefined var, pipe failure
- Exit codes for different error types
- Guard clauses before operations: `[ -d "$dir" ] || continue`
- Error output to stderr: `echo "ERROR: ..." >&2`

**JavaScript/Node.js:**
- try/catch for file I/O and JSON parsing
- Graceful fallbacks: `catch { return {}; }`
- Explicit `process.exit(1)` on fatal errors
- Error messages to console.log (captured by test framework)

Example from `kata-lib.cjs`:
```javascript
function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return {}; }  // Return empty on any error
}

function resolveRoot() {
  // ... logic
  process.stderr.write('ERROR: Cannot find project root.\n');
  process.exit(1);
}
```

## Logging

**Framework:** `console.log()` only (no third-party logger)

**Patterns:**
- Build output: ANSI colors for visual status
- Script output: key=value pairs for machine parsing
- Test output: Structured via node:test describe/test groups
- Error messages: Sent to stderr in scripts, stdout in Node.js

**ANSI color codes from `build.js`:**
```javascript
const green = '\x1b[32m';
const amber = '\x1b[33m';
const red = '\x1b[31m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';
```

## Comments

**When to Comment:**
- Module-level: JSDoc with purpose and usage
- Section breaks: Major feature or algorithm blocks
- Inline: Only for non-obvious logic or workarounds
- Avoid: Restating what code does

**JSDoc patterns:**
```javascript
/**
 * Invoke Claude CLI with programmatic flags for testing.
 *
 * @param {string} prompt - The prompt to send to Claude
 * @param {Object} options - Configuration options
 * @param {string} options.cwd - Working directory
 * @param {number} [options.maxBudget=1.00] - Max cost in USD
 * @returns {Object} Parsed JSON response
 */
```

## Function Design

**Size:** 20-30 lines max; split larger operations

**Parameters:**
- Positional: Required values only
- Options object: Multiple related settings
  - Destructure in function body

**Return values:**
- Return null/undefined on error; let caller decide handling
- Plain JS objects (no custom classes)

## Module Design

**Exports:**
- **ESM:** Named exports at module level
- **CommonJS:** Single object with properties at file end
- **Bash:** Single executable, no module pattern

**Shared Scripts Distribution:**
- Source: `skills/_shared/` (canonical)
- Build system copies to consumer skill `scripts/` directories
- Examples: `kata-lib.cjs` (all 32 skills), `manage-worktree.sh` (4 skills)

## Project Root Resolution Pattern

All scripts use this pattern (from `kata-lib.cjs`):
```javascript
function resolveRoot() {
  // Check KATA_PROJECT_ROOT env var
  const envRoot = process.env.KATA_PROJECT_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, '.planning'))) {
    return envRoot;
  }

  // Check CWD and worktree layouts
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.planning'))) return cwd;
  if (fs.existsSync(path.join(cwd, 'workspace', '.planning'))) {
    return path.join(cwd, 'workspace');
  }
  if (fs.existsSync(path.join(cwd, 'main', '.planning'))) {
    return path.join(cwd, 'main');
  }

  // Fail with clear message
  process.stderr.write('ERROR: Cannot find project root.\n');
  process.exit(1);
}
```

## YAML Frontmatter Parsing

Manual parsing (no external library):
```javascript
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }
  return frontmatter;
}
```

---

*Convention analysis: 2026-02-18 | Source: scripts/, skills/, tests/, package.json*
2. `<execution_context>` — @-references to workflows, templates, references
3. `<context>` — Dynamic content: `$ARGUMENTS`, bash output, @file refs
4. `<process>` or `<step>` elements — Implementation steps
5. `<success_criteria>` — Measurable completion checklist

**Commands are thin wrappers.** Delegate detailed logic to workflows or agents.

### Agents (`agents/*.md`)

YAML frontmatter required:
```yaml
---
name: gsd-agent-name
description: Full description of agent role and responsibilities
tools: Read, Write, Edit, Bash, Grep, Glob
color: yellow
---
```

Structure:
1. `<role>` — Agent identity and spawning context
2. `<philosophy>` or domain-specific sections
3. `<execution_flow>` with `<step>` elements
4. `<structured_returns>` — Return format specifications
5. `<success_criteria>` — Completion checklist

### Workflows (`kata/workflows/*.md`)

No YAML frontmatter. Structure varies by workflow purpose.

Common tags:
- `<purpose>` — What this workflow accomplishes
- `<when_to_use>` or `<trigger>` — Decision criteria
- `<required_reading>` — Prerequisite files
- `<process>` — Container for steps
- `<step>` — Individual execution step

### Templates (`kata/templates/*.md`)

Most start with `# [Name] Template` header.
Many include a `<template>` block with actual template content.
Some include `<example>` and `<guidelines>` sections.

**Placeholder conventions:**
- Square brackets: `[Project Name]`, `[Description]`
- Curly braces: `{phase}-{plan}-PLAN.md`

## XML Tag Conventions

### Semantic Containers Only

XML tags serve semantic purposes. Use Markdown headers for hierarchy within.

**DO:**
```xml
<objective>
## Primary Goal
Build authentication system

## Success Criteria
- Users can log in
- Sessions persist
</objective>
```

**DON'T:**
```xml
<section name="objective">
  <subsection name="primary-goal">
    <content>Build authentication system</content>
  </subsection>
</section>
```

### Task Structure

```xml
<task type="auto">
  <name>Task N: Action-oriented name</name>
  <files>src/path/file.ts, src/other/file.ts</files>
  <action>What to do, what to avoid and WHY</action>
  <verify>Command or check to prove completion</verify>
  <done>Measurable acceptance criteria</done>
</task>
```

**Task types:**
- `type="auto"` — Claude executes autonomously
- `type="checkpoint:human-verify"` — User must verify
- `type="checkpoint:decision"` — User must choose
- `type="checkpoint:human-action"` — User must perform action (rare)

### Checkpoint Structure

```xml
<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Description of what was built</what-built>
  <how-to-verify>Numbered steps for user</how-to-verify>
  <resume-signal>Text telling user how to continue</resume-signal>
</task>
```

## Language & Tone

### Imperative Voice

**DO:** "Execute tasks", "Create file", "Read STATE.md"
**DON'T:** "Execution is performed", "The file should be created"

### No Filler

Absent: "Let me", "Just", "Simply", "Basically", "I'd be happy to"
Present: Direct instructions, technical precision

### No Sycophancy

Absent: "Great!", "Awesome!", "Excellent!", "I'd love to help"
Present: Factual statements, verification results, direct answers

### Brevity with Substance

**Good one-liner:** "JWT auth with refresh rotation using jose library"
**Bad one-liner:** "Phase complete" or "Authentication implemented"

## @-Reference Patterns

**Static references** (always load):
```
@~/.claude/kata/workflows/phase-execute.md
@.planning/PROJECT.md
```

**Conditional references** (based on existence):
```
@.planning/DISCOVERY.md (if exists)
```

@-references are lazy loading signals. They tell Claude what to read, not pre-loaded content.

## Error Handling

### In Markdown/Prompts

Explicit error states with user options:
```
**If file missing but .planning/ exists:**
Options:
1. Reconstruct from existing artifacts
2. Continue without project state
```

### In JavaScript

- Try/catch for file operations
- Return empty object on parse failure: `return {}`
- Exit with error code on validation failure: `process.exit(1)`
- Use console.error with colored output for user-facing errors

### In Shell Scripts

- Redirect stderr: `2>/dev/null`
- Use fallback values: `jq -r '.value // empty'`
- Exit 0 even on optional failures (hooks should not block Claude)

## Logging & Output

### In Markdown/Prompts

Use UI patterns from `kata/references/ui-brand.md`:
- Stage banners: `━━━ GSD ► STAGE NAME ━━━`
- Checkpoint boxes: `╔══════` box format
- Status symbols: ✓ ✗ ◆ ○ ⚡ ⚠

### In JavaScript (CLI)

- Color codes for terminal output
- Green checkmarks for success: `${green}✓${reset}`
- Yellow for warnings: `${yellow}⚠${reset}`
- Dim for secondary info: `${dim}text${reset}`

### In Shell Scripts

- ANSI escape codes for colors: `\033[32m` (green), `\033[33m` (yellow)
- jq for JSON parsing
- printf for formatted output

## Comments

### In Markdown

Explain **why** with inline notes:
```xml
<!-- Why this matters for future context -->
```

Document business logic in `<action>` elements:
```xml
<action>Use jose library (not jsonwebtoken - CommonJS issues with Edge runtime)</action>
```

### In JavaScript

JSDoc-style comments for functions are not used.
Inline comments explain non-obvious logic:
```javascript
// Expand ~ to home directory (shell doesn't expand in env vars passed to node)
```

### In Shell Scripts

Header comment explains purpose:
```bash
# Claude Code Statusline - GSD Edition
# Shows: model | current task | directory | context usage
```

## Anti-Patterns to Avoid

### Enterprise Patterns (Banned)

- Story points, sprint ceremonies, RACI matrices
- Human dev time estimates (days/weeks)
- Team coordination, knowledge transfer docs
- Change management processes

### Temporal Language (Banned in Implementation Docs)

**DON'T:** "We changed X to Y", "Previously", "No longer", "Instead of"
**DO:** Describe current state only
**Exception:** CHANGELOG.md, MIGRATION.md, git commits

### Generic XML (Banned)

**DON'T:** `<section>`, `<item>`, `<content>`
**DO:** Semantic purpose tags: `<objective>`, `<verification>`, `<action>`

### Vague Tasks (Banned)

```xml
<!-- BAD -->
<task type="auto">
  <name>Add authentication</name>
  <action>Implement auth</action>
</task>

<!-- GOOD -->
<task type="auto">
  <name>Create login endpoint with JWT</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>POST endpoint accepting {email, password}. Query User by email, compare password with bcrypt. On match, create JWT with jose library, set as httpOnly cookie. Return 200.</action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 with Set-Cookie header</verify>
  <done>Valid credentials -> 200 + cookie. Invalid -> 401.</done>
</task>
```

## Commit Conventions

### Format

```
{type}({phase}-{plan}): {description}
```

### Types

| Type       | Use                         |
| ---------- | --------------------------- |
| `feat`     | New feature                 |
| `fix`      | Bug fix                     |
| `test`     | Tests only (TDD RED)        |
| `refactor` | Code cleanup (TDD REFACTOR) |
| `docs`     | Documentation/metadata      |
| `chore`    | Config/dependencies         |

### Rules

- One commit per task during execution
- Stage files individually (never `git add .`)
- Capture hash for SUMMARY.md
- Include phase-plan in scope: `feat(08-02): add user registration`

---

*Convention analysis: 2026-01-16*
