# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Milestones

- **v0.1.4 Hard Fork & Rebrand** — Phase 0 (shipped 2026-01-18) — [archive](milestones/v0.1.4-ROADMAP.md)
- **v0.1.5 Skills & Documentation** — Phases 0-2 (shipped 2026-01-22) — [archive](milestones/v0.1.5-ROADMAP.md)
- **v1.0.0 Claude Code Plugin** — Phases 1-3 (shipped 2026-01-23)
- **v1.0.8 Plugin Stability** — Phase 2.1 (shipped 2026-01-24) — [archive](milestones/v1.0.8-ROADMAP.md)
- **v1.0.9 Command Consolidation** — Phase 2.2 (complete)
- **v1.1.0 GitHub Integration** — Phases 0-6 (planned)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>v0.1.4 Hard Fork & Rebrand (Phase 0) — SHIPPED 2026-01-18</summary>

- [x] Phase 0: Hard Fork & Rebrand (5/5 plans) — completed 2026-01-18

</details>

<details>
<summary>v0.1.5 Skills & Documentation (Phases 0-2) — SHIPPED 2026-01-22</summary>

- [x] Phase 0: Convert Commands to Skills (12/12 plans) — completed 2026-01-20
- [x] Phase 1: Migrate Todo Commands to Kata Skill (3/3 plans) — completed 2026-01-20
- [x] Phase 1.1: Testing & Evals Harness (2/2 plans) — completed 2026-01-20
- [x] Phase 1.2: Skill Tests (4/4 plans) — completed 2026-01-20
- [x] Phase 1.3: Discuss Phase Skill (2/2 plans) — completed 2026-01-20
- [x] Phase 2: Create Kata Slash Commands (7/7 plans) — completed 2026-01-21

</details>

<details>
<summary>v1.0.0 Claude Code Plugin (Phases 1-3) — SHIPPED 2026-01-23</summary>

- [x] Phase 1: Plugin Structure & Validation (1/1 plans) — completed 2026-01-22
- [x] Phase 1.1: Document PR Workflow Behavior (1/1 plans) — completed 2026-01-22
- [x] Phase 2: Marketplace Distribution (2/2 plans) — completed 2026-01-23
- [x] Phase 3: Documentation (1/1 plans) — completed 2026-01-23

**Patch releases after v1.0.0:**
- v1.0.1: Plugin release workflow fixes (2026-01-23)
- v1.0.2: Marketplace version update path fix (2026-01-23)
- v1.0.3: Plugin path resolution attempt (2026-01-23)
- v1.0.4: Revert path approach, add tests (2026-01-24)
- v1.0.5: Include hidden directories in marketplace copy (2026-01-24)

</details>

- **v1.0.8 Plugin Stability** — Phase 2.1 (shipped 2026-01-24) — [archive](milestones/v1.0.8-ROADMAP.md)

### v1.0.9 Command Consolidation (Complete)

- [x] **Phase 2.2: Normalize on Skills** (INSERTED) - Remove commands layer, skills become both slash commands and natural language — completed 2026-01-25

#### Phase 2.2: Normalize on Skills (INSERTED)
**Goal**: Eliminate command->skill indirection by making skills directly invocable; update build to strip `kata-` prefix for plugin namespace
**Depends on**: v1.0.8 complete (skills self-contained)
**Success Criteria** (what must be TRUE):
  1. `commands/kata/` directory deleted (27 files)
  2. All skills have `user-invocable: true` (default, remove `user-invocable: false` where present)
  3. Skills invocable as `/kata-planning-phases` (npx) or `/kata:planning-phases` (plugin)
  4. `build.js` strips `kata-` prefix from skill directories and `name` field for plugin distribution
  5. README updated with new invocation syntax
  6. CLAUDE.md updated to reflect architecture change
**Plans:** 3 plans

Plans:
- [x] 02.2-01-PLAN.md — Make all skills user-invocable
- [x] 02.2-02-PLAN.md — Update build.js to strip kata- prefix for plugin
- [x] 02.2-03-PLAN.md — Delete commands, update documentation

### v1.1.0 GitHub Integration (Planned)

- [x] **Phase 0: Develop Robust Testing Suite** - Establish testing infrastructure before integration work — completed 2026-01-25
- [x] **Phase 1: Audit & Config Foundation** - Understand integration points, establish config schema — completed 2026-01-25
- [x] **Phase 2: Onboarding & Milestones** - Config during project-new, GitHub Milestone creation — completed 2026-01-25
- [x] **Phase 2.1: GitHub Repo Setup** (INSERTED) - Detect/create GitHub repo before milestone creation — completed 2026-01-26
- [x] **Phase 2.2: Decouple Project Init & Milestone Setup** (INSERTED) - Separate project creation from first milestone, establish Kata↔GitHub mapping — completed 2026-01-26
- [x] **Phase 3: Phase Issues** - Create GitHub Issues for phases with labels and metadata — completed 2026-01-26
- [x] **Phase 4: Plan Sync** - Checklist items in issues, update as plans complete — completed 2026-01-26
- [x] **Phase 5: PR Integration** - Create PRs at phase start with auto-linking — completed 2026-01-27
- [x] **Phase 6: PR Review Workflow Skill & Agents** - Integrate PR review skill and agents into phase execution workflow (4/4 plans)
- [ ] **Phase 7: Deprecate NPX Support** - Remove NPX distribution, simplify to plugin-only, eliminate build process

## Phase Details

### v1.1.0 GitHub Integration

#### Phase 0: Develop Robust Testing Suite
**Goal**: Establish comprehensive testing infrastructure to validate Kata skills and agents using CLI-based testing with affected-test detection for CI cost control
**Depends on**: v1.0.9 complete (Command Consolidation)
**Success Criteria** (what must be TRUE):
  1. Testing framework established for Kata skills and agents
  2. Test patterns documented for integration testing
  3. CI/CD pipeline includes test execution
  4. Baseline test coverage for existing functionality (27 skills)
**Plans:** 7 plans

Plans:
- [x] 00-01-PLAN.md — Extend test harness with affected-test detection and assertions
- [x] 00-02-PLAN.md — Skill tests for status/info skills (Wave 1)
- [x] 00-03-PLAN.md — Skill tests for project management skills (Wave 2)
- [x] 00-04-PLAN.md — Skill tests for phase/milestone skills (Wave 3)
- [x] 00-05-PLAN.md — Skill tests for execution workflow skills (Wave 4)
- [x] 00-06-PLAN.md — Skill tests for utility skills (Wave 5)
- [x] 00-07-PLAN.md — CI/CD integration with GitHub Actions

#### Phase 1: Audit & Config Foundation
**Goal**: Understand where GitHub integration hooks into existing Kata workflows and establish config schema
**Depends on**: Phase 0 complete (testing in place)
**Requirements**: WFA-01, CFG-01, CFG-02
**Success Criteria** (what must be TRUE):
  1. Integration points documented for milestone-new, phase-execute, execute-plan commands
  2. `.planning/config.json` includes `github.enabled` boolean toggle
  3. `.planning/config.json` includes `github.issueMode` with values `auto | ask | never`
  4. Kata commands read config and branch on `github.enabled`
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Document integration points and extend config schema
- [x] 01-02-PLAN.md — Add github namespace to config.json and verify

#### Phase 2: Onboarding & Milestones
**Goal**: New projects can configure GitHub integration and milestones create corresponding GitHub Milestones
**Depends on**: Phase 1 (config schema exists)
**Requirements**: CFG-03, GHM-01, GHM-02
**Success Criteria** (what must be TRUE):
  1. `/kata:starting-projects` prompts for GitHub integration preferences
  2. Config choices saved to `.planning/config.json` during onboarding
  3. `/kata:starting-milestones` creates GitHub Milestone when `github.enabled = true`
  4. GitHub Milestone includes version number and description from ROADMAP.md
**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — Add GitHub integration questions to kata-starting-projects
- [x] 02-02-PLAN.md — Add GitHub Milestone creation to kata-starting-milestones
- [x] 02-03-PLAN.md — Integration tests for GitHub features

#### Phase 2.1: GitHub Repo Setup (INSERTED)
**Goal**: Ensure GitHub repository exists before milestone/issue creation can proceed
**Depends on**: Phase 2 complete (GitHub config questions exist)
**Success Criteria** (what must be TRUE):
  1. `/kata:starting-projects` checks for existing GitHub remote (`git remote -v`)
  2. If no remote and `github.enabled=true`, prompts to create repo with `gh repo create`
  3. If user declines repo creation, `github.enabled` set to `false` with explanation
  4. GitHub Milestone creation in `/kata:starting-milestones` only runs when remote exists
**Plans:** 2 plans

Plans:
- [x] 02.1-01-PLAN.md — Add remote detection and repo creation to kata-starting-projects
- [x] 02.1-02-PLAN.md — Add remote validation guard to kata-starting-milestones

#### Phase 2.2: Decouple Project Init & Milestone Setup (INSERTED)
**Goal**: Separate project initialization from first milestone creation; establish clear Kata↔GitHub primitive mapping
**Depends on**: Phase 2.1 complete (repo setup exists)
**Success Criteria** (what must be TRUE):
  1. `starting-projects` creates only PROJECT.md + config.json (no ROADMAP, no requirements)
  2. New `add-milestone` skill (renamed from `starting-milestones` for consistency with add-phase, add-todo)
  3. `add-milestone` creates ROADMAP.md with first milestone definition
  4. `add-milestone` creates GitHub Milestone when `github.enabled=true`
  5. Kata↔GitHub mapping documented:
     - Milestone → GitHub Milestone (native GitHub primitive)
     - Phase → GitHub Issue (assigned to milestone)
     - Plan → Checklist items in phase issue body
     - (Future: Sub-issues for plans if gh-subissue extension available)
  6. After project init, next action prompt is `add-milestone`
**Plans:** 4 plans

Plans:
- [x] 02.2-01-PLAN.md — Reduce starting-projects scope to PROJECT.md + config.json
- [x] 02.2-02-PLAN.md — Create kata-adding-milestones skill with full milestone flow
- [x] 02.2-03-PLAN.md — Delete starting-milestones, rename tests
- [x] 02.2-04-PLAN.md — Update documentation and mark todo complete

#### Phase 3: Phase Issues
**Goal**: Phases become GitHub Issues with proper labels, metadata, and milestone assignment
**Depends on**: Phase 2.2 (kata-adding-milestones exists with GitHub Milestone creation)
**Requirements**: GHI-01, GHI-02, GHI-03
**Success Criteria** (what must be TRUE):
  1. Phase issues created with `phase` label when milestone created
  2. Issue body includes phase goal and success criteria from ROADMAP.md
  3. Phase issues assigned to corresponding GitHub Milestone
  4. Issues created respecting `github.issueMode` config setting
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Add phase issue creation to kata-adding-milestones
- [x] 03-02-PLAN.md — Add tests and update integration documentation

#### Phase 4: Plan Sync
**Goal**: Phase issues track plan progress as checklist items that update during execution
**Depends on**: Phase 3 (phase issues exist)
**Requirements**: GHI-04, GHI-05, WFA-02
**Success Criteria** (what must be TRUE):
  1. Phase issue body includes checklist of plans (after `/kata:planning-phases`)
  2. Checklist items checked as each plan completes during `/kata:executing-phases`
  3. Execute-plan workflow conditionally updates GitHub issue
  4. Plan status visible in GitHub without opening Kata
**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — Add GitHub issue update to kata-planning-phases
- [x] 04-02-PLAN.md — Add GitHub issue update to kata-executing-phases
- [x] 04-03-PLAN.md — Tests and documentation

#### Phase 5: PR Integration
**Goal**: Phase execution creates well-formed PRs that link to issues and follow conventions
**Depends on**: Phase 4 (issues exist to link to)
**Requirements**: GHP-01, GHP-02, GHP-03, GHP-04, WFA-03
**Implementation Spec**: `kata/references/planning-config.md#pr_workflow_behavior`
**Success Criteria** (what must be TRUE):
  1. `/kata:executing-phases` creates branch at phase start (when `pr_workflow: true`)
  2. `/kata:executing-phases` opens draft PR after first wave commits
  3. `/kata:executing-phases` marks PR ready when phase complete
  4. PR title follows convention: `v{milestone} Phase {N}: {Phase Name}`
  5. PR body includes phase goal, plans checklist, and "Closes #X" linking to phase issue
  6. `/kata:tracking-progress` shows PR status (draft/ready/merged) when `pr_workflow: true`
**Plans:** 3 plans

Plans:
- [x] 05-01-PLAN.md — Add PR workflow to kata-executing-phases (branch, draft PR, ready)
- [x] 05-02-PLAN.md — Add PR status display to kata-tracking-progress
- [x] 05-03-PLAN.md — Tests and documentation updates

#### Phase 6: PR Review Workflow Skill & Agents
**Goal**: Integrate PR review skill and agents into phase execution workflow
**Depends on**: Phase 5 (PR Integration complete)
**Success Criteria** (what must be TRUE):
  1. PR review command accessible via `/kata:review-pr`
  2. Review agents available for code review workflows
  3. Phase execution offers optional review after `gh pr ready`
  4. README documents PR review workflow usage
**Plans:** 4 plans

Plans:
- [x] 06-01-PLAN.md — Update skill frontmatter and command wrapper
- [x] 06-02-PLAN.md — Add PR review integration to kata-executing-phases
- [x] 06-03-PLAN.md — Add skill test and README documentation
- [x] 06-04-PLAN.md — UAT fix: backlog todo prompt + merge before next phase
- [ ] **Phase 7: Deprecate NPX Support** - Remove NPX distribution, simplify to plugin-only, eliminate build process

#### Phase 7: Deprecate NPX Support
**Goal**: Simplify Kata distribution by removing NPX support and build process, focusing exclusively on Claude Code plugin development
**Depends on**: Phase 6 complete (PR Review Workflow)
**Success Criteria** (what must be TRUE):
  1. NPX-related code removed from codebase (bin/, install.js for npx)
  2. Build process eliminated (no transformation needed for plugin-only)
  3. Source files serve directly as plugin files (no build step)
  4. README updated to remove NPX installation instructions
  5. Package.json cleaned of NPX-specific configuration
  6. CLAUDE.md updated to reflect plugin-only architecture
**Plans:** 0 plans

Plans:
- [ ] TBD (run /kata:plan-phase 7 to break down)

## Progress

| Phase                                    | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 0. Hard Fork & Rebrand                   | v0.1.4    | 5/5            | Complete    | 2026-01-18 |
| 0-2. Skills & Documentation              | v0.1.5    | 30/30          | Complete    | 2026-01-22 |
| 1-3. Claude Code Plugin                  | v1.0.0    | 5/5            | Complete    | 2026-01-23 |
| 2.1 Skill Resource Restructure           | v1.0.8    | 5/5            | Shipped     | 2026-01-24 |
| 2.2 Normalize on Skills                  | v1.0.9    | 3/3            | Complete    | 2026-01-25 |
| 0. Develop Robust Testing Suite          | v1.1.0    | 7/7            | Complete    | 2026-01-25 |
| 1. Audit & Config Foundation             | v1.1.0    | 2/2            | Complete    | 2026-01-25 |
| 2. Onboarding & Milestones               | v1.1.0    | 3/3            | Complete    | 2026-01-25 |
| 2.1 GitHub Repo Setup (INSERTED)         | v1.1.0    | 2/2            | Complete    | 2026-01-26 |
| 2.2 Decouple Init & Milestone (INSERTED) | v1.1.0    | 4/4            | Complete    | 2026-01-26 |
| 3. Phase Issues                          | v1.1.0    | 2/2            | Complete    | 2026-01-26 |
| 4. Plan Sync                             | v1.1.0    | 3/3            | Complete    | 2026-01-26 |
| 5. PR Integration                        | v1.1.0    | 3/3            | Complete    | 2026-01-27 |
| 6. PR Review Workflow Skill              | v1.1.0    | 4/4            | Complete    | 2026-01-27 |
| 7. Deprecate NPX Support                 | v1.1.0    | 0/0            | Not Started | —          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-01-27 — Phase 6 complete (3 plans)*
