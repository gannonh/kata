# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Milestones

- **v0.1.4 Hard Fork & Rebrand** — Phase 0 (shipped 2026-01-18) — [archive](milestones/v0.1.4-ROADMAP.md)
- **v0.1.5 Skills & Documentation** — Phases 0-2 (shipped 2026-01-22) — [archive](milestones/v0.1.5-ROADMAP.md)
- **v1.0.0 Claude Code Plugin** — Phases 1-3 (shipped 2026-01-23)
- **v1.0.8 Plugin Stability** — Phase 2.1 (shipped 2026-01-24) — [archive](milestones/v1.0.8-ROADMAP.md)
- **v1.0.9 Command Consolidation** — Phase 2.2 (complete)
- **v1.1.0 GitHub Integration** — Phases 1-5 (planned)

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

- [ ] **Phase 1: Audit & Config Foundation** - Understand integration points, establish config schema
- [ ] **Phase 2: Onboarding & Milestones** - Config during project-new, GitHub Milestone creation
- [ ] **Phase 3: Phase Issues** - Create GitHub Issues for phases with labels and metadata
- [ ] **Phase 4: Plan Sync** - Checklist items in issues, update as plans complete
- [ ] **Phase 5: PR Integration** - Create PRs at phase completion with auto-linking

## Phase Details

### v1.1.0 GitHub Integration

#### Phase 1: Audit & Config Foundation
**Goal**: Understand where GitHub integration hooks into existing Kata workflows and establish config schema
**Depends on**: v1.0.8 complete (Plugin Stability)
**Requirements**: WFA-01, CFG-01, CFG-02
**Success Criteria** (what must be TRUE):
  1. Integration points documented for milestone-new, phase-execute, execute-plan commands
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
  1. `/kata:project-new` prompts for GitHub integration preferences
  2. Config choices saved to `.planning/config.json` during onboarding
  3. `/kata:milestone-new` creates GitHub Milestone when `github.enabled = true`
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
  1. Phase issue body includes checklist of plans (after `/kata:phase-plan`)
  2. Checklist items checked as each plan completes during `/kata:phase-execute`
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
**Implementation Spec**: `kata/references/planning-config.md#pr_workflow_behavior`
**Success Criteria** (what must be TRUE):
  1. `/kata:phase-execute` creates branch at phase start (when `pr_workflow: true`)
  2. `/kata:phase-execute` opens draft PR at first commit
  3. `/kata:phase-execute` marks PR ready when phase complete
  4. PR title follows convention: `v{milestone} Phase {N}: {Phase Name}`
  5. PR body includes phase goal, completed plans checklist, and "Closes #X" linking to phase issue
  6. `/kata:project-status` shows PR status (draft/ready/merged) when `pr_workflow: true`
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

| Phase                              | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------- | --------- | -------------- | ----------- | ---------- |
| 0. Hard Fork & Rebrand             | v0.1.4    | 5/5            | Complete    | 2026-01-18 |
| 0-2. Skills & Documentation        | v0.1.5    | 30/30          | Complete    | 2026-01-22 |
| 1-3. Claude Code Plugin            | v1.0.0    | 5/5            | Complete    | 2026-01-23 |
| 2.1 Skill Resource Restructure     | v1.0.8    | 5/5            | Shipped     | 2026-01-24 |
| 2.2 Normalize on Skills            | v1.0.9    | 3/3            | Complete    | 2026-01-25 |
| 1. Audit & Config Foundation       | v1.1.0    | 0/?            | Not planned | -          |
| 2. Onboarding & Milestones         | v1.1.0    | 0/?            | Not started | -          |
| 3. Phase Issues                    | v1.1.0    | 0/?            | Not started | -          |
| 4. Plan Sync                       | v1.1.0    | 0/?            | Not started | -          |
| 5. PR Integration                  | v1.1.0    | 0/?            | Not started | -          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-01-25 — Phase 2.2 complete*
