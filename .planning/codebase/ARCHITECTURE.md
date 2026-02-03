# Architecture

**Analysis Date:** 2026-01-16

## Pattern Overview

**Overall:** Command-Orchestrator-Agent Pattern (Meta-Prompting System)

This is a meta-prompting and context engineering system for Claude Code. It provides structured workflows that guide Claude through spec-driven development.

**Key Characteristics:**
- Commands are thin orchestrators that delegate heavy work to specialized agents
- Agents contain baked-in expertise and execute autonomously
- All state is persisted in `.planning/` directory as Markdown files
- No runtime code execution - pure prompt engineering with shell hooks
- Designed for solo developer + Claude workflow

## Layers

**Commands Layer:**
- Purpose: Entry points invoked by users via `/kata:*` slash commands
- Location: `commands/kata/*.md`
- Contains: Orchestration logic, user interaction, agent spawning
- Depends on: Workflows, Templates, Agents
- Used by: Claude Code users directly

**Agents Layer:**
- Purpose: Specialized subagents with domain expertise baked in
- Location: `agents/*.md`
- Contains: Full methodology, structured returns, success criteria
- Depends on: Nothing (self-contained)
- Used by: Commands via Task tool spawning

**Workflows Layer:**
- Purpose: Detailed step-by-step procedures for complex operations
- Location: `kata/workflows/*.md`
- Contains: Multi-step processes, validation logic, state transitions
- Depends on: Templates, References
- Used by: Commands and Agents as execution context

**Templates Layer:**
- Purpose: Document structures and output formats
- Location: `kata/templates/*.md`
- Contains: Markdown templates with placeholders
- Depends on: Nothing
- Used by: Workflows, Agents, Commands

**References Layer:**
- Purpose: Methodology guides and pattern libraries
- Location: `kata/references/*.md`
- Contains: Principles, best practices, debugging guides
- Depends on: Nothing
- Used by: Agents as baked-in knowledge

**Hooks Layer:**
- Purpose: Shell scripts for Claude Code integration
- Location: `hooks/*.sh`
- Contains: Statusline, notifications, update checks
- Depends on: Nothing (standalone shell scripts)
- Used by: Claude Code settings.json

**Installer Layer:**
- Purpose: NPM package installation script
- Location: `bin/install.js`
- Contains: File copying, settings.json configuration
- Depends on: All other layers (copies them to ~/.claude)
- Used by: `npx kata-cli`

## Data Flow

**Project Initialization Flow:**

1. User runs `/kata:project-new`
2. Command orchestrates questioning, research, requirements gathering
3. `kata-roadmapper` agent spawned to create ROADMAP.md
4. STATE.md initialized to track project memory
5. Phase directories created in `.planning/phases/`

**Planning Flow:**

1. User runs `/kata:phase-plan {N}`
2. Command loads STATE.md, ROADMAP.md context
3. Optional: Spawns `kata-plan-checker` for validation
4. `kata-planner` agent creates PLAN.md files
5. Plans grouped by wave number for parallel execution

**Execution Flow:**

1. User runs `/kata:phase-execute {N}` or `/kata:execute-plan`
2. Orchestrator discovers plans, groups by wave
3. `kata-executor` agents spawned per plan (parallel within wave)
4. Each executor creates SUMMARY.md, commits atomically
5. `kata-verifier` validates phase goal achievement
6. STATE.md updated with progress

**State Management:**
- `.planning/STATE.md`: Short-term project memory (~100 lines max)
- `.planning/PROJECT.md`: Core project context (updated with decisions)
- `.planning/ROADMAP.md`: Phase structure with progress
- `.planning/REQUIREMENTS.md`: Requirement tracking with traceability
- `.planning/phases/{active,pending,completed}/XX-name/`: Plan files, summaries, verification reports

**Phase State Organization:**
Phases are organized into state subdirectories under `.planning/phases/`:
- `pending/` — Phases not yet started (created by roadmapper)
- `active/` — Phase currently being executed (moved by phase-execute)
- `completed/` — Phases that have finished execution (moved after verification)
- `.archive/` — Cross-milestone historical records (moved by milestone-complete)

All phase discovery uses a universal pattern that scans across state subdirectories with a flat directory fallback for backward compatibility with unmigrated projects.

## Key Abstractions

**Commands (Orchestrators):**
- Purpose: User-facing entry points that coordinate workflows
- Examples: `commands/kata/project-new.md`, `commands/kata/execute-plan.md`
- Pattern: Thin orchestrator - validate, spawn agents, handle returns

**Agents (Subagents):**
- Purpose: Specialized workers with full methodology baked in
- Examples: `agents/kata-planner.md`, `agents/kata-executor.md`, `agents/kata-verifier.md`
- Pattern: Self-contained expertise, structured returns to orchestrator

**Plans (PLAN.md):**
- Purpose: Executable prompts for Claude (plans ARE prompts)
- Examples: `.planning/phases/01-setup/01-01-PLAN.md`
- Pattern: YAML frontmatter + XML task structure

**Summaries (SUMMARY.md):**
- Purpose: Execution records with what was built, decisions made
- Examples: `.planning/phases/01-setup/01-01-SUMMARY.md`
- Pattern: YAML frontmatter for dependency graph, markdown body

**Verification Reports (VERIFICATION.md):**
- Purpose: Goal-backward verification of phase achievement
- Examples: `.planning/phases/01-setup/01-VERIFICATION.md`
- Pattern: YAML gaps structure consumed by gap closure planning

## Entry Points

**User Installation:**
- Location: `bin/install.js`
- Triggers: `npx kata-cli --global`
- Responsibilities: Copy files to ~/.claude, configure settings.json hooks

**User Commands:**
- Location: `commands/kata/*.md`
- Triggers: `/kata:*` slash commands in Claude Code
- Responsibilities: Orchestrate workflows, spawn agents, present results

**Hook Scripts:**
- Location: `hooks/*.sh`
- Triggers: Claude Code session events (start, stop)
- Responsibilities: Statusline display, notifications, update checks

## Error Handling

**Strategy:** Structured returns with status codes

**Patterns:**
- Agents return `## PLAN COMPLETE`, `## CHECKPOINT REACHED`, or error state
- Orchestrators parse returns and route accordingly
- Checkpoints pause execution for human input
- Verification failures trigger gap closure planning loop

## Cross-Cutting Concerns

**Logging:** Console output via shell scripts (statusline, notifications)
**Validation:** Goal-backward verification in `kata-verifier` agent
**Authentication:** N/A (no runtime authentication - prompt engineering only)
**State Persistence:** All state in `.planning/` directory as Markdown
**Git Integration:** Atomic commits per task, commits bundled by orchestrators

---

*Architecture analysis: 2026-01-16*
