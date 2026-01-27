# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** Teams get reliable AI-driven development without abandoning their existing GitHub workflow
**Current focus:** v1.1.0 GitHub Integration — Phase 7: Deprecate NPX Support

## Current Position

Milestone: v1.1.0 GitHub Integration
Phase: 7 (Deprecate NPX Support)
Plan: 02 of 3 complete
Status: In progress
Last activity: 2026-01-27 — Completed 07-02 (Delete NPX Files)

Progress: [█████████████████████████████████████████████░░░] 90% (6.67/7 phases in v1.1.0)

## Performance Metrics

**Velocity:**
- Total plans completed: 62
- Average duration: 3 min
- Total execution time: 159 min

**By Milestone:**

| Milestone | Phases | Plans | Status |
| --------- | ------ | ----- | ------ |
| v0.1.4    | 1      | 5     | Shipped 2026-01-18 |
| v0.1.5    | 6      | 30    | Shipped 2026-01-22 |
| v1.0.0    | 4      | 5     | Shipped 2026-01-23 |
| v1.0.8    | 1      | 5     | Shipped 2026-01-24 |
| v1.0.9    | 1      | 3     | Shipped 2026-01-25 |
| v1.1.0    | 7      | 25    | In Progress (6/7 phases, +1 gap closure) |

**Recent Trend:**
- v1.0.1-v1.0.5: Rapid patch releases (5 patches in 2 days) addressing plugin distribution issues
- Focus shifted from planned features to stability
- v1.0.9: Command consolidation - skills made user-invocable alongside commands

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **2026-01-25: Commands/Skills architecture** — Commands are user-invocable (via `/kata:`), skills are agent-invocable (via `Skill()`). Commands invoke skills. Users → Commands → Skills → Agents.
- **2026-01-25: Build.js skill prefix transformation** — Plugin build strips `kata-` prefix from skill directories and names for clean `/kata:skill-name` invocation
- **2026-01-24: Roadmap realigned** — Updated to reflect actual release history; v0.1.9 became v1.0.0, added v1.0.8 milestone for stability work
- **2026-01-24: Phase 2.1 inserted** — Skill-Centric Resource Restructure to support npx-based skill distribution (Vercel model)
- **2026-01-23: Marketplace created** - gannonh/kata-marketplace repository with Kata v1.0.0 entry
- **2026-01-22: PR workflow spec in product** - `kata/references/planning-config.md#pr_workflow_behavior` is authoritative
- **2026-01-27: PR body static, issue tracks progress** — PR body checklist remains unchecked; GitHub issue is source of truth for plan completion

### Roadmap Evolution

- **v0.1.4 shipped 2026-01-18** — Hard Fork & Rebrand
- **v0.1.5 shipped 2026-01-22** — Skills & Documentation (6 phases, 30 plans)
- **v1.0.0 shipped 2026-01-23** — Claude Code Plugin (was v0.1.9 in planning)
- **v1.0.1-v1.0.5 patches 2026-01-23/24** — Plugin stability fixes
- **v1.0.8 shipped 2026-01-24** — Plugin Stability (1 phase, 5 plans) — skills now self-contained
- **v1.0.9 started 2026-01-25** — Command Consolidation (1 phase, 3 plans)
- **v1.1.0 milestone planned** — GitHub Integration (6 phases planned)
- **Phase 0 added 2026-01-25** — Develop Robust Testing Suite (inserted before Phase 1)
- **Phase 0 complete 2026-01-25** — 7 plans, 27 skill tests, CI workflow
- **Phase 1-2.2 complete 2026-01-26** — Config foundation, onboarding, repo setup, milestone decoupling
- **Phase 3 complete 2026-01-26** — Phase issue creation, 2 plans
- **Phase 4 complete 2026-01-26** — Plan sync (plan checklist in issues, execution checkbox updates, test coverage)
- **Phase 4 GAP fix 2026-01-26** — Fixed step ordering bug in kata-planning-phases (UAT finding)
- **Phase 5 complete 2026-01-27** — PR Integration (branch creation, draft PR, ready automation, tests, docs)
- **Phase 6 complete 2026-01-27** — PR Review Workflow Skill & Agents (3/3 plans)
- **Phase 6 UAT fix 2026-01-27** — Gap closure plan for backlog todo prompt and merge-first workflow
- **Phase 7 added 2026-01-27** — Deprecate NPX Support (plugin-only distribution)
- **Phase 7 plan 01 complete 2026-01-27** — Renamed 27 skill directories (removed kata- prefix)
- **Phase 7 plan 02 complete 2026-01-27** — Deleted NPX-specific files, cleaned up build.js

### Pending Todos

16 pending todos:
- `.planning/todos/pending/2026-01-18-statusline-kata-project-info.md` - Add kata project info to statusline
- `.planning/todos/pending/2026-01-18-create-move-phase-command.md` - Create move-phase command
- `.planning/todos/pending/2026-01-18-command-subagent-noun-verb-naming.md` - Change command and subagent naming to noun-verb
- `.planning/todos/pending/2026-01-18-npm-release-workflow-support.md` - Add optional npm release workflow to Kata
- `.planning/todos/pending/2026-01-18-separate-project-new-from-first-milestone.md` - Separate project-new from first milestone creation
- `.planning/todos/pending/2026-01-18-model-config-options.md` - Add model configuration options for workflows
- `.planning/todos/pending/2026-01-19-add-type-label-to-todo-frontmatter.md` - Add type label to todo frontmatter
- `.planning/todos/pending/2026-01-18-claudemd-kata-onboarding.md` - Add Kata section to CLAUDE.md during project-new onboarding
- `.planning/todos/pending/2026-01-18-new-user-ux-expectations.md` - Add new user UX expectations to onboarding
- `.planning/todos/pending/2026-01-18-integrate-pr-skill.md` - Integrate PR skill into Kata system
- `.planning/todos/pending/2026-01-20-folder-based-phase-state-management.md` - Folder-based phase state management
- `.planning/todos/pending/2026-01-20-improve-skill-recall-with-hooks.md` - Improve skill recall with hooks and rules
- `.planning/todos/pending/2026-01-20-addon-extensions-progressive-disclosure.md` - Add-on extensions for progressive disclosure files
- `.planning/todos/pending/2026-01-20-project-documentation-templates.md` - Project documentation templates and lifecycle
- `.planning/todos/pending/2026-01-20-cli-ui-for-todo-management.md` - CLI UI for viewing and managing todos
- `.planning/todos/pending/2026-01-21-add-validation-hooks-agents-skills.md` - Add validation hooks to agents and skills

### Blockers/Concerns

None yet.

### Quick Tasks Completed

| #   | Description                                      | Date       | Commit  | Directory                                                                       |
| --- | ------------------------------------------------ | ---------- | ------- | ------------------------------------------------------------------------------- |
| 001 | Add PR workflow config option                    | 2026-01-22 | 975f1d3 | [001-add-pr-workflow-config-option](./quick/001-add-pr-workflow-config-option/) |
| 002 | Config schema consistency & PR workflow features | 2026-01-22 | 325d86c | [002-config-schema-consistency](./quick/002-config-schema-consistency/)         |

## Session Continuity

Last session: 2026-01-27
Stopped at: Completed 07-02-PLAN.md (Delete NPX Files)
Next action: Execute 07-03 (Update Documentation) to complete phase 7
