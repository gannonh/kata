---
status: testing
phase: 02-create-kata-slash-commands
source:
  - 02-01-SUMMARY.md (gap skills)
  - 02-02-SUMMARY.md (project/milestone commands)
  - 02-03-SUMMARY.md (roadmap/research commands)
  - 02-04-SUMMARY.md (planning/execution commands)
  - 02-05-SUMMARY.md (utility commands)
  - 02-06-SUMMARY.md (skill frontmatter)
  - 02-07-SUMMARY.md (installer/docs)
started: 2026-01-21T00:58:00Z
updated: 2026-01-21T00:58:00Z
---

## Current Test
number: 1
name: Gap skills created
expected: |
  3 skills exist: kata-updating-to-latest-version, kata-executing-task-executes, kata-showing-available-commands-and-usage-guides
  Each has SKILL.md and references/ directory
awaiting: user response

## Tests

### 1. Gap Skills Created
expected: |
  - skills/kata-updating-to-latest-version/SKILL.md exists
  - skills/kata-executing-task-executes/SKILL.md exists
  - skills/kata-showing-available-commands-and-usage-guides/SKILL.md exists
  - Each has references/ subdirectory with content
result: pending

### 2. Project & Milestone Commands Work
expected: |
  - `/kata:project-new` command exists and delegates to kata-starting-project-news
  - `/kata:project-status` command exists and delegates to kata-providing-progress-and-status-updates
  - `/kata:workflow-debug` command exists and delegates to kata-debugging-kata-workflow-issues
  - `/kata:task-execute` command exists and delegates to kata-executing-task-executes
  - `/kata:milestone-new`, `/kata:milestone-complete`, `/kata:milestone-audit` exist
  - All have `disable-model-invocation: true` in frontmatter
result: pending

### 3. Roadmap & Research Commands Work
expected: |
  - `/kata:phase-add`, `/kata:phase-insert`, `/kata:phase-remove`, `/kata:roadmap-plan-gaps` exist
  - `/kata:phase-discuss`, `/kata:phase-research`, `/kata:phase-assumptions` exist
  - All delegate to correct skills (kata-managing-project-roadmap or kata-researching-phases)
  - All have `disable-model-invocation: true` in frontmatter
result: pending

### 4. Planning & Execution Commands Work
expected: |
  - `/kata:phase-plan`, `/kata:phase-execute`, `/kata:work-verify` exist
  - `/kata:work-pause`, `/kata:work-resume`, `/kata:codebase-map` exist
  - `/kata:todos-add`, `/kata:todo-check` exist
  - All delegate to correct skills
  - All have `disable-model-invocation: true` in frontmatter
result: pending

### 5. Utility Commands Work
expected: |
  - `/kata:help`, `/kata:update`, `/kata:whats-new` exist
  - help accepts optional command name argument
  - update and whats-new delegate to kata-updating-to-latest-version
  - All have `disable-model-invocation: true` in frontmatter
result: pending

### 6. All Skills Have user-invocable: false
expected: |
  - All 14 Kata skills have `user-invocable: false` in frontmatter
  - Skills: starting-project-news, manageing-milestones, managing-project-roadmap, discussing-phase-context, researching-phases, planning-phases, executing-project-phases, verifying-work-outcomes-and-user-acceptance-testing, providing-progress-and-status-updates, managing-todos, debugging-kata-workflow-issues, updating-to-latest-version, executing-task-executes, showing-available-commands-and-usage-guides
  - kata-planning-phases name fixed (was kata-planning-phases-phases)
result: pending

### 7. Installer Includes Commands
expected: |
  - bin/install.js copies commands/kata/ directory to Claude config
  - Installation creates ~/.claude/commands/kata/ or .claude/commands/kata/
  - All 25 commands installed
result: pending

### 8. README Documents Commands
expected: |
  - README.md has comprehensive command reference
  - Commands organized by category (Project, Milestone, Roadmap, Planning, Execution, etc.)
  - All commands use /kata: format (not /gsd:)
  - Troubleshooting section references commands/kata/ (not commands/gsd/)
result: pending

### 9. CLAUDE.md Reflects Command Model
expected: |
  - CLAUDE.md documents skills vs commands distinction
  - Explains user-invocable: false and disable-model-invocation: true
  - Shows both natural language and explicit command invocation
result: pending

### 10. Skill NextUp Tables Use Command Format
expected: |
  - All skill SKILL.md files have NextUp tables
  - Tables show /kata:command-name format (not /skill-name)
  - Example: "/kata:phase-plan" not "/kata-planning-phases"
result: pending

## Summary
total: 10
passed: 0
issues: 0
pending: 10
