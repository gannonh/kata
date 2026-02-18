# Codebase Intelligence Summary

Generated: 2026-02-18 | Source: .planning/codebase/

## Stack
- **Primary:**
- JavaScript (Node.js) - Project build system, test suite, skill scripts, codebase analysis
- Markdown - Skill definitions, documentation, workflows, references (majority of codebase)
- Bash - Task execution scripts, Git operations, system integration
- **Environment:**
- Node.js 20.0.0+ (specified in `package.json` engines field)
- npm - Dependency management, script orchestration
- Lockfile: `package-lock.json` present and committed
- Claude Code Plugin SDK - Primary runtime (plugin architecture for skills)
- Node.js test runner (`node:test`) - Native testing without external dependencies
- Node built-in `node:test` module - Unit and integration testing
- Node `node:assert` module - Assertion library
- junit-xml reporter via `--test-reporter junit` for CI integration
- Custom build script (`scripts/build.js`) - Plugin and distribution target assembly

## Architecture
- **Overall:** Multi-agent orchestration system with skills as primary user interface. Each skill is a self-contained orchestrator that spawns specialized subagents for autonomous work.
- Skills coordinate work through subagent spawning, not monolithic execution
- Progressive disclosure through references (instructions inlined into subagent prompts at spawn time)
- Context management: orchestrators stay lean (~15% context), subagents get fresh windows
- Distribution via two channels: Claude Code marketplace plugin and skills.sh shell script distribution
- Designed for solo developer + Claude workflow
- ## Layers
- Purpose: High-level workflow coordination, argument parsing, validation, UI presentation
- Location: `skills/kata-*/SKILL.md` (e.g., `skills/kata-plan-phase/SKILL.md`)
- Contains: YAML frontmatter, execution context references, step-by-step processes
- Depends on: Shared scripts, configuration readers, referenced instruction documents
- Used by: Claude Code CLI (user invocation via `/kata-skill-name`)
- Purpose: Detailed instructions inlined into subagent prompts. Not loaded by orchestrator, loaded by subagent.
- Location: `skills/kata-*/references/` (e.g., `skills/kata-plan-phase/references/planner-instructions.md`)
- Contains: Research instructions, implementation guidelines, verification checklists, UI templates, TDD patterns
- Pattern: One file per subagent role or domain concept (e.g., `planner-instructions.md`, `executor-instructions.md`, `verifier-instructions.md`)
- Consumption: Skill orchestrator `<execution_context>` section lists `@./references/filename.md` paths to be inlined
- Purpose: Automation helpers - configuration readers, directory finders, GitHub integration, worktree management, intelligence updating
- Location: `skills/kata-*/scripts/` (Node.js .cjs files and bash .sh files)
- Contains: Node.js (configuration, file discovery, code analysis) and bash (git operations, worktree manipulation)
- Distribution: Build system transforms `scripts/X` references to `${CLAUDE_PLUGIN_ROOT}/skills/SKILL_NAME/scripts/X` in plugin builds
- Shared scripts: `skills/_shared/kata-lib.cjs` and `skills/_shared/manage-worktree.sh` distributed to each skill's scripts directory

## Conventions
- **Markdown files** (80%+) — Prompts, templates, workflows, skills
- **JavaScript** (20%) — Build system, test suite, codebase analysis
- **Bash scripts** (<5%) — Project initialization, git automation, shared utilities
- **CommonJS** (<5%) — Shared library distributed to all skills
- **Files:**
- **JavaScript/Node.js:** camelCase (e.g., `build.js`, `generate-intel.js`)
- **Bash scripts:** kebab-case (e.g., `find-phase.sh`, `manage-worktree.sh`)
- **Test files:** `{name}.test.js` (Node.js test runner convention)
- **Markdown documentation:** kebab-case (e.g., `CONVENTIONS.md`)
- **Skill directories:** `kata-{function}` (e.g., `kata-plan-phase`, `kata-execute-phase`)
- **JavaScript/Node.js:** camelCase for all functions
- Example: `function resolveRoot()`, `export function invokeClaude()`
- **Bash scripts:** snake_case for function definitions (none currently in use)
- **CommonJS exports:** Object literal with function properties at end of file
- **Variables:**
- **JavaScript:** camelCase for local variables
- Example: `testDir`, `allowedTools`, `skillName`
- **Bash/Node.js:** SCREAMING_SNAKE_CASE for environment and shell variables
- Node.js built-in `node:test` module (no external test framework)
- Version: Node.js >= 20.0.0
- No external config file; everything in `package.json` scripts
- Node.js built-in `assert` and `assert/strict` modules
- `tests/` directory at repository root
- Subdirectories:

## Key Patterns
- **Planning State (`.planning/`):**
- ## Data Flow
- **Phase Planning Flow:**
- 1. User: `/kata-plan-phase N` (or natural language equivalent)
- 2. Orchestrator (`kata-plan-phase/SKILL.md`):
- 3. Planner Agent (fresh context):
- 4. Orchestrator verifies:
- 5. Output: `.planning/phases/active/N/PLAN.md` ready for execution
- **Phase Execution Flow:**
- 1. User: `/kata-execute-phase N` (or natural language equivalent)
- # External Integrations
- Service: GitHub via official GitHub CLI (`gh`)
- What it's used for: Milestone creation, Issue management, PR creation/management, repository metadata
- SDK/Client: GitHub CLI (`gh`) - external executable
- Auth: GitHub token in user's local `gh` config (not Kata-managed)
- Config keys: `github.enabled`, `github.issue_mode`
- Scripts: `create-draft-pr.sh`, `get-phase-issue.sh`, `update-issue-checkboxes.sh`
- Service: Git version control via `git` CLI
- What it's used for: Repository operations, branch management, commits, push/pull
- SDK/Client: Native `git` command
- Purpose: User-facing workflow implementations (primary interface)
- Contains: 33+ skill directories, each with SKILL.md + references/ + scripts/
- Key patterns:
- `SKILL.md`: Orchestrator workflow with YAML frontmatter

## Concerns
- **Analysis Date:** 2026-02-18
- **Stale Codebase Documentation:**
- Issue: Multiple documentation files in `.planning/codebase/` last updated 2026-01-16, now stale (32+ days old)
- Files: `ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md`, `INTEGRATIONS.md`, `STACK.md`, `TESTING.md`
- Impact: Documentation doesn't reflect current codebase state (v1.12.0 architecture). Agents/planners consume stale intel if they reference dated analysis
- Fix approach: Regenerate via `/kata-map-codebase` periodically (monthly or post-major-release). Consider automating stale detection
- **Script Distribution Complexity:**
- Issue: Scripts exist in three forms: source (`skills/kata-*/scripts/`), shared (`skills/_shared/`), and distributed (`dist/plugin/skills/kata-*/scripts/`)
- Files: `scripts/build.js` (lines 56-57, 240-450, 515-545), `11+ skills/kata-*/scripts/`, `skills/_shared/kata-lib.cjs`, `skills/_shared/manage-worktree.sh`
- Impact: Multiple copies of same script (`kata-lib.cjs`, `manage-worktree.sh`) distributed to each skill increases maintenance burden and risk of drift
- Fix approach: Consolidate to single canonical source; consider Node.js path resolution at runtime or build-time variable substitution instead of copying
- **Version Consistency Across Distribution Channels:**
- Issue: Version must be manually synchronized in `package.json` and `.claude-plugin/plugin.json`
- Files: `package.json` (line 4), `.claude-plugin/plugin.json` (line 3)
- Impact: Risk of version drift if either file is updated without the other; affects marketplace listings and skill registry
- Fix approach: Generate plugin.json VERSION from package.json at build time (already in build.js, confirmed consistent)
- **GitHub API Rate Limiting Not Enforced:**
- Issue: Multiple GitHub API calls without rate limiting checks; 9+ `gh api` calls in skills
- Files: `skills/kata-plan-phase/SKILL.md`, `skills/kata-execute-phase/SKILL.md`, `skills/kata-add-milestone/SKILL.md`, `skills/kata-complete-milestone/SKILL.md`, and others
- Impact: Users hitting rate limits during batch operations (planning multiple phases, auditing milestones) see "rate limited" warnings but no retry logic or request batching
- Fix approach: Add rate limit detection (from gh CLI warnings) and implement exponential backoff or batch delays between API calls
- **Large SKILL.md Files Approaching Context Limit:**
- Issue: Several SKILL.md files exceed 1000 lines, approaching practical orchestrator size limits
- Files: `skills/kata-add-milestone/SKILL.md` (1272 lines), `skills/kata-check-issues/SKILL.md` (1160 lines), `skills/kata-execute-phase/SKILL.md` (926 lines)

## Template Reference
- Generated using skills/kata-map-codebase/references/summary-template.md schema.
