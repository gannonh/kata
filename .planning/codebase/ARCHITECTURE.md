# Architecture

**Analysis Date:** 2026-02-18

## Pattern Overview

**Overall:** Multi-agent orchestration system with skills as primary user interface. Each skill is a self-contained orchestrator that spawns specialized subagents for autonomous work.

**Key Characteristics:**
- Skills coordinate work through subagent spawning, not monolithic execution
- Progressive disclosure through references (instructions inlined into subagent prompts at spawn time)
- Context management: orchestrators stay lean (~15% context), subagents get fresh windows
- Distribution via two channels: Claude Code marketplace plugin and skills.sh shell script distribution
- Designed for solo developer + Claude workflow

## Layers

**Skill Orchestrators (`skills/kata-*/SKILL.md`):**
- Purpose: High-level workflow coordination, argument parsing, validation, UI presentation
- Location: `skills/kata-*/SKILL.md` (e.g., `skills/kata-plan-phase/SKILL.md`)
- Contains: YAML frontmatter, execution context references, step-by-step processes
- Depends on: Shared scripts, configuration readers, referenced instruction documents
- Used by: Claude Code CLI (user invocation via `/kata-skill-name`)

**Skill References (`skills/kata-*/references/`):**
- Purpose: Detailed instructions inlined into subagent prompts. Not loaded by orchestrator, loaded by subagent.
- Location: `skills/kata-*/references/` (e.g., `skills/kata-plan-phase/references/planner-instructions.md`)
- Contains: Research instructions, implementation guidelines, verification checklists, UI templates, TDD patterns
- Pattern: One file per subagent role or domain concept (e.g., `planner-instructions.md`, `executor-instructions.md`, `verifier-instructions.md`)
- Consumption: Skill orchestrator `<execution_context>` section lists `@./references/filename.md` paths to be inlined

**Skill Scripts (`skills/kata-*/scripts/`):**
- Purpose: Automation helpers - configuration readers, directory finders, GitHub integration, worktree management, intelligence updating
- Location: `skills/kata-*/scripts/` (Node.js .cjs files and bash .sh files)
- Contains: Node.js (configuration, file discovery, code analysis) and bash (git operations, worktree manipulation)
- Distribution: Build system transforms `scripts/X` references to `${CLAUDE_PLUGIN_ROOT}/skills/SKILL_NAME/scripts/X` in plugin builds
- Shared scripts: `skills/_shared/kata-lib.cjs` and `skills/_shared/manage-worktree.sh` distributed to each skill's scripts directory

**Shared Resources (`skills/_shared/`):**
- Purpose: Common utilities used across multiple skills
- Location: `skills/_shared/`
- Contains: `kata-lib.cjs` (config readers, roadmap validation, state management), `manage-worktree.sh` (worktree lifecycle)
- Distribution: Build system copies to each consuming skill's `scripts/` directory

**Planning State (`.planning/`):**
- Purpose: Project state tracking, phase organization, issue management, generated intelligence
- Key directories:
  - `.planning/phases/active/`, `pending/`, `completed/` — Phase organization by lifecycle
  - `.planning/intel/` — Generated codebase intelligence (index.json, conventions.json, summary.md)
  - `.planning/codebase/` — Project analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
  - `.planning/templates/` — Per-project template overrides
  - `.planning/issues/open/`, `closed/` — GitHub issue mirror
  - `.planning/milestones/` — Milestone tracking

**Build System (`scripts/build.js`):**
- Purpose: Transform source into two distribution formats
- Targets: `plugin` (Claude Code marketplace), `skills-sh` (shell script distribution)
- Path transformation: Converts `scripts/X` references to plugin-absolute paths using `${CLAUDE_PLUGIN_ROOT}`
- Excludes: `.planning/`, `tests/`, `.git/`, `node_modules/`, development directories
- Output: `dist/plugin/` and `dist/skills-sh/`

**Distribution Channels:**
- Plugin: GitHub releases with `.tar.gz` downloaded via `/plugin install`
- Skills registry: Synced downstream to `gannonh/kata-skills` (skills only)
- Marketplace: Synced downstream to `gannonh/kata-marketplace` (full plugin)

## Data Flow

**Phase Planning Flow:**

1. User: `/kata-plan-phase N` (or natural language equivalent)
2. Orchestrator (`kata-plan-phase/SKILL.md`):
   - Validates phase N exists in `.planning/ROADMAP.md`
   - Optionally triggers research (`kata-research-phase`)
   - Spawns `kata-planner` agent with `planner-instructions.md`
3. Planner Agent (fresh context):
   - Loads referenced instructions: `planner-instructions.md`, `plan-template.md`, `slicing-principles.md`
   - Reads `.planning/ROADMAP.md`, `.planning/phases/active/N/`
   - Generates `PLAN.md` (executable prompt with tasks, files, verification)
4. Orchestrator verifies:
   - Spawns `kata-plan-checker` agent with `plan-checker-instructions.md`
   - Checker validates tasks against plan template and codebase conventions
5. Output: `.planning/phases/active/N/PLAN.md` ready for execution

**Phase Execution Flow:**

1. User: `/kata-execute-phase N` (or natural language equivalent)
2. Orchestrator (`kata-execute-phase/SKILL.md`):
   - Discovers all plans in phase using `find-phase.sh`
   - Analyzes dependencies and groups into waves (parallel execution groups)
   - Spawns one `kata-executor` agent per plan
3. Executor Agent (fresh context per plan):
   - Loads `executor-instructions.md`, `execute-plan.md`, `checkpoints.md`
   - Reads plan file from `.planning/phases/active/N/{plan-name}-PLAN.md`
   - Executes tasks: reads files, modifies code, runs tests
   - Creates checkpoint for user verification
4. Orchestrator collects results:
   - Waits for all agents to complete
   - Stages git changes
   - Merges PR if `pr_workflow: true` in config
   - Moves phase to `.planning/phases/completed/`
   - Updates `.planning/STATE.md`

**State Management:**

- **`.planning/STATE.md`** — Living memory: current position, decisions, blockers, accumulated context
- **`.planning/ROADMAP.md`** — Phase breakdown: integer phases (0, 1, 2, ...) with issue references
- **`.planning/PROJECT.md`** — Project vision and requirements
- **`.planning/phases/{state}/N/PLAN.md`** — Executable phase plans (XML with tasks)
- **`.planning/intel/summary.md`** — Compressed codebase conventions (80-150 lines, regenerated by `/kata-map-codebase`)

## Key Abstractions

**Skill (Orchestrator):**
- Purpose: User-facing interface for workflows
- Pattern: YAML frontmatter + XML execution structure
- Examples: `skills/kata-plan-phase/`, `skills/kata-execute-phase/`, `skills/kata-new-project/`
- Lifecycle: Validates environment, spawns subagents, presents results to user

**Plan (Executable Prompt):**
- Purpose: Specification for executor agent work
- Format: XML with `<task>` elements, each containing files, actions, verification
- Examples: `.planning/phases/active/0/01-setup-PLAN.md`
- Characteristics: Self-contained, includes success criteria, targets specific files

**Subagent Invocation:**
- Purpose: Spawn fresh context for autonomous work
- Mechanism: Skill inlines instructions from `references/` into subagent prompt via `<execution_context>`
- Context budget: Orchestrator ~15%, subagent 100% fresh
- Examples: spawn planner for plan creation, executor for plan execution, checker for validation

**Script Libraries:**
- `kata-lib.cjs` — Configuration readers, roadmap parsing, codebase analysis
- `manage-worktree.sh` — Worktree creation, branch management, merge workflows
- Both distributed by build system to each consuming skill

**Codebase Intelligence:**
- Purpose: Auto-capture conventions for executor guidance
- Files: `.planning/intel/index.json` (file registry), `.planning/intel/conventions.json` (patterns), `.planning/intel/summary.md` (80-150 line agent summary)
- Generated by: `/kata-map-codebase` → `generate-intel.js`
- Consumed by: Executor agents (inlined into prompt via orchestrator)

## Entry Points

**User Invocation (CLI):**
- Location: `/kata-skill-name` in Claude Code CLI
- Routing: Skill name and description match triggers to find skill
- Example: `/kata-plan-phase 2` invokes `skills/kata-plan-phase/SKILL.md`

**Build Entry:**
- Location: `npm run build:plugin` or `npm run build:skills-sh`
- Handler: `scripts/build.js`
- Triggers: Transforms source → `dist/plugin/` or `dist/skills-sh/`, applies path rewrites

**Testing Entry:**
- Location: `npm test` or `npm run test:skills`
- Handler: Node.js built-in test runner
- Tests: Artifact validation, build validation, script tests, skill-specific tests in `tests/skills/`

## Error Handling

**Strategy:** Defensive checks in orchestrator, explicit messages for setup issues.

**Patterns:**

- **Environment validation:** Orchestrator checks `.planning/` exists before attempting work (error: "Run `/kata-new-project` first")
- **Phase lookup:** `find-phase.sh` validates state directories exist, guards with `[ -d .planning/phases/${state} ] || continue`
- **Configuration:** `kata-lib.cjs` provides default values with graceful fallback (e.g., `read-config "key" "default"`)
- **Script path resolution:** `project-root.sh` sourced at top of every script; detects project root or fails explicitly
- **Worktree detection:** `manage-worktree.sh` checks for `.bare` directory; runs safely in standard repos without errors
- **Git operations:** All git commands check return codes; explicit error messages for permission issues, missing remotes

## Cross-Cutting Concerns

**Logging:** Bash scripts output to stderr for errors, stdout for status. Node scripts use console.log. No structured logging.

**Configuration:** Single source of truth in `.planning/config.json`, read via `kata-lib.cjs read-config` helper. Supports:
- `model_profile` (balanced, comprehensive, quick)
- `pr_workflow` (true/false for PR-based automation)
- `depth` (quick, standard, comprehensive for plan sizing)
- `template_overrides` (per-project customization)

**Validation:** Build system validates all required skills exist, script references resolve, artifacts are well-formed.

**Git Integration:** All major skills (`kata-plan-phase`, `kata-execute-phase`, `kata-complete-milestone`) handle PR creation/merging.

**Code Conventions:** Detected by `/kata-map-codebase` and inlined into executor prompts via `.planning/intel/summary.md`. Enables consistent code generation without hardcoding language-specific knowledge.

---

*Architecture analysis: 2026-02-18*
