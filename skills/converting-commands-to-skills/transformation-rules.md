# Transformation Rules for Converting Commands to Skills

This document provides detailed rules for transforming slash commands to skills.

## Name Transformation

**Pattern:** Convert command names to gerund form (verb + -ing)

| Command Name | Skill Name | Rule Applied |
|--------------|------------|--------------|
| `add-phase.md` | `adding-phases` | add → adding, pluralize noun |
| `review.md` | `reviewing-code` | review → reviewing, add context |
| `commit.md` | `committing-changes` | commit → committing, add context |
| `debug.md` | `debugging-issues` | debug → debugging, add context |
| `new-project.md` | `starting-new-projects` | new → starting, pluralize |
| `execute-phase.md` | `executing-project-phases` | already gerund, add context |
| `plan-phase.md` | `planning-phases` | plan → planning, pluralize |
| `verify-work.md` | `verifying-work` | verify → verifying |

**Naming Rules:**
1. Convert verb to gerund form (verb + -ing)
2. Pluralize nouns when appropriate for generality
3. Add context words if needed for clarity
4. Use lowercase with hyphens only
5. Keep under 64 characters
6. Ensure name is descriptive and searchable

## Directory Structure Transformation

**Pattern:** `./commands/category/command.md` → `./skills/category-command-name/SKILL.md`

**Key Rule:** The category/namespace becomes a prefix in the skill directory name

**Examples:**
```
./commands/kata/add-phase.md
→ ./skills/kata-adding-phases/SKILL.md

./commands/kata/new-project.md
→ ./skills/kata-starting-new-projects/SKILL.md

./commands/gsd/execute-phase.md
→ ./skills/gsd-executing-phases/SKILL.md

./commands/review.md (no category)
→ ./skills/reviewing-code/SKILL.md
```

**Algorithm:**
1. **Parse source path:** Split `./commands/[category/]command-name.md`
2. **Extract category (if present):**
   - If path has subdirectory: `commands/CATEGORY/file.md` → category = `CATEGORY`
   - If path is flat: `commands/file.md` → category = `null`
3. **Transform command name:** Apply gerund form (see Name Transformation section)
   - `add-phase.md` → `adding-phases`
   - `new-project.md` → `starting-new-projects`
4. **Combine directory name:**
   - With category: `CATEGORY-transformed-name` → `kata-adding-phases`
   - Without category: `transformed-name` → `committing-changes`
5. **Create skill path:** `./skills/[category-]transformed-name/SKILL.md`

**Additional Rules:**
- All skills go directly under `./skills/` (flat structure, no nested categories)
- Supporting files go in same directory as SKILL.md
- The skill `name` field should match the directory name

## YAML Frontmatter Transformation

**Fields to Keep:**
- `name` (transformed to gerund form)
- `description` (enhanced for invocation triggers)

**Fields to Remove:**
- `allowed-tools` (skills inherit all tools automatically)
- `argument-hint` (not used in skills)
- `model` (skills use default model)
- `context` (not used in skills)
- `agent` (skills don't specify agents)

**Before (Command):**
```yaml
---
description: Add a new phase to the project roadmap
allowed-tools: [Read, Write, Edit, Bash]
argument-hint: "[phase-name]"
model: sonnet
---
```

**After (Skill):**
```yaml
---
name: adding-phases
description: Use this skill when adding planned phases to the roadmap, appending sequential work to milestones, or creating new phase entries. Triggers include 'add phase', 'append phase', 'new phase', and 'create phase'.
---
```

## Description Enhancement

Transform task-focused descriptions to invocation-focused descriptions with trigger keywords.

**Enhancement Pattern:**
1. Start with "Use this skill when..."
2. List concrete use cases
3. Include trigger keywords and phrases
4. Write in third person
5. Keep under 1024 characters

**Examples:**

| Original (Task-Focused) | Enhanced (Invocation-Focused) |
|------------------------|-------------------------------|
| "Add a new phase" | "Use this skill when adding planned phases to the roadmap, appending sequential work to milestones, or creating new phase entries. Triggers include 'add phase', 'append phase', 'new phase', and 'create phase'." |
| "Create a git commit" | "Use this skill when committing code changes, creating git commits, staging files for commit, or when the user asks to commit, save changes, or make a commit. Handles conventional commit format, explicit file staging, and commit message crafting." |
| "Debug issues" | "Use this skill when encountering bugs, test failures, or unexpected behavior. Applies systematic debugging methodology with hypothesis testing, minimal reproduction, and root cause analysis. Invoke for any debugging task before proposing fixes." |

**Trigger Keyword Types:**
- Action verbs: "add", "create", "commit", "debug", "analyze"
- User phrases: "help me", "can you", "I want to"
- Task descriptions: "new phase", "git commit", "fix bug"
- Question patterns: "how do I", "what should I"

## Content Transformation

### Bash Execution Conversion

**Before (Command with `!` prefix):**
```markdown
!git status
!git add .
!git commit -m "message"
```

**After (Skill with explicit Bash tool):**
```markdown
1. Check git status using Bash tool:
   ```bash
   git status
   ```

2. Stage files using Bash tool:
   ```bash
   git add .
   ```

3. Create commit using Bash tool:
   ```bash
   git commit -m "message"
   ```
```

**Rules:**
- Remove `!` prefix
- Add explicit instruction to use Bash tool
- Wrap commands in markdown code blocks
- Provide context for each command

### File Reference Conversion

**Before (Command with `@` syntax):**
```markdown
See @reference.md for details
Follow patterns in @examples.md
```

**After (Skill with relative paths):**
```markdown
See `./reference-details.md` for details
Follow patterns in `./example-patterns.md`
```

**Rules:**
- Replace `@file.md` with `./file.md`
- Use intention-revealing names for files
- Wrap paths in backticks for clarity
- Ensure file actually exists or will be created

### Progressive Disclosure

If command content is lengthy (>500 lines), extract to supporting files:

**SKILL.md (Overview):**
```markdown
## Phase Planning Process

Follow these steps to plan a phase:

1. Research the implementation approach (see `./research-protocol.md`)
2. Break down into tasks (see `./task-breakdown.md`)
3. Create dependency graph (see `./dependency-analysis.md`)
4. Write the plan file

See `./plan-format.md` for detailed plan structure.
```

**Supporting Files:**
- `./research-protocol.md` - Detailed research steps
- `./task-breakdown.md` - Task decomposition guidance
- `./dependency-analysis.md` - Dependency mapping instructions
- `./plan-format.md` - Plan template and format

## Special Cases

### Commands with Arguments

**Before (Command):**
```yaml
---
argument-hint: "[phase-name] [milestone-number]"
---
```

**After (Skill):**
In the instructions, explain how arguments are provided:

```markdown
## Usage

When invoked, the user will provide:
- Phase name or description
- Target milestone number (optional)

Extract these from the user's request context.
```

### Commands with Context

**Before (Command):**
```yaml
---
context: conversation
---
```

**After (Skill):**
Skills automatically have full conversation context. Remove this field and reference conversation context in instructions if needed:

```markdown
## Context Extraction

Extract relevant information from the conversation history:
- User's intent and requirements
- Previous decisions or constraints
- Related work already completed
```

### Commands Invoking Agents

**Before (Command):**
```yaml
---
agent: kata-planner
---
```

**After (Skill):**
Replace with explicit Task tool usage:

```markdown
## Planning Execution

Use the Task tool to launch the kata-planner agent:

1. Prepare the planning context
2. Invoke Task tool with subagent_type: "kata-planner"
3. Process the planning results
```

## Validation Checklist

After transformation, verify:

- [ ] Name is in gerund form (verb + -ing)
- [ ] Name is lowercase with hyphens only
- [ ] Name is under 64 characters
- [ ] Description starts with "Use this skill when..."
- [ ] Description includes trigger keywords
- [ ] Description is in third person
- [ ] Description is under 1024 characters
- [ ] YAML has only `name` and `description` fields
- [ ] No `allowed-tools` field present
- [ ] Bash executions use explicit instructions
- [ ] File references use `./` relative paths
- [ ] Supporting files have intention-revealing names
- [ ] SKILL.md is under 500 lines (if possible)
- [ ] Instructions are clear and actionable
