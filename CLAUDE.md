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
```

### Using Kata for Kata Development

This project uses Kata to develop itself. Key files in `.planning/`:

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
1. Check progress: `/kata:progress`
2. Plan phase: `/kata:plan-phase [N]`
3. Execute: `/kata:execute-phase [N]`
4. Verify: `/kata:verify-work [N]`

## Architecture: Files Teach Claude

Every file in Kata serves dual purposes:
1. **Runtime functionality** — Loaded by Claude during execution
2. **Teaching material** — Shows Claude how to build software systematically

### Multi-Agent Orchestration

Kata uses a thin orchestrator + specialized agents pattern:

| Orchestrator          | Spawns                                                 | Purpose                        |
| --------------------- | ------------------------------------------------------ | ------------------------------ |
| `/kata:plan-phase`    | kata-phase-researcher, kata-planner, kata-plan-checker | Research → Plan → Verify loop  |
| `/kata:execute-phase` | kata-executor (multiple in parallel)                   | Execute plans in waves         |
| `/kata:verify-work`   | kata-verifier, kata-debugger                           | Check goals, diagnose failures |

**Key principle:** Orchestrators stay lean (~15% context), subagents get fresh 200k tokens each.

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
- Copies: `commands/`, `kata/`, `agents/`, `hooks/`

## Working with Planning Files

When modifying `.planning/` files (PROJECT.md, ROADMAP.md, STATE.md):

1. **Always read STATE.md first** — Contains current position and accumulated decisions
2. **Respect the structure** — Templates in `kata/templates/` show expected format
3. **Update STATE.md** — When making decisions or completing work
4. **Commit planning changes** — Use `docs:` or `chore:` prefix

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
