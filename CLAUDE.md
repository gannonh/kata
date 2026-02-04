# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kata is a **spec-driven development framework** for Claude Code. It's a meta-prompting and context engineering system that helps Claude build software systematically through structured workflows: requirements gathering → research → planning → execution → verification.

**Core Architecture:**
- **Skills** (`skills/kata-*/SKILL.md`) — Primary interface for all Kata workflows, invoked via `/kata:kata-skill-name`
- **Agents** (`agents/kata-*.md`) — Specialized subagents spawned by skills for specific tasks (planning, execution, verification, debugging)
- **Templates** (`kata/templates/`) — Structured output formats (PROJECT.md, PLAN.md, etc.)
- **References** (`kata/references/`) — Deep-dive documentation on concepts and patterns

**Key Design Principle:** Plans ARE prompts. PLAN.md files are executable XML documents optimized for Claude, not prose to be transformed.

## Development Commands

### Installation and Testing

Build and test the plugin locally:

```bash
# Build the plugin
npm run build:plugin

# Test from a separate project using --plugin-dir
cd /path/to/test-project
claude --plugin-dir /path/to/kata/dist/plugin

# Verify skills load
/kata:kata-help
```

Alternative: manually copy to test project's plugin directory:

```bash
mkdir -p /path/to/test-project/.claude/plugins/kata
cp -r dist/plugin/* /path/to/test-project/.claude/plugins/kata/
```

After rebuilding, restart Claude Code to pick up changes.

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

# Current phase plans (phases live in active/, pending/, or completed/)
ls .planning/phases/active/
ls .planning/phases/pending/
```

**Common workflow when working on Kata:**
1. Check progress: "What's the status?" or `/kata:kata-track-progress`
2. Plan phase: "Plan phase [N]" or `/kata:kata-plan-phase [N]`
3. Execute: "Execute phase [N]" or `/kata:kata-execute-phase [N]`
4. Verify: "Verify phase [N]" or `/kata:kata-verify-work [N]`

## Architecture: Files Teach Claude

Every file in Kata serves dual purposes:
1. **Runtime functionality** — Loaded by Claude during execution
2. **Teaching material** — Shows Claude how to build software systematically

### Multi-Agent Orchestration

Kata uses a thin orchestrator + specialized agents pattern:

| Orchestrator (Skill)        | Spawns                                                 | Purpose                        |
| --------------------------- | ------------------------------------------------------ | ------------------------------ |
| `kata-plan-phase`           | kata-phase-researcher, kata-planner, kata-plan-checker | Research → Plan → Verify loop  |
| `kata-execution`            | kata-executor (multiple in parallel)                   | Execute plans in waves         |
| `kata-verification-and-uat` | kata-verifier, kata-debugger                           | Check goals, diagnose failures |

**Key principle:** Orchestrators stay lean (~15% context), subagents get fresh 200k tokens each.

## Skills Architecture

Skills are the primary interface for all Kata workflows. They respond to both natural language and explicit slash command invocation.

### Invocation Syntax

| Syntax                  | Example                   |
| ----------------------- | ------------------------- |
| `/kata:kata-skill-name` | `/kata:kata-plan-phase 1` |

**Key points:**
- **Natural language works:** "plan phase 2", "what's the status", "execute the phase"
- **Explicit invocation works:** Use the slash command syntax for precision
- **All skills are user-invocable:** Direct `/` menu access and natural language routing

### Available Skills

Skills are installed to `.claude/skills/` and invoked via `/kata:kata-skill-name`.

| Skill                 | Invocation                  | Purpose                                        | Sub-agents Spawned                       |
| --------------------- | --------------------------- | ---------------------------------------------- | ---------------------------------------- |
| `kata-plan-phase`     | `/kata:kata-plan-phase`     | Phase planning, task breakdown                 | kata-planner, kata-plan-checker          |
| `kata-execute-phase`  | `/kata:kata-execute-phase`  | Plan execution, checkpoints                    | kata-executor                            |
| `kata-verify-work`    | `/kata:kata-verify-work`    | Goal verification, UAT                         | kata-verifier, kata-debugger             |
| `kata-new-project`    | `/kata:kata-new-project`    | New project setup                              | kata-project-researcher, kata-roadmapper |
| `kata-add-milestone`  | `/kata:kata-add-milestone`  | Add milestone, research, requirements, roadmap | kata-project-researcher, kata-roadmapper |
| `kata-research-phase` | `/kata:kata-research-phase` | Domain research                                | kata-phase-researcher                    |
| `kata-track-progress` | `/kata:kata-track-progress` | Progress, debug, mapping                       | kata-debugger, kata-codebase-mapper      |

### Skill Naming Best Practices

**Skill names and descriptions are critical for autonomous invocation.** Claude matches skills based on name and description before falling back to default behaviors.

**Mandatory conventions:**
- **Use gerund (verb-ing) style names** — `kata-managing-todos` not `kata-todo-management`. The gerund form reads naturally: "Use this skill for managing todos"
- **Exhaustive trigger phrases in description** — List EVERY phrase a user might say that should trigger the skill. More triggers = better matching

**Key learnings:**
- **Be verbose and specific** — Generic names like "utility" or "verification" get lost. Use descriptive names like `kata-providing-progress-and-status-updates` or `kata-verify-work-outcomes-and-user-acceptance-testing`
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

**Deprecated.** The bin/install.js script now displays a deprecation message directing users to install via the Claude Code plugin marketplace.

For local development, use `npm run build:plugin` instead. See "Installation and Testing" above.

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
2. **Test locally** — Use `npm run build:plugin` and test with `claude --plugin-dir`
3. **Update KATA-STYLE.md** — If introducing new patterns or conventions
4. **Follow KATA-STYLE.md** — For all formatting, naming, and structural decisions
5. **When modifying skills** — Follow the /building-claude-code-skills methodology
6. **Keep SKILL.md under 500 lines** — Move details to `references/` subdirectory

## Testing and UAT

- Create test projects in `../kata-burner/` using `../kata-burner/create-test-project.sh`
- Use `scripts/test-local.sh` to run local tests against the plugin