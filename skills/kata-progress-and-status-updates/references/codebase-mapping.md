# Codebase Mapping Reference

Workflow for MAP-CODEBASE operation using parallel kata-codebase-mapper agents.

## Overview

Spawn 4 parallel agents to analyze codebase and produce structured documents in `.planning/codebase/`.

Agents write documents directly. Orchestrator only receives confirmations, then verifies output.

## Document Structure

`.planning/codebase/` contains 7 documents:

| Document | Agent Focus | Contents |
|----------|-------------|----------|
| STACK.md | tech | Languages, runtime, frameworks, dependencies |
| INTEGRATIONS.md | tech | External APIs, databases, auth, webhooks |
| ARCHITECTURE.md | arch | Pattern, layers, data flow, abstractions |
| STRUCTURE.md | arch | Directory layout, key locations, naming |
| CONVENTIONS.md | quality | Code style, naming, patterns, error handling |
| TESTING.md | quality | Framework, structure, mocking, coverage |
| CONCERNS.md | concerns | Tech debt, bugs, security, performance |

## Why These Documents Matter

These documents are consumed by other Kata operations:

**Planning (`/kata:plan-phase`)** loads relevant docs:

| Phase Type | Documents Loaded |
|------------|------------------|
| UI, frontend, components | CONVENTIONS.md, STRUCTURE.md |
| API, backend, endpoints | ARCHITECTURE.md, CONVENTIONS.md |
| database, schema, models | ARCHITECTURE.md, STACK.md |
| testing, tests | TESTING.md, CONVENTIONS.md |
| integration, external API | INTEGRATIONS.md, STACK.md |
| refactor, cleanup | CONCERNS.md, ARCHITECTURE.md |
| setup, config | STACK.md, STRUCTURE.md |

**Execution (`/kata:execute-phase`)** references docs to:
- Follow existing conventions when writing code
- Know where to place new files (STRUCTURE.md)
- Match testing patterns (TESTING.md)
- Avoid introducing more technical debt (CONCERNS.md)

## Workflow Steps

### Step 1: Check Existing

```bash
ls -la .planning/codebase/ 2>/dev/null
```

**If exists:**

```
.planning/codebase/ already exists with these documents:
[List files found]

What's next?
1. Refresh - Delete existing and remap codebase
2. Update - Keep existing, only update specific documents
3. Skip - Use existing codebase map as-is
```

Wait for user response:
- Refresh: Delete directory, continue
- Update: Ask which documents, spawn filtered agents
- Skip: Exit workflow

**If doesn't exist:** Continue to Step 2.

### Step 2: Create Structure

```bash
mkdir -p .planning/codebase
```

### Step 3: Spawn Agents

Spawn 4 parallel kata-codebase-mapper agents using Task tool.

**CRITICAL:** Use `run_in_background=true` for parallel execution.

**Agent 1: Tech Focus**

```
Task(
  prompt=tech_prompt,
  subagent_type="kata-codebase-mapper",
  run_in_background=true,
  description="Map codebase tech stack"
)
```

Prompt:
```
Focus: tech

Analyze this codebase for technology stack and external integrations.

Write these documents to .planning/codebase/:
- STACK.md - Languages, runtime, frameworks, dependencies, configuration
- INTEGRATIONS.md - External APIs, databases, auth providers, webhooks

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 2: Architecture Focus**

```
Task(
  prompt=arch_prompt,
  subagent_type="kata-codebase-mapper",
  run_in_background=true,
  description="Map codebase architecture"
)
```

Prompt:
```
Focus: arch

Analyze this codebase architecture and directory structure.

Write these documents to .planning/codebase/:
- ARCHITECTURE.md - Pattern, layers, data flow, abstractions, entry points
- STRUCTURE.md - Directory layout, key locations, naming conventions

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 3: Quality Focus**

```
Task(
  prompt=quality_prompt,
  subagent_type="kata-codebase-mapper",
  run_in_background=true,
  description="Map codebase conventions"
)
```

Prompt:
```
Focus: quality

Analyze this codebase for coding conventions and testing patterns.

Write these documents to .planning/codebase/:
- CONVENTIONS.md - Code style, naming, patterns, error handling
- TESTING.md - Framework, structure, mocking, coverage

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 4: Concerns Focus**

```
Task(
  prompt=concerns_prompt,
  subagent_type="kata-codebase-mapper",
  run_in_background=true,
  description="Map codebase concerns"
)
```

Prompt:
```
Focus: concerns

Analyze this codebase for technical debt, known issues, and areas of concern.

Write this document to .planning/codebase/:
- CONCERNS.md - Tech debt, bugs, security, performance, fragile areas

Explore thoroughly. Write document directly using template. Return confirmation only.
```

### Step 4: Collect Confirmations

Wait for all agents to complete. Read each agent's output.

**Expected confirmation format:**
```
## Mapping Complete

**Focus:** {focus}
**Documents written:**
- `.planning/codebase/{DOC1}.md` ({N} lines)
- `.planning/codebase/{DOC2}.md` ({N} lines)

Ready for orchestrator summary.
```

You receive: File paths and line counts only. NOT document contents.

### Step 5: Verify Output

```bash
ls -la .planning/codebase/
wc -l .planning/codebase/*.md
```

**Verification checklist:**
- All 7 documents exist
- No empty documents (each should have >20 lines)

Note any missing or empty documents.

### Step 6: Commit Codebase Map

```bash
git add .planning/codebase/*.md
git commit -m "docs: map existing codebase

- STACK.md - Technologies and dependencies
- ARCHITECTURE.md - System design and patterns
- STRUCTURE.md - Directory layout
- CONVENTIONS.md - Code style and patterns
- TESTING.md - Test structure
- INTEGRATIONS.md - External services
- CONCERNS.md - Technical debt and issues"
```

### Step 7: Offer Next Steps

Present completion summary:

```
Codebase mapping complete.

Created .planning/codebase/:
- STACK.md ([N] lines) - Technologies and dependencies
- ARCHITECTURE.md ([N] lines) - System design and patterns
- STRUCTURE.md ([N] lines) - Directory layout and organization
- CONVENTIONS.md ([N] lines) - Code style and patterns
- TESTING.md ([N] lines) - Test structure and practices
- INTEGRATIONS.md ([N] lines) - External services and APIs
- CONCERNS.md ([N] lines) - Technical debt and issues


---

## NEXT_UP

**Initialize project** - use codebase context for planning

`/kata:new-project`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- Re-run mapping: `/kata:map-codebase`
- Review specific file: `cat .planning/codebase/STACK.md`
- Edit any document before proceeding

---
```

## Document Templates

Each kata-codebase-mapper agent uses templates defined in the agent file.

Key template requirements:
- Always include file paths in backticks
- Be prescriptive ("Use X pattern") not just descriptive ("X pattern is used")
- Include code examples where helpful
- Fill in all template sections or mark "Not detected"

## Selective Mapping

For focused updates, spawn only relevant agents:

| To Update | Spawn Agents |
|-----------|--------------|
| Dependencies changed | tech focus only |
| New architecture patterns | arch focus only |
| Style guide updates | quality focus only |
| After major refactor | all agents |

## When to Map

**Use map-codebase for:**
- Brownfield projects before initialization
- Refreshing after significant changes
- Onboarding to unfamiliar codebase
- Before major refactoring

**Skip map-codebase for:**
- Greenfield projects with no code yet
- Trivial codebases (<5 files)
