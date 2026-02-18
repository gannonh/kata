# Codebase Structure

**Analysis Date:** 2026-02-18

## Directory Layout

```
kata-orchestrator/
├── skills/                 # 33+ skill implementations (primary interface)
│   ├── kata-plan-phase/    # Phase planning orchestrator
│   │   ├── SKILL.md        # Orchestrator workflow
│   │   ├── references/     # Planner, checker, template instructions
│   │   └── scripts/        # Helper scripts (inherited from _shared)
│   ├── kata-execute-phase/ # Phase execution orchestrator
│   │   ├── SKILL.md
│   │   ├── references/     # Executor, verifier, checkpoint instructions
│   │   └── scripts/        # Phase discovery, worktree, intelligence updating
│   ├── kata-*/             # Other skills (new-project, research, verify-work, etc.)
│   └── _shared/            # Shared libraries (kata-lib.cjs, manage-worktree.sh)
├── scripts/                # Build and automation
│   ├── build.js            # Plugin and skills-sh distribution builder
│   └── test-local.sh       # Local testing helper
├── tests/                  # Test suite (Node.js)
│   ├── build.test.js       # Build validation tests
│   ├── migration-validation.test.js
│   ├── artifact-validation.test.js
│   ├── smoke.test.js       # Integration smoke tests
│   ├── skills/             # Skill-specific tests
│   ├── scripts/            # Script validation tests
│   ├── harness/            # Test utilities and fixtures
│   └── fixtures/           # Test data
├── .claude/                # Development mirror for local testing
│   ├── skills/             # Symlinks to skills/ for local plugin testing
│   └── plans/              # Local planning artifacts
├── .claude-plugin/         # Plugin distribution metadata
│   └── plugin.json         # Plugin manifest (name, version, description)
├── .planning/              # Project state (Kata dogfooding itself)
│   ├── phases/             # Phase organization
│   │   ├── active/         # Phases in progress
│   │   ├── pending/        # Planned but not started
│   │   └── completed/      # Finished phases
│   ├── intel/              # Generated codebase intelligence
│   │   ├── index.json      # File registry
│   │   ├── conventions.json # Detected patterns
│   │   └── summary.md      # 80-150 line agent summary
│   ├── codebase/           # Project analysis documents
│   │   ├── ARCHITECTURE.md
│   │   ├── STRUCTURE.md
│   │   ├── CONVENTIONS.md
│   │   ├── TESTING.md
│   │   ├── CONCERNS.md
│   │   ├── STACK.md
│   │   └── INTEGRATIONS.md
│   ├── templates/          # Per-project template overrides
│   ├── issues/             # GitHub issue tracking mirror
│   │   ├── open/
│   │   └── closed/
│   ├── milestones/         # Milestone tracking
│   ├── STATE.md            # Current position and decisions
│   ├── ROADMAP.md          # Phase breakdown
│   ├── PROJECT.md          # Vision and requirements
│   ├── config.json         # User settings and preferences
│   └── intel.json          # Intelligence metadata
├── docs/                   # Documentation
│   ├── GITHUB_WORKFLOWS.md
│   ├── USER-JOURNEYS.md
│   ├── worktrees.md
│   ├── TEMPLATE-CUSTOMIZATION.md
│   ├── cc/                 # Claude Code integration guides
│   └── glossary/           # Term definitions
├── .github/                # GitHub configuration
│   └── workflows/          # CI/CD pipeline definitions
├── dist/                   # Build output (generated)
│   ├── plugin/             # Claude Code marketplace plugin
│   └── skills-sh/          # Shell script distribution
├── assets/                 # Documentation assets
├── .secrets/               # Local credentials (gitignored)
├── bin/                    # Binary scripts
├── dev/                    # Development utilities
├── tasks/                  # Task definitions
├── package.json            # NPM metadata
├── CHANGELOG.md            # Version history
├── CLAUDE.md               # Project instructions for Claude Code
├── KATA-STYLE.md           # Style guide for Kata development
└── README.md               # Package documentation
```

## Directory Purposes

**`skills/`:**
- Purpose: User-facing workflow implementations (primary interface)
- Contains: 33+ skill directories, each with SKILL.md + references/ + scripts/
- Key patterns:
  - `SKILL.md`: Orchestrator workflow with YAML frontmatter
  - `references/`: Instructions inlined into subagent prompts
  - `scripts/`: Bash and Node.js helpers (config, git, file discovery)
- Key skills: `kata-plan-phase/`, `kata-execute-phase/`, `kata-new-project/`, `kata-verify-work/`, `kata-research-phase/`
- Example: `skills/kata-plan-phase/SKILL.md` is the entry point for phase planning

**`skills/_shared/`:**
- Purpose: Shared utilities distributed to all consuming skills
- Contains: `kata-lib.cjs` (config readers, file finders), `manage-worktree.sh` (git operations)
- Distribution: Build system copies to each skill's `scripts/` directory during build

**`scripts/`:**
- Purpose: Build and project automation
- Key files:
  - `build.js`: Transforms source to plugin and skills-sh distributions
  - `test-local.sh`: Local testing against plugin

**`tests/`:**
- Purpose: Comprehensive test suite (Node.js built-in)
- Structure:
  - `build.test.js`: Build output validation
  - `skills/`: Individual skill tests (e.g., `kata-plan-phase.test.js`)
  - `scripts/`: Script validation tests
  - `harness/`: Test utilities and affected file detection
  - `fixtures/`: Test data and sample projects

**`.claude/`:**
- Purpose: Development environment for local testing
- Contains: Local copy of skills/ and plans/ for plugin development
- Used by: `claude --plugin-dir .claude` for local testing

**`.claude-plugin/`:**
- Purpose: Plugin distribution metadata
- Contains: `plugin.json` with name, version, description for marketplace

**`.planning/`:**
- Purpose: Project state and roadmap (Kata dogfooding itself)
- Key files:
  - `STATE.md`: Current position and decisions (~100 lines)
  - `ROADMAP.md`: Phase structure with issue numbers
  - `PROJECT.md`: Project vision and requirements
  - `config.json`: User settings (model_profile, pr_workflow, depth)
  - `intel/`: Generated codebase intelligence (index.json, conventions.json, summary.md)
  - `phases/`: Phase organization by lifecycle (active/, pending/, completed/)
  - `codebase/`: Analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
  - `issues/`: GitHub issue mirror (open/, closed/)

**`.github/`:**
- Purpose: GitHub Actions workflows and templates
- Contains: CI/CD pipeline for release automation

**`dist/`:**
- Purpose: Build output (generated by `npm run build:plugin`)
- Contains:
  - `plugin/`: Ready-to-distribute plugin (entire skills/ + metadata)
  - `skills-sh/`: Skills-only distribution for shell script consumption
- Not committed: These are generated

**`docs/`:**
- Purpose: Developer and user documentation
- Key files: Guides for worktrees, GitHub workflows, user journeys, template customization

## Key File Locations

**Entry Points:**
- `package.json`: NPM metadata, scripts, version (v1.11.1 as of analysis)
- `scripts/build.js`: Build orchestrator for plugin and skills-sh targets

**Build and Distribution:**
- `.claude-plugin/plugin.json`: Marketplace plugin metadata
- `CHANGELOG.md`: Version history and release notes
- `.github/workflows/release.yml`: CI/CD pipeline for automated releases

**Skills (User-Facing Interfaces):**
- `skills/kata-plan-phase/SKILL.md`: Plan phase orchestrator
- `skills/kata-execute-phase/SKILL.md`: Execute phase orchestrator
- `skills/kata-new-project/SKILL.md`: Project initialization
- `skills/kata-verify-work/SKILL.md`: Goal verification and UAT
- `skills/kata-map-codebase/SKILL.md`: Codebase intelligence generation
- `skills/kata-research-phase/SKILL.md`: Domain research
- `skills/kata-track-progress/SKILL.md`: Progress display
- All skills follow same structure: `SKILL.md` (orchestrator) + `references/` (instructions) + `scripts/` (helpers)

**Skill References (Instruction Sets):**
- `skills/kata-plan-phase/references/planner-instructions.md`: Planner subagent methodology
- `skills/kata-plan-phase/references/plan-checker-instructions.md`: Plan validation
- `skills/kata-execute-phase/references/executor-instructions.md`: Executor subagent methodology
- `skills/kata-execute-phase/references/execute-plan.md`: Plan execution workflow
- `skills/kata-execute-phase/references/phase-execute.md`: Phase execution orchestration
- All skills have `ui-brand.md` for consistent UI presentation

**Skill Scripts:**
- `skills/_shared/kata-lib.cjs`: Configuration readers, roadmap parsing, codebase analysis
- `skills/_shared/manage-worktree.sh`: Worktree creation and branch management
- `skills/kata-execute-phase/scripts/find-phase.sh`: Discover phase plans
- `skills/kata-execute-phase/scripts/create-phase-branch.sh`: Git branch setup
- `skills/kata-execute-phase/scripts/update-intel-summary.cjs`: Intelligence regeneration

**Project State:**
- `.planning/STATE.md`: Current position and decisions (living memory)
- `.planning/ROADMAP.md`: Phase structure with issue references
- `.planning/PROJECT.md`: Project vision and requirements
- `.planning/config.json`: Configuration (model_profile, pr_workflow, depth, template_overrides)
- `.planning/intel/summary.md`: Auto-generated codebase conventions (80-150 lines)

**Codebase Intelligence:**
- `.planning/intel/index.json`: File registry with exports, imports, types, layers
- `.planning/intel/conventions.json`: Detected naming patterns and directory purposes
- `.planning/intel/summary.md`: Compressed summary for agent consumption

**Configuration and Documentation:**
- `CLAUDE.md`: Project instructions for Claude Code
- `KATA-STYLE.md`: Style guide for Kata development (XML, naming, tone, patterns)
- `README.md`: Package documentation and installation guide

## Naming Conventions

**Skills:**
- Format: `kata-{gerund-or-action}.md` (verb-ing preferred)
- Examples: `kata-plan-phase`, `kata-execute-phase`, `kata-verify-work`, `kata-map-codebase`, `kata-research-phase`
- YAML frontmatter includes: `name`, `description` (with trigger phrases), `metadata.version`

**Skill References:**
- Format: `kebab-case.md` (semantic to context)
- Examples: `planner-instructions.md`, `executor-instructions.md`, `phase-execute.md`, `plan-template.md`, `ui-brand.md`

**Skill Scripts:**
- Bash: `kebab-case.sh` (e.g., `find-phase.sh`, `create-phase-branch.sh`)
- Node.js: `kebab-case.cjs` (CommonJS, e.g., `kata-lib.cjs`, `check-conventions.cjs`)
- Shared: `scripts/_shared/` → distributed to each consumer skill's `scripts/`

**Build Output:**
- Plugin: `dist/plugin/` (complete distribution)
- Skills-sh: `dist/skills-sh/` (skills only)

**Planning Artifacts:**
- Plans: `{N}-{name}/NN-{plan-name}-PLAN.md` (e.g., `.planning/phases/active/0/01-setup-PLAN.md`)
- Summaries: `{N}-{name}/NN-{plan-name}-SUMMARY.md` (e.g., `.planning/phases/active/0/01-setup-SUMMARY.md`)
- Verification: `{N}-{name}/{N}-VERIFICATION.md` (e.g., `.planning/phases/active/0/0-VERIFICATION.md`)
- State subdirectories: `active/`, `pending/`, `completed/` (not nested in phase dirs)

**Configuration:**
- Format: `kebab-case.json` (e.g., `config.json`, `conventions.json`, `index.json`)

**Tests:**
- Format: `{name}.test.js` (e.g., `build.test.js`, `kata-plan-phase.test.js`)
- Location: `tests/` for general, `tests/skills/` for skill-specific, `tests/scripts/` for script tests

## Where to Add New Code

**New Skill:**
- Location: `skills/kata-{gerund-action}/`
- Structure:
  - `SKILL.md` (required): Orchestrator with YAML frontmatter, `<execution_context>`, `<process>` steps
  - `references/` (optional): Instruction files for subagents, UI templates
  - `scripts/` (optional): Helper scripts (copied from _shared or custom)
- Pattern: Study existing skill (e.g., `kata-plan-phase/`) for structure
- Build: Script will automatically include in plugin/skills-sh distributions

**New Skill Reference:**
- Location: `skills/kata-{name}/references/{topic}.md`
- Purpose: Instructions for subagents spawned by the skill
- Pattern: Follow existing references (e.g., `planner-instructions.md`, `executor-instructions.md`)
- Consumption: Orchestrator lists in `<execution_context>` as `@./references/filename.md`

**New Skill Script:**
- Location: `skills/kata-{name}/scripts/` or `skills/_shared/`
- Language: Node.js (`.cjs`) preferred; bash (`.sh`) for git/system operations
- Pattern: Source `project-root.sh` at top (ensures correct project root)
- If shared: Add to `skills/_shared/`, build system distributes to each consumer

**New Planning Document:**
- Location: `.planning/codebase/{DOCUMENT}.md`
- Files: Auto-generated by `/kata-map-codebase`, updated by `update-intel-summary.cjs`
- Don't edit manually: These are regenerated; edits will be overwritten

**New Test:**
- Location: `tests/{category}.test.js` or `tests/{category}/{name}.test.js`
- Pattern: Use Node.js built-in test runner (no external test framework)
- Example: `tests/skills/kata-plan-phase.test.js` for skill-specific tests
- Run: `npm test` or `npm run test:affected`

**Configuration Addition:**
- Location: `.planning/config.json`
- Read via: `kata-lib.cjs read-config "key" "default"`
- Convention: Use kebab-case keys with dot notation for nested (e.g., `workflows.execute-phase.post_task_command`)
- Default: Fallback value if key not set (graceful degradation)

## Special Directories

**`.claude/`:**
- Purpose: Local development environment for plugin testing
- Generated: Manual (developer creates symlinks or copies)
- Committed: Yes (for team reference)
- Usage: `claude --plugin-dir .claude` to test changes locally

**`.planning/`:**
- Purpose: Project state and roadmap (Kata dogfooding itself)
- Generated: By skill commands (execute-phase, plan-phase, new-project, etc.)
- Committed: Partially (ROADMAP.md, STATE.md committed; generated Intel and work-in-progress files may be gitignored)

**`dist/`:**
- Purpose: Build output (plugin and skills-sh distributions)
- Generated: By `npm run build:plugin` or `npm run build:skills-sh`
- Committed: No (generated only, not in version control)

**`.github/workflows/`:**
- Purpose: CI/CD pipeline automation
- Committed: Yes
- Key file: `release.yml` (triggered on version bump in package.json)

## File Content Patterns

**Skill Frontmatter:**
```yaml
---
name: kata-{skill-name}
description: What skill does + trigger phrases ("plan phase", "create a plan", etc.)
metadata:
  version: "X.Y.Z"
---
```

**Execution Context (after frontmatter):**
```xml
<execution_context>
@./references/ui-brand.md
@./references/detailed-instructions.md
</execution_context>
```

**Process Steps (action elements):**
```xml
<process>

## N. Step Name

```bash
# Bash code or node script invocations
VARIABLE=$(node scripts/kata-lib.cjs read-config "key" "default")
```

Result: [What happens next]

</process>
```

**Plan Frontmatter (in `.planning/phases/active/N/`):**
```yaml
---
type: execute | tdd | research
wave: N
depends_on: [other-plan-ids]
files_modified: [src/path/file.ts]
autonomous: true | false
---
```

**Intelligence Index (`.planning/intel/index.json`):**
```json
{
  "version": 2,
  "generated": "ISO-8601",
  "source": "kata-map-codebase",
  "files": {
    "path/to/file.ts": {
      "exports": ["name1", "name2"],
      "imports": ["pkg"],
      "type": "component|service|util",
      "layer": "ui|api|data"
    }
  },
  "stats": { "totalFiles": 42 }
}
```

---

*Structure analysis: 2026-02-18*
