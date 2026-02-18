# Kata-STYLE.md

> **Comprehensive reference.** Core rules auto-load from `.claude/rules/`. This document provides deep explanations and examples for when you need the full picture.

This document explains how Kata is written so future Claude instances can contribute consistently.

## Core Philosophy

Kata is a **meta-prompting system** where every file is both implementation and specification. Files teach Claude how to build software systematically. The system optimizes for:

- **Solo developer + Claude workflow** (no enterprise patterns)
- **Context engineering** (manage Claude's context window deliberately)
- **Plans as prompts** (PLAN.md files are executable, not documents to transform)

---

## File Structure Conventions

### Skills (`skills/kata-*/SKILL.md`)

Skills are the primary interface for all Kata workflows. Users invoke skills directly via `/kata-skill-name`.

```yaml
---
name: skill-name
description: Triggers and purpose description
user-invocable: true
allowed-tools: [Read, Write, Bash, ...]
---
```

**Section order:**
1. `<objective>` — What/why/when (always present)
2. `<execution_context>` — @-references to templates, references
3. `<context>` — Dynamic content: `$ARGUMENTS`, bash output, @file refs
4. `<process>` or `<step>` elements — Implementation steps
5. `<success_criteria>` — Measurable completion checklist

**Skills ARE orchestrators.** They spawn general-purpose subagents via Task tool, inlining instructions from `references/`.

### Workflows (`kata/workflows/*.md`)

No YAML frontmatter. Structure varies by workflow.

**Common tags** (not all workflows use all of these):
- `<purpose>` — What this workflow accomplishes
- `<when_to_use>` or `<trigger>` — Decision criteria
- `<required_reading>` — Prerequisite files
- `<process>` — Container for steps
- `<step>` — Individual execution step

Some workflows use domain-specific tags like `<philosophy>`, `<references>`, `<planning_principles>`, `<decimal_phase_numbering>`.

**When using `<step>` elements:**
- `name` attribute: snake_case (e.g., `name="load_project_state"`)
- `priority` attribute: Optional ("first", "second")

**Key principle:** Match the style of the specific workflow you're editing.

### Templates (`kata/templates/*.md`)

Structure varies. Common patterns:
- Most start with `# [Name] Template` header
- Many include a `<template>` block with the actual template content
- Some include examples or guidelines sections

**Placeholder conventions:**
- Square brackets: `[Project Name]`, `[Description]`
- Curly braces: `{phase}-{plan}-PLAN.md`

### References (`kata/references/*.md`)

Typically use outer XML containers related to filename, but structure varies.

Examples:
- `principles.md` → `<principles>...</principles>`
- `checkpoints.md` → `<overview>` then `<checkpoint_types>`
- `plan-format.md` → `<overview>` then `<core_principle>`

Internal organization varies — semantic sub-containers, markdown headers within XML, code examples.

---

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

### Checkpoint Structure

```xml
<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Description of what was built</what-built>
  <how-to-verify>Numbered steps for user</how-to-verify>
  <resume-signal>Text telling user how to continue</resume-signal>
</task>

<task type="checkpoint:decision" gate="blocking">
  <decision>What needs deciding</decision>
  <context>Why this matters</context>
  <options>
    <option id="identifier">
      <name>Option Name</name>
      <pros>Benefits</pros>
      <cons>Tradeoffs</cons>
    </option>
  </options>
  <resume-signal>Selection instruction</resume-signal>
</task>
```

### Conditional Logic

```xml
<if mode="yolo">
  Content for yolo mode
</if>

<if mode="interactive" OR="custom with gates.execute_next_plan true">
  Content for multiple conditions
</if>
```

---

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

**@-references are lazy loading signals.** They tell Claude what to read, not pre-loaded content.

### Path Resolution in Skills/Agents/Workflows

**CRITICAL:** Claude's `@` reference system is a STATIC file path parser. It does NOT support variable substitution.

**Correct — use static paths that build.js transforms:**
```
@~/.claude/kata/templates/summary.md
@~/.claude/kata/workflows/execute-plan.md
@~/.claude/kata/references/checkpoints.md
```

**Wrong — Claude treats $VARIABLES as literal text:**
```
@$KATA_BASE/templates/summary.md  ❌ Looks for directory named "$KATA_BASE"
@${VAR}/workflows/foo.md          ❌ Looks for directory named "${VAR}"
```

**How the build system handles this:**

| Build Target | Transformation                                            |
| ------------ | --------------------------------------------------------- |
| Plugin       | `@~/.claude/kata/` → `@./kata/` (relative to plugin root) |

**Source files MUST use the canonical `@~/.claude/kata/` form.** The build system handles the rest.

---

## Naming Conventions

| Type            | Convention        | Example                          |
| --------------- | ----------------- | -------------------------------- |
| Files           | kebab-case        | `phase-execute.md`               |
| Commands        | `kata:kata-kebab-case` | `kata:kata-phase-execute`        |
| XML tags        | kebab-case        | `<execution_context>`            |
| Step names      | snake_case        | `name="load_project_state"`      |
| Bash variables  | CAPS_UNDERSCORES  | `PHASE_ARG`, `PLAN_START_TIME`   |
| Type attributes | colon separator   | `type="checkpoint:human-verify"` |

---

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

---

## Context Engineering

### Size Constraints

- **Plans:** 2-3 tasks maximum
- **Quality curve:** 0-30% peak, 30-50% good, 50-70% degrading, 70%+ poor
- **Split triggers:** >3 tasks, multiple subsystems, >5 files per task

### Fresh Context Pattern

Spawn general-purpose subagents with inlined instructions for autonomous work. Reserve main context for user interaction.

### State Preservation

- `STATE.md` — Living memory across sessions
- SUMMARY.md frontmatter — Machine-readable for dependency graphs

---

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
  <verify>???</verify>
</task>

<!-- GOOD -->
<task type="auto">
  <name>Create login endpoint with JWT</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>POST endpoint accepting {email, password}. Query User by email, compare password with bcrypt. On match, create JWT with jose library, set as httpOnly cookie. Return 200. On mismatch, return 401.</action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 with Set-Cookie header</verify>
  <done>Valid credentials → 200 + cookie. Invalid → 401.</done>
</task>
```

---

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
- Include Co-Authored-By line

---

## UX Patterns

**Visual patterns:** `kata/references/ui-brand.md`

Orchestrators @-reference ui-brand.md for stage banners, checkpoint boxes, status symbols, and completion displays.

### "Next Up" Format

```markdown
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{identifier}: {name}** — {one-line description}

`{copy-paste command}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- Alternative option
- Another option

───────────────────────────────────────────────────────────────
```

### Decision Gates

Always use AskUserQuestion with concrete options. Never plain text prompts.

Include escape hatch: "Something else", "Let me describe"

---

## Progressive Disclosure

Information flows through layers:

1. **Skill** — High-level objective and orchestration
2. **Workflow** — Detailed process, references templates/references
3. **Template** — Concrete structure with placeholders
4. **Reference** — Deep dive on specific concept

Each layer answers different questions:
- Skill: "Should I use this? What does it do?"
- Workflow: "What happens?"
- Template: "What does output look like?"
- Reference: "Why this design?"

---

## Depth & Compression

Depth setting controls compression tolerance:

- **Quick:** Compress aggressively (1-3 plans/phase)
- **Standard:** Balanced (3-5 plans/phase)
- **Comprehensive:** Resist compression (5-10 plans/phase)

**Key principle:** Depth controls compression, not inflation. Never pad to hit a target number. Derive plans from actual work.

---

## Quick Mode Patterns

Quick mode provides Kata guarantees for ad-hoc tasks without full planning overhead.

### When to Use Quick Mode

**Quick mode:**
- Task is small and self-contained
- You know exactly what to do (no research needed)
- Task doesn't warrant full phase planning
- Mid-project fixes or small additions

**Full planning:**
- Task involves multiple subsystems
- You need to investigate approach first
- Task is part of a larger phase
- Task might have hidden complexity

### Quick Task Structure

```
.planning/quick/
├── 001-add-dark-mode/
│   ├── PLAN.md
│   └── SUMMARY.md
├── 002-fix-login-bug/
│   ├── PLAN.md
│   └── SUMMARY.md
```

Numbering: 3-digit sequential (001, 002, 003...)
Slug: kebab-case from description, max 40 chars

### Quick Mode Tracking

Quick tasks update STATE.md, NOT ROADMAP.md:

```markdown
### Quick Tasks Completed

| #   | Description          | Date       | Commit  | Directory                                       |
| --- | -------------------- | ---------- | ------- | ----------------------------------------------- |
| 001 | Add dark mode toggle | 2026-01-19 | abc123f | [001-add-dark-mode](./quick/001-add-dark-mode/) |
```

### Quick Mode Orchestration

Unlike full phases, quick mode orchestration is inline in the command file — no separate workflow. The simplified flow:

1. Validate ROADMAP.md exists (project active)
2. Get task description
3. Spawn planner (quick constraints)
4. Spawn executor
5. Update STATE.md
6. Commit artifacts

### Commit Convention

```
docs(quick-NNN): description

Quick task completed.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## TDD Plans

### Detection Heuristic

> Can you write `expect(fn(input)).toBe(output)` before writing `fn`?

Yes → TDD plan (one feature per plan)
No → Standard plan

### TDD Plan Structure

```yaml
---
type: tdd
---
```

```xml
<objective>
Implement [feature] using TDD (RED → GREEN → REFACTOR)
</objective>

<behavior>
Expected behavior specification
</behavior>

<implementation>
How to make tests pass
</implementation>
```

### TDD Commits

- RED: `test({phase}-{plan}): add failing test for [feature]`
- GREEN: `feat({phase}-{plan}): implement [feature]`
- REFACTOR: `refactor({phase}-{plan}): clean up [feature]`

---

## Codebase Intelligence

Kata includes a codebase knowledge system that captures project conventions and injects them into agent contexts.

### Pipeline

```
Capture: /kata-map-codebase -> mapper agents -> .planning/codebase/ (7 docs)
                             -> generate-intel.js -> .planning/intel/ (3 artifacts)

Consume: kata-plan-phase orchestrator -> reads intel/summary.md -> inlines into planner prompt
         kata-execute-phase orchestrator -> reads intel/summary.md -> inlines into executor prompts
         kata-execute-phase verifier -> reads intel/summary.md -> convention compliance checks
```

### Files

| File | Purpose | Updated By |
|------|---------|------------|
| `.planning/intel/index.json` | File registry (exports, imports, types, layers) | generate-intel.js |
| `.planning/intel/conventions.json` | Detected patterns (naming, directories, testing) | generate-intel.js |
| `.planning/intel/summary.md` | Compressed agent-readable summary (~80-150 lines) | generate-intel.js |

### Summary Schema

```markdown
# Codebase Intelligence Summary
Generated: YYYY-MM-DD | Source: .planning/codebase/
## Stack
[One-liner: language + framework + database + UI]
## Architecture
[Layers, entry points, data flow]
## Conventions
[Naming patterns, import rules, directory placement]
## Key Patterns
[Error handling, state management, testing approach]
## Concerns
[Outstanding issues, tech debt]
```

Target: 80-150 lines (~2-3k tokens). Hard cap at 150 lines.

### Index Schema

```json
{
  "version": 2,
  "generated": "ISO-8601",
  "source": "kata-map-codebase",
  "files": {
    "path/to/file.ts": {
      "exports": ["name1"],
      "imports": ["pkg"],
      "type": "component|service|util",
      "layer": "ui|api|data"
    }
  },
  "stats": { "totalFiles": 42, "byType": {}, "byLayer": {} }
}
```

### Convention Detection

Naming conventions (detected from code, requires 5+ exports, 70%+ match rate):
- camelCase, PascalCase, snake_case, SCREAMING_SNAKE

Directory purposes (lookup table from project structure):
- components, hooks, utils, lib, services, api, routes, types, models, tests

### Consumption Pattern

Agents consume intel via orchestrator injection. The orchestrator reads `.planning/intel/summary.md` and inlines it as a `<codebase_intelligence>` section in the agent's prompt. No agent reads intel files directly.

Graceful degradation: if `.planning/intel/` does not exist, agents proceed without convention guidance. No errors, no prompts.

### Commands

**`/kata-map-codebase`** — Full codebase scan for brownfield projects:
- Spawns 4 parallel mapper agents to write .planning/codebase/
- Runs generate-intel.js to produce .planning/intel/
- Works standalone (no /kata-new-project required)

---

## Summary: Core Meta-Patterns

1. **XML for semantic structure, Markdown for content**
2. **@-references are lazy loading signals**
3. **Skills are orchestrators** — invoke via `/kata-skill-name`
4. **Progressive disclosure hierarchy**
5. **Imperative, brief, technical** — no filler, no sycophancy
6. **Solo developer + Claude** — no enterprise patterns
7. **Context size as quality constraint** — split aggressively
8. **Temporal language banned** — current state only
9. **Plans ARE prompts** — executable, not documents
10. **Atomic commits** — Git history as context source
11. **AskUserQuestion for all exploration** — always options
12. **Checkpoints post-automation** — automate first, verify after
13. **Deviation rules are automatic** — no permission for bugs/critical
14. **Depth controls compression** — derive from actual work
15. **TDD gets dedicated plans** — cycle too heavy to embed
