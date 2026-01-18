# Coding Conventions

**Analysis Date:** 2026-01-16

## Language Profile

This is a **meta-prompting system**, not a traditional application. The codebase consists of:
- **Markdown files** (90%+) — Prompts, templates, workflows, agent definitions
- **JavaScript** (bin/install.js) — CLI installer
- **Shell scripts** (hooks/*.sh) — Claude Code integration hooks

Conventions below address each file type.

## Naming Patterns

**Files:**
- kebab-case for all files: `execute-plan.md`, `create-roadmap.md`
- Agent files: `gsd-{role}.md` (e.g., `kata-executor.md`, `kata-planner.md`)
- Template files: `{purpose}.md` (e.g., `summary.md`, `project.md`)
- Hook scripts: `gsd-{purpose}.sh` (e.g., `gsd-notify.sh`)

**Commands:**
- Pattern: `gsd:{verb-noun}` (e.g., `gsd:execute-plan`, `gsd:create-roadmap`)
- All lowercase with hyphens

**XML Tags:**
- kebab-case for tags: `<execution_context>`, `<success_criteria>`
- snake_case for step names: `name="load_project_state"`
- Type attributes use colon separator: `type="checkpoint:human-verify"`

**Variables:**
- CAPS_UNDERSCORES in bash/shell: `PHASE_ARG`, `PLAN_START_TIME`
- camelCase in JavaScript: `hasGlobal`, `configDir`, `pathPrefix`

## File Structure Conventions

### Commands (`commands/gsd/*.md`)

YAML frontmatter required:
```yaml
---
name: gsd:command-name
description: One-line description
argument-hint: "<required>" or "[optional]"
allowed-tools: [Read, Write, Bash, Glob, Grep, AskUserQuestion]
---
```

Section order:
1. `<objective>` — What/why/when (always present)
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
@~/.claude/kata/workflows/execute-phase.md
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

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `test` | Tests only (TDD RED) |
| `refactor` | Code cleanup (TDD REFACTOR) |
| `docs` | Documentation/metadata |
| `chore` | Config/dependencies |

### Rules

- One commit per task during execution
- Stage files individually (never `git add .`)
- Capture hash for SUMMARY.md
- Include phase-plan in scope: `feat(08-02): add user registration`

---

*Convention analysis: 2026-01-16*
