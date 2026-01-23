# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kata is a **spec-driven development framework** for Claude Code. It's a meta-prompting and context engineering system that helps Claude build software systematically through structured workflows: requirements gathering → research → planning → execution → verification.

**Core Architecture:**
- **Commands** (slash commands in `commands/kata/`) — Thin orchestrators that delegate to workflows
- **Workflows** (`kata/workflows/`) — Detailed process logic with step-by-step execution
- **Agents** (`agents/kata-*.md`) — Specialized subagents for specific tasks (planning, execution, verification, debugging)
- **Templates** (`kata/templates/`) — Structured output formats (PROJECT.md, PLAN.md, etc.)
- **References** (`kata/references/`) — Deep-dive documentation on concepts and patterns

**Key Design Principle:** Plans ARE prompts. PLAN.md files are executable XML documents optimized for Claude, not prose to be transformed.

## Development Commands

### Installation and Testing

```bash
# Install locally to ./.claude/ for development
node bin/install.js --local

# Verify installation (in Claude Code)
/kata:help

# Update local install after changes
node bin/install.js --local

# Verify skills installed
ls ~/.claude/skills/kata-*  # global
ls .claude/skills/kata-*    # local

# Verify commands installed
ls ~/.claude/commands/kata/  # global
ls .claude/commands/kata/    # local
```

### Using Kata for Kata Development

This project uses Kata to build Kata. Key files in `.planning/`:

```bash
# Check current state and progress
cat .planning/STATE.md

# View project vision and requirements
cat .planning/PROJECT.md
cat .planning/REQUIREMENTS.md

# See roadmap and phase breakdown
cat .planning/ROADMAP.md

# Current phase plans
ls .planning/phases/[current-phase]/
```

**Common workflow when working on Kata:**
1. Check progress: "What's the status?" or `/kata:project-status`
2. Plan phase: "Plan phase [N]" or `/kata:phase-plan [N]`
3. Execute: "Execute phase [N]" or `/kata:phase-execute [N]`
4. Verify: "Verify phase [N]" or `/kata:work-verify [N]`

## Architecture: Files Teach Claude

Every file in Kata serves dual purposes:
1. **Runtime functionality** — Loaded by Claude during execution
2. **Teaching material** — Shows Claude how to build software systematically

### Multi-Agent Orchestration

Kata uses a thin orchestrator + specialized agents pattern:

| Orchestrator (Skill)        | Spawns                                                 | Purpose                        |
| --------------------------- | ------------------------------------------------------ | ------------------------------ |
| `kata-planning-phases`      | kata-phase-researcher, kata-planner, kata-plan-checker | Research → Plan → Verify loop  |
| `kata-execution`            | kata-executor (multiple in parallel)                   | Execute plans in waves         |
| `kata-verification-and-uat` | kata-verifier, kata-debugger                           | Check goals, diagnose failures |

**Key principle:** Orchestrators stay lean (~15% context), subagents get fresh 200k tokens each.

## Skills Architecture

Kata provides skills for autonomous invocation alongside slash commands for deterministic execution.

### Skills vs Commands

| Aspect      | Skills                                | Commands                           |
| ----------- | ------------------------------------- | ---------------------------------- |
| Invocation  | Autonomous from natural language      | Explicit with `/kata:command-name` |
| Arguments   | Extracted from conversational context | From command context               |
| Use case    | "Help me plan phase 2"                | `/kata:phase-plan 2`               |
| Frontmatter | `user-invocable: false`               | `disable-model-invocation: true`   |
| Delegation  | Respond to natural language           | Spawn skills via Task tool         |

**Key points:**
- **Skills** respond to natural language (e.g., "plan phase 2", "what's the status") but cannot be invoked directly with `/skill-name` (controlled by `user-invocable: false`)
- **Commands** provide explicit invocation (e.g., `/kata:phase-plan 2`, `/kata:project-status`) and delegate to skills via Task tool
- Both work together: commands for deterministic invocation, skills for conversational interaction

### Available Skills

Skills are installed to `~/.claude/skills/` (global) or `.claude/skills/` (local):

| Skill                           | Purpose                        | Sub-agents Spawned                                         |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `kata-planning-phases`          | Phase planning, task breakdown | kata-planner, kata-plan-checker                            |
| `kata-execution`                | Plan execution, checkpoints    | kata-executor                                              |
| `kata-verification-and-uat`     | Goal verification, UAT         | kata-verifier, kata-debugger                               |
| `kata-starting-new-projects`    | New project setup              | kata-project-researcher, kata-roadmapper                   |
| `kata-manageing-milestones`     | Milestone operations           | kata-roadmapper                                            |
| `kata-managing-project-roadmap` | Phase operations               | kata-roadmapper                                            |
| `kata-researching-phases`       | Domain research                | kata-phase-researcher, kata-researching-phases-synthesizer |
| `kata-project-status-utilities` | Progress, debug, mapping       | kata-debugger, kata-codebase-mapper                        |

### Skill Naming Best Practices

**Skill names and descriptions are critical for autonomous invocation.** Claude matches skills based on name and description before falling back to default behaviors.

**Mandatory conventions:**
- **Use gerund (verb-ing) style names** — `kata-managing-todos` not `kata-todo-management`. The gerund form reads naturally: "Use this skill for managing todos"
- **Exhaustive trigger phrases in description** — List EVERY phrase a user might say that should trigger the skill. More triggers = better matching

**Key learnings:**
- **Be verbose and specific** — Generic names like "utility" or "verification" get lost. Use descriptive names like `kata-providing-progress-and-status-updates` or `kata-verifying-work-outcomes-and-user-acceptance-testing`
- **Include key terms in the name** — If you want "UAT" to trigger a skill, put "uat" in the skill name itself
- **Avoid collision with built-in behaviors** — "test" triggers test suite, "build" triggers builds. Prefix with "kata" or use alternative vocabulary
- **Description triggers matter** — List explicit trigger phrases users might say: "check status", "what's the progress", "run uat"
- **Test natural language prompts** — Verify skills trigger correctly with phrases like "help me plan phase 2" not just explicit invocation

### Skill Structure

Each skill follows the pattern:

```
skills/kata-{name}/
├── SKILL.md         # Orchestrator workflow (<500 lines)
└── references/      # Progressive disclosure
    ├── {topic}.md
    └── ...
```

Skills ARE orchestrators. They spawn sub-agents via Task tool, not the other way around.

## Style Guide

@KATA-STYLE.md

## Installation System (bin/install.js)

Node.js installer that copies Kata files to Claude Code's plugin directory:

**Modes:**
- `--global` / `-g` → Install to `~/.claude/`
- `--local` / `-l` → Install to `./.claude/`
- `--config-dir <path>` → Custom Claude config directory

**Key behavior:**
- Expands `~` to home directory for container compatibility
- Respects `CLAUDE_CONFIG_DIR` environment variable
- Copies: `commands/`, `kata/`, `agents/`, `hooks/`, `skills/`

## Working with Planning Files

When modifying `.planning/` files (PROJECT.md, ROADMAP.md, STATE.md):

1. **Always read STATE.md first** — Contains current position and accumulated decisions
2. **Respect the structure** — Templates in `kata/templates/` show expected format
3. **Update STATE.md** — When making decisions or completing work
4. **Commit planning changes** — Use `docs:` or `chore:` prefix

## PR Workflow

**NEVER commit directly to main.** When `pr_workflow: true`, follow the spec in:
@kata/references/planning-config.md.

## Common Gotchas

1. **Don't transform plans** — PLAN.md files are prompts, not documents to rewrite into different formats
2. **Don't inflate plans** — Split based on actual work, not arbitrary numbers
3. **Read before writing** — NEVER propose changes to code you haven't read
4. **Phase numbers** — Integer phases (0, 1, 2) are roadmap, decimal (0.1, 2.1) are urgent insertions
5. **Waves in plans** — Pre-computed dependency groups for parallel execution, don't recalculate
6. **STATE.md is source of truth** — For current position, decisions, blockers

## Making Changes to Kata

1. **Match existing patterns** — Study similar files before creating new ones
2. **Test locally** — Use `node bin/install.js --local` and run commands in Claude Code
3. **Update KATA-STYLE.md** — If introducing new patterns or conventions
4. **Follow KATA-STYLE.md** — For all formatting, naming, and structural decisions
5. **When modifying skills** — Follow the /building-claude-code-skills methodology
6. **Keep SKILL.md under 500 lines** — Move details to `references/` subdirectory
