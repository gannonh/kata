# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Milestones

- **v0.1.4 Hard Fork & Rebrand** — Phase 0 (shipped 2026-01-18) — [archive](milestones/v0.1.4-ROADMAP.md)
- **v0.1.5 Skills & Documentation** — Phases 0-4 (in progress)
- **v0.1.6 Claude Code Plugin** — Phase 1 (planned)
- **v0.1.7 GitHub Integration** — Phases 1-5 (planned)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>v0.1.4 Hard Fork & Rebrand (Phase 0) — SHIPPED 2026-01-18</summary>

- [x] Phase 0: Hard Fork & Rebrand (5/5 plans) — completed 2026-01-18

</details>

### v0.1.5 Skills & Documentation (In Progress)

- [x] **Phase 0: Convert Commands to Skills** - Create skills as orchestrators that spawn sub-agents — completed 2026-01-20
- [x] **Phase 1: Migrate Todo Commands to Kata Skill** - Create kata-managing-todos skill from gsd:add-todo and gsd:check-todos — completed 2026-01-20
- [x] **Phase 1.1: Testing & Evals Harness** - CLI-based test framework leveraging `claude "prompt"` to verify skill invocation and artifact production (INSERTED) — completed 2026-01-20
- [x] **Phase 1.2: Skill Tests** - Write tests for all 10 kata skills using the test harness (INSERTED) — completed 2026-01-20
- [x] **Phase 1.3: Discuss Phase Skill** - Create kata-discussing-phase-context skill for pre-planning context gathering (INSERTED) — completed 2026-01-20
- [ ] **Phase 2: Create Kata Slash Commands** - Create GSD-equivalent slash commands that instantiate Kata skills
- [ ] **Phase 2.1: Slash Command Tests** - Write tests for all slash commands using the test harness (INSERTED)
- [ ] **Phase 3: Documentation** - Complete README and add onboarding guidance
- [ ] **Phase 4: Review & Refactor Subagents** - Review all kata subagents and refactor as needed given changes this milestone

### v0.1.6 Claude Code Plugin (Planned)

- [ ] **Phase 1: Plugin Distribution** - Package and publish Kata as a Claude Code plugin

### v0.1.7 GitHub Integration (Planned)

- [ ] **Phase 1: Audit & Config Foundation** - Understand integration points, establish config schema
- [ ] **Phase 2: Onboarding & Milestones** - Config during new-project, GitHub Milestone creation
- [ ] **Phase 3: Phase Issues** - Create GitHub Issues for phases with labels and metadata
- [ ] **Phase 4: Plan Sync** - Checklist items in issues, update as plans complete
- [ ] **Phase 5: PR Integration** - Create PRs at phase completion with auto-linking

## Phase Details

### v0.1.5 Skills & Documentation

#### Phase 0: Convert Commands to Skills
**Goal**: Create 8 skills as orchestrators following /building-claude-code-skills methodology
**Strategy** (REVISED 2026-01-19):
- Skills only — Create skills containing full workflow logic
- Leave commands unchanged — Keep for A/B testing between old commands and new skills
- No agent-skill binding — Skills ARE orchestrators that spawn multiple sub-agents via Task tool
- Use /building-claude-code-skills methodology — Follow the official skill-building patterns
**Depends on**: Nothing
**Requirements**: None (infrastructure improvement)
**Success Criteria** (what must be TRUE):
  1. 8 skills created: kata-planning-phases, kata-execution, kata-verification, kata-starting-new-projects, kata-manageing-milestones, kata-managing-project-roadmap, kata-researching-phases, kata-utility
  2. Each skill has SKILL.md (<500 lines) with proper frontmatter (name, description only)
  3. Each skill has references/ subdirectory for progressive disclosure
  4. Skills spawn sub-agents via Task tool (skills ARE orchestrators)
  5. Installation script updated to copy skills/ directory
  6. CLAUDE.md updated to document skills architecture
**Plans**: 12 plans (9 original + 3 gap closure)

Plans:
- [x] 00-01-PLAN.md — Create kata-planning-phases skill + update installer
- [x] 00-02-PLAN.md — Create kata-execution skill
- [x] 00-03-PLAN.md — Create kata-verification skill
- [x] 00-04-PLAN.md — Create kata-starting-new-projects skill
- [x] 00-05-PLAN.md — Create kata-manageing-milestones skill
- [x] 00-06-PLAN.md — Create kata-managing-project-roadmap skill
- [x] 00-07-PLAN.md — Create kata-researching-phases skill
- [x] 00-08-PLAN.md — Create kata-utility skill
- [x] 00-09-PLAN.md — Update CLAUDE.md documentation + test installation
- [x] 00-10-PLAN.md — Fix kata-execution SUMMARY/commits (gap closure)
- [x] 00-11-PLAN.md — Fix kata-verification UAT workflow (gap closure)
- [x] 00-12-PLAN.md — Improve skill trigger phrases (gap closure)

#### Phase 1: Migrate Todo Commands to Kata Skill
**Goal**: Create `kata-managing-todos` skill to handle todo capture and management, migrating functionality from GSD's `add-todo` and `check-todos` commands
**Depends on**: Phase 0 (Skills established)
**Requirements**: None (skill migration)
**Success Criteria** (what must be TRUE):
  1. kata-managing-todos skill created with SKILL.md (<500 lines)
  2. Skill has references/ subdirectory (todo-format.md, actions.md)
  3. ADD operation captures todos with area inference and duplicate detection
  4. CHECK operation lists pending todos with action options (work on, add to phase, create phase, brainstorm, put back)
  5. STATE.md updated on todo add/complete
  6. Installation verified with natural language triggers
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Create SKILL.md with operation detection and ADD operation
- [x] 01-02-PLAN.md — Add CHECK operation and references/actions.md
- [x] 01-03-PLAN.md — Verify installation and natural language triggers (renamed to kata-managing-todos)

#### Phase 1.1: Testing & Evals Harness (INSERTED)
**Goal**: Create a CLI-based testing framework that leverages Claude Code's command-line instantiation (`claude "prompt"`) to programmatically test Kata skills and commands
**Depends on**: Phase 1 (Todo skill exists for test subject)
**Requirements**: None (infrastructure improvement)
**Success Criteria** (what must be TRUE):
  1. Test harness script(s) can invoke `claude "prompt"` with controlled inputs
  2. Outcome parser scripts verify: skill invoked? correct artifacts produced?
  3. At least one skill covered by automated test (proof of concept)
  4. Tests can run in CI-like environment (no interactive prompts)
  5. Clear pass/fail reporting for UAT efficiency
**Plans**: 2 plans

Plans:
- [x] 01.1-01-PLAN.md — Create test harness utilities (claude-cli.js, assertions.js) and fixtures
- [x] 01.1-02-PLAN.md — Create proof-of-concept skill test + npm integration

#### Phase 1.2: Skill Tests (INSERTED)
**Goal**: Write comprehensive tests for all 10 kata skills using the test harness, ensuring skills trigger correctly on natural language prompts
**Depends on**: Phase 1.1 (Test harness exists)
**Requirements**: None (testing improvement)
**Success Criteria** (what must be TRUE):
  1. Test files exist for all 10 kata skills
  2. Each skill has at least one trigger test (natural language → skill invocation)
  3. Tests verify num_turns > 1 (skill actually ran)
  4. All tests pass (`npm test` succeeds)
  5. Single-skill test command works (`npm run test:skill -- tests/skills/<name>.test.js`)
**Plans**: 4 plans

Plans:
- [x] 01.2-01-PLAN.md — Create tests for debugging, execution, and milestone skills
- [x] 01.2-02-PLAN.md — Create tests for roadmap, planning, and progress skills
- [x] 01.2-03-PLAN.md — Create tests for research, new project, and verification skills
- [x] 01.2-04-PLAN.md — Verify all 10 tests exist and npm test works

#### Phase 1.3: Discuss Phase Skill (INSERTED)
**Goal**: Create `kata-discussing-phase-context` skill to gather user's vision and implementation decisions before planning, producing CONTEXT.md that downstream agents (researcher, planner) use
**Depends on**: Phase 1.2 (Skill test patterns established)
**Requirements**: None (skill gap closure)
**Success Criteria** (what must be TRUE):
  1. kata-discussing-phase-context skill created with SKILL.md (<500 lines)
  2. Skill has references/ subdirectory for progressive disclosure
  3. Skill analyzes phase to identify domain-specific gray areas
  4. Skill conducts adaptive questioning (4 questions per area, offer more/next)
  5. Skill enforces scope guardrail (clarifies HOW, not WHETHER to add more)
  6. Skill writes {phase}-CONTEXT.md with decisions that guide research/planning
  7. Skill offers next steps (research or plan)
  8. Test file created for skill trigger verification
**Plans**: 2 plans

Plans:
- [x] 01.3-01-PLAN.md — Create skill with SKILL.md and references/
- [x] 01.3-02-PLAN.md — Create test file and verify installation

#### Phase 2: Create Kata Slash Commands
**Goal**: Create GSD-equivalent slash commands that instantiate corresponding Kata skills, ensuring explicit invocation path alongside autonomous skill triggering
**Depends on**: Phase 0 (Skills exist), Phase 1.1 (Testing harness exists for verification)
**Requirements**: None (usability improvement)
**Success Criteria** (what must be TRUE):
  1. Kata slash commands created for all GSD command equivalents (25 commands)
  2. Each command has `disable-model-invocation: true` in frontmatter
  3. Each corresponding Kata skill has `user-invocable: false` in frontmatter
  4. Commands delegate to skills (thin wrappers that instantiate skill workflows)
  5. Gap skills created for any GSD commands without Kata skill equivalents
  6. NextUp tables updated to show `/kata-{command}` explicit invocation format
  7. README documentation updated with command reference
**Plans**: 7 plans

Plans:
- [x] 02-01-PLAN.md — Create 3 gap skills (update, quick, help)
- [x] 02-02-PLAN.md — Create project and milestone commands (7 commands)
- [x] 02-03-PLAN.md — Create roadmap and research commands (7 commands)
- [x] 02-04-PLAN.md — Create planning, execution, session, todo commands (8 commands)
- [x] 02-05-PLAN.md — Create utility commands (3 commands)
- [x] 02-06-PLAN.md — Update all skill frontmatters with user-invocable: false
- [x] 02-07-PLAN.md — Update installer, README, CLAUDE.md

**Status**: ✅ Complete (2026-01-20)

#### Phase 2.1: Slash Command Tests (INSERTED)
**Goal**: Write comprehensive tests for all Kata slash commands using the test harness, ensuring commands correctly invoke their corresponding skills
**Depends on**: Phase 2 (Slash commands exist), Phase 1.2 (Skill test patterns established)
**Requirements**: None (testing improvement)
**Success Criteria** (what must be TRUE):
  1. Test files exist for all Kata slash commands
  2. Each command has at least one invocation test
  3. Tests verify command → skill delegation works
  4. All tests pass (`npm test` succeeds)
**Plans**: TBD

Plans:
- [ ] 02.1-01: TBD (run /kata-planning-phases to break down)

#### Phase 3: Documentation
**Goal**: Complete README documentation and add onboarding guidance to help new users understand how Kata works
**Depends on**: Phase 2.1 (Slash command tests complete)
**Requirements**: None (documentation improvement)
**Success Criteria** (what must be TRUE):
  1. README.md sections completed (no trailing incomplete text)
  2. "What is This" section clearly explains Kata's differentiation from GSD
  3. Onboarding flow includes explanation of how the Kata system works
  4. New users can understand skills vs commands, planning workflow, and execution model
**Plans**: TBD

Plans:
- [ ] 03-01: TBD (run /kata-planning-phases to break down)

#### Phase 4: Review & Refactor Subagents
**Goal**: Review all kata subagents (agents/kata-*.md) and refactor as needed to align with changes made this milestone (skills architecture, naming conventions, spawning patterns)
**Depends on**: Phase 3 (Documentation complete, all skills finalized)
**Requirements**: None (quality improvement)
**Success Criteria** (what must be TRUE):
  1. All kata-* agents reviewed for consistency with skills architecture
  2. Agent naming follows established conventions (kata-{noun}-{verb} or kata-{gerund})
  3. Agent prompts updated to reference skills (not old commands)
  4. Unused or redundant agents removed
  5. Agent-skill spawning relationships documented in CLAUDE.md
**Plans**: TBD

Plans:
- [ ] 04-01: TBD (run /kata-planning-phases to break down)

### v0.1.6 Claude Code Plugin

#### Phase 1: Plugin Distribution
**Goal**: Package and publish Kata as a Claude Code plugin for easy distribution using `/plugin-dev:create-plugin`
**Depends on**: v0.1.5 complete (Documentation)
**Requirements**: None (distribution improvement)
**Success Criteria** (what must be TRUE):
  1. Kata packaged as Claude Code plugin using plugin-dev workflow
  2. Kata published to @gannonh Claude Code plugin marketplace repository
  3. Plugin manifest (plugin.json) correctly configured
  4. All commands, agents, workflows available through plugin
  5. Installation via plugin system documented
**Plans**: TBD

Plans:
- [ ] 01-01: TBD (run /kata-planning-phases to break down)

### v0.1.7 GitHub Integration

#### Phase 1: Audit & Config Foundation
**Goal**: Understand where GitHub integration hooks into existing Kata workflows and establish config schema
**Depends on**: v0.1.6 complete (Plugin Distribution)
**Requirements**: WFA-01, CFG-01, CFG-02
**Success Criteria** (what must be TRUE):
  1. Integration points documented for new-milestone, execute-phase, execute-plan commands
  2. `.planning/config.json` includes `github.enabled` boolean toggle
  3. `.planning/config.json` includes `github.issueMode` with values `auto | ask | never`
  4. Kata commands read config and branch on `github.enabled`
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

#### Phase 2: Onboarding & Milestones
**Goal**: New projects can configure GitHub integration and milestones create corresponding GitHub Milestones
**Depends on**: Phase 1 (config schema exists)
**Requirements**: CFG-03, GHM-01, GHM-02
**Success Criteria** (what must be TRUE):
  1. `/kata:new-project` prompts for GitHub integration preferences
  2. Config choices saved to `.planning/config.json` during onboarding
  3. `/kata:new-milestone` creates GitHub Milestone when `github.enabled = true`
  4. GitHub Milestone includes version number and description from ROADMAP.md
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

#### Phase 3: Phase Issues
**Goal**: Phases become GitHub Issues with proper labels, metadata, and milestone assignment
**Depends on**: Phase 2 (milestones exist to assign issues to)
**Requirements**: GHI-01, GHI-02, GHI-03
**Success Criteria** (what must be TRUE):
  1. Phase issues created with `phase` label when milestone created
  2. Issue body includes phase goal and success criteria from ROADMAP.md
  3. Phase issues assigned to corresponding GitHub Milestone
  4. Issues created respecting `github.issueMode` config setting
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

#### Phase 4: Plan Sync
**Goal**: Phase issues track plan progress as checklist items that update during execution
**Depends on**: Phase 3 (phase issues exist)
**Requirements**: GHI-04, GHI-05, WFA-02
**Success Criteria** (what must be TRUE):
  1. Phase issue body includes checklist of plans (after `/kata:plan-phase`)
  2. Checklist items checked as each plan completes during `/kata:execute-phase`
  3. Execute-plan workflow conditionally updates GitHub issue
  4. Plan status visible in GitHub without opening Kata
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

#### Phase 5: PR Integration
**Goal**: Phase completion creates well-formed PRs that link to issues and follow conventions
**Depends on**: Phase 4 (issues exist to link to)
**Requirements**: GHP-01, GHP-02, GHP-03, GHP-04, WFA-03
**Success Criteria** (what must be TRUE):
  1. `/kata:execute-phase` creates PR when all plans complete (if `github.enabled`)
  2. PR body includes "Closes #X" linking to phase issue
  3. PR title follows convention: `Phase N: [Phase Name]`
  4. PR body includes summary from phase SUMMARY.md
  5. GitHub-specific templates exist for @file loading in workflows
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

| Phase                             | Milestone | Plans Complete | Status      | Completed  |
| --------------------------------- | --------- | -------------- | ----------- | ---------- |
| 0. Hard Fork & Rebrand            | v0.1.4    | 5/5            | Complete    | 2026-01-18 |
| 0. Convert Commands to Skills     | v0.1.5    | 12/12          | Complete    | 2026-01-20 |
| 1. Migrate Todo Commands to Skill | v0.1.5    | 3/3            | Complete    | 2026-01-20 |
| 1.1 Testing & Evals Harness       | v0.1.5    | 2/2            | Complete    | 2026-01-20 |
| 1.2 Skill Tests                   | v0.1.5    | 4/4            | Complete    | 2026-01-20 |
| 1.3 Discuss Phase Skill           | v0.1.5    | 2/2            | Complete    | 2026-01-20 |
| 2. Create Kata Slash Commands     | v0.1.5    | 0/7            | Planned     | -          |
| 2.1 Slash Command Tests           | v0.1.5    | 0/?            | Not planned | -          |
| 3. Documentation                  | v0.1.5    | 0/?            | Not planned | -          |
| 4. Review & Refactor Subagents    | v0.1.5    | 0/?            | Not planned | -          |
| 1. Plugin Distribution            | v0.1.6    | 0/?            | Not planned | -          |
| 1. Audit & Config Foundation      | v0.1.7    | 0/?            | Not planned | -          |
| 2. Onboarding & Milestones        | v0.1.7    | 0/?            | Not started | -          |
| 3. Phase Issues                   | v0.1.7    | 0/?            | Not started | -          |
| 4. Plan Sync                      | v0.1.7    | 0/?            | Not started | -          |
| 5. PR Integration                 | v0.1.7    | 0/?            | Not started | -          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-01-20 — Phase 2 planned (7 plans)*
