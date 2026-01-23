# Codebase Structure

**Analysis Date:** 2026-01-16

## Directory Layout

```
kata-cli/
├── bin/                    # NPM package entry point (installer)
├── commands/               # User-facing slash commands
│   └── kata/               # All /kata:* commands
├── agents/                 # Specialized subagents with baked-in expertise
├── kata/                   # Core skill content (workflows, templates, references)
│   ├── references/         # Methodology guides and pattern libraries
│   ├── templates/          # Document structure templates
│   │   ├── codebase/       # Codebase mapping templates
│   │   └── research-project/  # Project research templates
│   └── workflows/          # Detailed step-by-step procedures
├── hooks/                  # Shell scripts for Claude Code integration
├── .claude/                # Mirror structure for development (gets copied to ~/.claude)
├── .github/                # GitHub workflows and templates
├── .planning/              # Project planning artifacts (Kata dogfooding)
├── assets/                 # Documentation assets (images, etc.)
├── package.json            # NPM package manifest
├── CHANGELOG.md            # Version history
└── README.md               # Package documentation
```

## Directory Purposes

**`bin/`:**
- Purpose: NPM package installation entry point
- Contains: Single `install.js` script
- Key files: `bin/install.js`

**`commands/kata/`:**
- Purpose: All user-facing slash commands
- Contains: One `.md` file per command
- Key files: `project-new.md`, `phase-plan.md`, `phase-execute.md`, `execute-plan.md`

**`agents/`:**
- Purpose: Specialized subagents spawned by commands
- Contains: One `.md` file per agent type
- Key files: `kata-planner.md`, `kata-executor.md`, `kata-verifier.md`, `kata-roadmapper.md`

**`kata/workflows/`:**
- Purpose: Detailed execution workflows referenced by commands
- Contains: Complex multi-step procedures
- Key files: `phase-execute.md`, `phase-plan.md`, `create-roadmap.md`

**`kata/templates/`:**
- Purpose: Document structure templates with placeholders
- Contains: State templates, plan templates, summary templates
- Key files: `state.md`, `summary.md`, `roadmap.md`, `requirements.md`

**`kata/references/`:**
- Purpose: Methodology guides and best practices
- Contains: Principles, patterns, debugging guides
- Key files: `goal-backward.md`, `verification-patterns.md`, `tdd.md`

**`hooks/`:**
- Purpose: Shell scripts for Claude Code hooks
- Contains: Executable shell scripts
- Key files: `statusline.sh`, `gsd-notify.sh`, `gsd-check-update.sh`

## Key File Locations

**Entry Points:**
- `bin/install.js`: NPM package installation script

**Configuration:**
- `package.json`: NPM package metadata and files list

**Commands (User-Facing):**
- `commands/kata/project-new.md`: Initialize new project
- `commands/kata/phase-plan.md`: Create execution plans for a phase
- `commands/kata/phase-execute.md`: Execute all plans in a phase
- `commands/kata/execute-plan.md`: Execute a single plan
- `commands/kata/progress.md`: Show project progress
- `commands/kata/help.md`: Command reference

**Agents (Subagents):**
- `agents/kata-planner.md`: Creates PLAN.md files with task breakdown
- `agents/kata-executor.md`: Executes plans with atomic commits
- `agents/kata-verifier.md`: Verifies phase goal achievement
- `agents/kata-roadmapper.md`: Creates ROADMAP.md with phase structure
- `agents/kata-codebase-mapper.md`: Analyzes existing codebase
- `agents/kata-debugger.md`: Debugging specialist
- `agents/kata-plan-checker.md`: Validates plans before execution

**Templates:**
- `kata/templates/state.md`: STATE.md structure
- `kata/templates/summary.md`: SUMMARY.md structure
- `kata/templates/roadmap.md`: ROADMAP.md structure
- `kata/templates/project.md`: PROJECT.md structure

**Workflows:**
- `kata/workflows/phase-execute.md`: Wave-based parallel execution
- `kata/workflows/phase-plan.md`: Phase planning workflow
- `kata/workflows/create-roadmap.md`: Roadmap creation workflow

**Hooks:**
- `hooks/statusline.sh`: Progress statusline for Claude Code
- `hooks/gsd-notify.sh`: Completion notifications (macOS/Linux/Windows)
- `hooks/gsd-check-update.sh`: Version update check on session start

## Naming Conventions

**Files:**
- Commands: `kebab-case.md` (e.g., `project-new.md`, `execute-plan.md`)
- Agents: `kata-{role}.md` (e.g., `kata-planner.md`, `kata-executor.md`)
- Templates: `kebab-case.md` (e.g., `state.md`, `summary.md`)
- Workflows: `kebab-case.md` (e.g., `phase-execute.md`)
- Hooks: `kata-{function}.sh` or `{function}.sh`

**Directories:**
- Lowercase with hyphens: `kata/`, `commands/kata/`
- Planning phases: `XX-name/` (zero-padded number + kebab-case name)

**Planning Artifacts:**
- Plans: `{phase}-{plan}-PLAN.md` (e.g., `01-02-PLAN.md`)
- Summaries: `{phase}-{plan}-SUMMARY.md` (e.g., `01-02-SUMMARY.md`)
- Verification: `{phase}-VERIFICATION.md` (e.g., `01-VERIFICATION.md`)

## Where to Add New Code

**New Command:**
- Implementation: `commands/kata/{command-name}.md`
- Must include: frontmatter with name, description, allowed-tools
- Pattern: Follow existing command structure with process steps

**New Agent:**
- Implementation: `agents/kata-{role}.md`
- Must include: frontmatter with name, description, tools, color
- Pattern: Self-contained with role, philosophy, execution flow, success criteria

**New Workflow:**
- Implementation: `kata/workflows/{workflow-name}.md`
- Pattern: Step-by-step procedure with process tags

**New Template:**
- Implementation: `kata/templates/{template-name}.md`
- Pattern: Markdown with placeholders and guidelines section

**New Reference:**
- Implementation: `kata/references/{topic}.md`
- Pattern: Methodology guide with examples

**New Hook:**
- Implementation: `hooks/{hook-name}.sh`
- Must be: Executable shell script (`chmod +x`)
- Integration: Add to `bin/install.js` and settings.json configuration

## Special Directories

**`.claude/`:**
- Purpose: Development mirror of installed structure
- Generated: Manual (for development)
- Committed: Yes

**`.planning/`:**
- Purpose: Project planning artifacts (GSD dogfooding)
- Generated: By GSD commands
- Committed: Partially (some files in .gitignore)

**`node_modules/`:**
- Purpose: NPM dependencies (none for this package)
- Generated: By npm install
- Committed: No

**`.git/`:**
- Purpose: Git repository data
- Generated: By git init
- Committed: No

## File Content Patterns

**Command Frontmatter:**
```yaml
---
name: gsd:{command-name}
description: What this command does
argument-hint: "[optional-args]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
---
```

**Agent Frontmatter:**
```yaml
---
name: gsd-{role}
description: What this agent does
tools: Read, Write, Edit, Bash, Grep, Glob
color: {color}
---
```

**Plan Frontmatter:**
```yaml
---
phase: XX-name
plan: NN
type: execute | tdd
wave: N
depends_on: []
files_modified: []
autonomous: true | false
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
```

---

*Structure analysis: 2026-01-16*
