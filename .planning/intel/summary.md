# Codebase Intelligence Summary

Generated: 2026-02-15 | Source: .planning/codebase/

## Stack
- **Primary:**
- JavaScript (Node.js) - Core installer script (`bin/install.js`)
- Markdown - Commands, agents, templates, workflows, references (95% of codebase)
- Bash - Shell hooks (`hooks/*.sh`)
- JSON - Configuration templates (`kata/templates/config.json`)
- **Environment:**
- Node.js >= 16.7.0 (specified in `package.json` engines field)
- npm (published to npm registry as `kata-cli`)
- Lockfile: Not committed (`.gitignore` excludes `package-lock.json`)
- Claude Code CLI - Target platform (slash commands, agents, hooks)
- No application frameworks - Pure meta-prompting system
- None - No test framework configured
- None - No build step required, distributed as-is
- Zero runtime dependencies - `package.json` has no `dependencies` or `devDependencies`

## Architecture
- **Overall:** Command-Orchestrator-Agent Pattern (Meta-Prompting System)
- Commands are thin orchestrators that delegate heavy work to specialized agents
- Agents contain baked-in expertise and execute autonomously
- All state is persisted in `.planning/` directory as Markdown files
- No runtime code execution - pure prompt engineering with shell hooks
- Designed for solo developer + Claude workflow
- ## Layers
- **Commands Layer:**
- Purpose: Entry points invoked by users via `/kata:*` slash commands
- Location: `commands/kata/*.md`
- Contains: Orchestration logic, user interaction, agent spawning
- Depends on: Workflows, Templates, Agents
- Used by: Claude Code users directly
- **Agents Layer:**
- Purpose: Specialized subagents with domain expertise baked in
- Location: `agents/*.md`
- Contains: Full methodology, structured returns, success criteria
- Depends on: Nothing (self-contained)
- Used by: Commands via Task tool spawning
- **Workflows Layer:**
- Purpose: Detailed step-by-step procedures for complex operations
- Location: `kata/workflows/*.md`

## Conventions
- **Markdown files** (90%+) — Prompts, templates, workflows, agent definitions
- **JavaScript** (bin/install.js) — CLI installer
- **Shell scripts** (hooks/*.sh) — Claude Code integration hooks
- **Files:**
- kebab-case for all files: `execute-plan.md`, `create-roadmap.md`
- Agent files: `gsd-{role}.md` (e.g., `kata-executor.md`, `kata-planner.md`)
- Template files: `{purpose}.md` (e.g., `summary.md`, `project.md`)
- Hook scripts: `gsd-{purpose}.sh` (e.g., `gsd-notify.sh`)
- **Commands:**
- Pattern: `gsd:{verb-noun}` (e.g., `gsd:execute-plan`, `gsd:create-roadmap`)
- All lowercase with hyphens
- kebab-case for tags: `<execution_context>`, `<success_criteria>`
- snake_case for step names: `name="load_project_state"`
- Type attributes use colon separator: `type="checkpoint:human-verify"`
- **Variables:**
- CAPS_UNDERSCORES in bash/shell: `PHASE_ARG`, `PLAN_START_TIME`
- camelCase in JavaScript: `hasGlobal`, `configDir`, `pathPrefix`
- **Commands are thin wrappers.** Delegate detailed logic to workflows or agents.
- <verify>curl -X POST localhost:3000/api/auth/login returns 200</verify>
- `<verify>` — Command or check to prove completion
- `<done>` — Acceptance criteria (measurable state)
- ## TDD Integration
- GSD supports TDD for **target projects** (projects built using GSD), not for GSD itself.
- ### TDD Detection Heuristic

## Key Patterns
- ## Data Flow
- **Project Initialization Flow:**
- 1. User runs `/kata:project-new`
- 2. Command orchestrates questioning, research, requirements gathering
- 3. `kata-roadmapper` agent spawned to create ROADMAP.md
- 4. STATE.md initialized to track project memory
- 5. Phase directories created in `.planning/phases/`
- **Planning Flow:**
- 1. User runs `/kata:phase-plan {N}`
- 2. Command loads STATE.md, ROADMAP.md context
- # External Integrations
- Primary integration target - Kata is a meta-prompting layer for Claude Code
- Integration mechanism: Slash commands in `commands/kata/*.md`
- Agent definitions in `agents/kata-*.md`
- Hooks in `hooks/*.sh` and `hooks/*.js`
- Settings configuration in `settings.json`
- Used by research agents for library documentation
- Tools: `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`
- Agents using it:
- `agents/kata-planner.md`
- Purpose: NPM package installation entry point
- Contains: Single `install.js` script
- Key files: `bin/install.js`
- Purpose: All user-facing slash commands

## Concerns
- **Analysis Date:** 2026-01-16
- **Duplicate Content Structure:**
- Issue: Content exists in both `agents/` and `.claude/agents/` with only path substitution differences (~/.claude/ vs ./.claude/)
- Files: `agents/*.md`, `.claude/agents/*.md` (11 agent files duplicated)
- Impact: Maintenance burden - changes must be made in two places, risk of drift
- Fix approach: Either generate `.claude/` content at install time from single source, or symlink
- **Deprecated Files Not Removed:**
- Issue: Multiple deprecated files remain in codebase with "DEPRECATED" headers but still loadable
- Files:
- `kata/workflows/phase-plan.md`
- `kata/workflows/phase-research.md`
- `kata/workflows/research-project.md`
- `kata/workflows/debug.md`
- `kata/references/plan-format.md`
- `kata/references/principles.md`
- `kata/references/scope-estimation.md`
- `kata/references/goal-backward.md`
- `kata/references/research-pitfalls.md`
- `kata/references/debugging/*.md` (5 files)
- `commands/kata/research-project.md`
- `commands/kata/define-requirements.md`
- `commands/kata/create-roadmap.md`
- Impact: Context pollution - deprecated files may still be loaded by commands, wasting context window
- Fix approach: Remove deprecated files or move to `_archive/` directory excluded from install

## Template Reference
- Generated using skills/kata-map-codebase/references/summary-template.md schema.
