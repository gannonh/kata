# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** Teams get reliable AI-driven development without abandoning their existing GitHub workflow
**Current focus:** v1.4.0 Issue & Phase Management — Phase 2 in progress

## Current Position

Milestone: v1.4.0 Issue & Phase Management
Phase: 2 of 5 (GitHub Issue Sync)
Plan: 01 of 3
Status: In progress
Last activity: 2026-02-01 — Completed 02-01-PLAN.md (add-issue GitHub sync)

Progress: [█████████                                         ] 1/3 plans (33%)

## Performance Metrics

**Velocity:**
- Total plans completed: 73
- Average duration: 3 min
- Total execution time: 183 min

**By Milestone:**

| Milestone | Phases | Plans | Status |
| --------- | ------ | ----- | ------ |
| v0.1.4    | 1      | 5     | Shipped 2026-01-18 |
| v0.1.5    | 6      | 30    | Shipped 2026-01-22 |
| v1.0.0    | 4      | 5     | Shipped 2026-01-23 |
| v1.0.8    | 1      | 5     | Shipped 2026-01-24 |
| v1.0.9    | 1      | 3     | Shipped 2026-01-25 |
| v1.1.0    | 10     | 33    | Shipped 2026-01-27 |
| v1.2.0    | 1      | 2     | Shipped 2026-01-27 |
| v1.2.1    | 1      | 1     | Shipped 2026-01-28 |
| v1.3.0    | 2      | 4     | Shipped 2026-01-28 |
| v1.3.3    | 1      | 4     | Shipped 2026-01-29 |

**Recent Trend:**
- v1.0.1-v1.0.5: Rapid patch releases (5 patches in 2 days) addressing plugin distribution issues
- Focus shifted from planned features to stability
- v1.0.9: Command consolidation - skills made user-invocable alongside commands

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **2026-02-01: Commands deprecated** — Removed commands/kata/ wrapper layer. Skills are now user-invocable directly via /kata:skill-name. 29 command files deleted, 27 skills updated. All references updated to use gerund skill names (e.g., `/kata:planning-phases` not `/kata:plan-phase`).
- **2026-01-25: Commands/Skills architecture** — (Superseded by 2026-02-01 decision) Commands were user-invocable (via `/kata:`), skills were agent-invocable (via `Skill()`). Commands invoked skills. Users → Commands → Skills → Agents.
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
- **Phase 7 plan 03 complete 2026-01-27** — Simplified build.js to plugin-only, tests reduced 55%
- **Phase 7 plan 04 complete 2026-01-27** — Updated documentation (README, CLAUDE.md, KATA-STYLE.md)
- **Phase 7 plan 05 complete 2026-01-27** — NPX deprecation stub (563 lines -> 17 lines)
- **Phase 7 COMPLETE 2026-01-27** — NPX deprecation complete, plugin-only distribution
- **Phase 7 GAP fix 2026-01-27** — Gap closure plan 07-06 for development workflow docs
- **v1.3.0 started 2026-01-28** — Release Automation & Workflow Docs (4 phases: 0-3)
- **Phase 0 plan 01 complete 2026-01-28** — Artifact validation test suite (13 tests)
- **Phase 0 plan 02 complete 2026-01-28** — CI workflow integration (validation before release)
- **Phase 0 COMPLETE 2026-01-28** — Foundation & CI Hardening (2 plans)
- **Phase 1 plan 01 complete 2026-01-28** — Version detection and changelog reference files
- **Phase 1 plan 02 complete 2026-01-28** — Release workflow integration into completing-milestones skill
- **Phase 1 COMPLETE 2026-01-28** — Release Automation (2 plans, REL-01 through REL-04 satisfied)
- **v1.3.0 milestone complete 2026-01-28** — Ready for release
- **v1.3.3 started 2026-01-29** — Internal Tooling (1 phase planned)
- **Phase 1 plan 01 complete 2026-01-29** — Workflow diagrams (6 Mermaid diagrams in FLOWS.md)
- **Phase 1 plan 02 complete 2026-01-29** — Terminology glossary (33 definitions in GLOSSARY.md)
- **Phase 1 COMPLETE 2026-01-29** — Internal Documentation (2 plans, TOOL-01 and TOOL-02 satisfied)
- **Phase 1 GAP fix 2026-01-29** — Gap closure plan 01-03 for orchestration diagram readability (UAT Issue #1)
- **Phase 1 GAP fix 2026-01-29** — Gap closure plan 01-04 for dark theme diagram styling (UAT Issue #2)
- **v1.3.3 SHIPPED 2026-01-29** — Internal Documentation complete (1 phase, 4 plans)
- **v1.4.0 started 2026-01-31** — Issue & Phase Management (1 phase planned)
- **Phase 1 plan 01 complete 2026-01-31** — Rename adding-todos to adding-issues
- **Phase 1 plan 02 complete 2026-01-31** — Rename checking-todos to checking-issues
- **Phase 1 plan 03 complete 2026-01-31** — Add auto-migration logic (archive, not delete)
- **Phase 1 plan 04 complete 2026-01-31** — Update secondary skill references (6 files)
- **Phase 1 plan 05 complete 2026-01-31** — Deprecation handling for old "todo" vocabulary
- **Phase 1 plan 06 complete 2026-01-31** — STATE.md integration verification
- **Phase 1 COMPLETE 2026-01-31** — Issue Model Foundation (6 plans)
- **Phase 2 plan 01 complete 2026-02-01** — Add GitHub issue sync to add-issue skill

### Pending Issues

27 open issues (26 legacy + 1 new):

**New issues** (`.planning/issues/open/`):
- `2026-02-01-test-issue.md` - Test issue

**Legacy issues** (`.planning/todos/pending/` - pending migration):
- `2026-01-18-statusline-kata-project-info.md` - Add kata project info to statusline
- `2026-01-18-create-move-phase-command.md` - Create move-phase command
- `2026-01-18-command-subagent-noun-verb-naming.md` - Change command and subagent naming to noun-verb
- `2026-01-18-npm-release-workflow-support.md` - Add optional npm release workflow to Kata
- `2026-01-18-separate-project-new-from-first-milestone.md` - Separate project-new from first milestone creation
- `2026-01-18-model-config-options.md` - Add model configuration options for workflows
- `2026-01-19-add-type-label-to-todo-frontmatter.md` - Add type label to todo frontmatter
- `2026-01-18-claudemd-kata-onboarding.md` - Add Kata section to CLAUDE.md during project-new onboarding
- `2026-01-18-new-user-ux-expectations.md` - Add new user UX expectations to onboarding
- `2026-01-18-integrate-pr-skill.md` - Integrate PR skill into Kata system
- `2026-01-20-folder-based-phase-state-management.md` - Folder-based phase state management
- `2026-01-20-improve-skill-recall-with-hooks.md` - Improve skill recall with hooks and rules
- `2026-01-20-addon-extensions-progressive-disclosure.md` - Add-on extensions for progressive disclosure files
- `2026-01-20-project-documentation-templates.md` - Project documentation templates and lifecycle
- `2026-01-20-cli-ui-for-todo-management.md` - CLI UI for viewing and managing todos
- `2026-01-21-add-validation-hooks-agents-skills.md` - Add validation hooks to agents and skills
- `2026-01-27-create-workflow-flow-diagrams.md` - Create detailed flow diagrams of workflow paths
- `2026-01-26-github-integration-tests.md` - GitHub integration tests
- `2026-01-26-github-issues-as-todos.md` - Replace local todos with GitHub Issues
- `2026-01-28-github-todos-backlog-integration.md` - GitHub todos/backlog integration
- `2026-01-28-roadmap-phase-management.md` - Roadmap phase management enhancements
- `2026-01-28-linear-integration-research.md` - Linear integration research
- `2026-01-28-encourage-small-milestones.md` - Encourage small milestones in workflow skill
- `2026-01-28-extract-inline-scripts-to-files.md` - Extract inline scripts from Markdown to standalone files
- `2026-01-28-offer-readme-revision-after-execution.md` - Offer README revision after execution phase
- `2026-01-28-demo-projects-for-uat-testing.md` - Create demo projects in various states for UAT testing

### Blockers/Concerns

None yet.

### Quick Tasks Completed

| #   | Description                                      | Date       | Commit  | Directory                                                                       |
| --- | ------------------------------------------------ | ---------- | ------- | ------------------------------------------------------------------------------- |
| 001 | Add PR workflow config option                    | 2026-01-22 | 975f1d3 | [001-add-pr-workflow-config-option](./quick/001-add-pr-workflow-config-option/) |
| 002 | Config schema consistency & PR workflow features | 2026-01-22 | 325d86c | [002-config-schema-consistency](./quick/002-config-schema-consistency/)         |
| 003 | Integrate GitHub issues into PR workflow         | 2026-01-31 | c367d42 | [003-integrate-github-issues-into-pr-workflow](./quick/003-integrate-github-issues-into-pr-workflow/) |
| 004 | Deprecate slash commands, skills-first           | 2026-02-01 | 7469479 | [004-deprecate-slash-commands](./quick/004-deprecate-slash-commands/)                                 |

## Session Continuity

Last session: 2026-02-01
Stopped at: Completed 02-01-PLAN.md (add-issue GitHub sync)
Resume file: None
Next action: Execute 02-02-PLAN.md (pull external issues)
