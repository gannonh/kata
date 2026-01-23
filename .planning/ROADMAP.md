# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Milestones

- **v0.1.4 Hard Fork & Rebrand** — Phase 0 (shipped 2026-01-18) — [archive](milestones/v0.1.4-ROADMAP.md)
- **v0.1.5 Skills & Documentation** — Phases 0-2 (shipped 2026-01-22) — [archive](milestones/v0.1.5-ROADMAP.md)
- **v0.1.9 Claude Code Plugin** — Phases 1-3 (in progress)
- **v0.1.10 GitHub Integration** — Phases 1-5 (planned)

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

### v0.1.9 Claude Code Plugin (In Progress)

- [x] **Phase 1: Plugin Structure & Validation** - Create plugin manifest and directory structure, validate locally
- [x] **Phase 1.1: Document PR Workflow Behavior** (INSERTED) - Document pr_workflow config behavior in planning-config.md
- [ ] **Phase 2: Marketplace Distribution** - Publish to marketplace repository, verify installation
- [ ] **Phase 3: Documentation** - Installation instructions and usage guide

### v0.1.10 GitHub Integration (Planned)

- [ ] **Phase 1: Audit & Config Foundation** - Understand integration points, establish config schema
- [ ] **Phase 2: Onboarding & Milestones** - Config during project-new, GitHub Milestone creation
- [ ] **Phase 3: Phase Issues** - Create GitHub Issues for phases with labels and metadata
- [ ] **Phase 4: Plan Sync** - Checklist items in issues, update as plans complete
- [ ] **Phase 5: PR Integration** - Create PRs at phase completion with auto-linking

## Phase Details

### v0.1.9 Claude Code Plugin

#### Phase 1: Plugin Structure & Validation
**Goal**: Kata has valid plugin structure that passes Claude Code validation and works locally
**Depends on**: v0.1.5 complete (Skills & Documentation)
**Requirements**: PLG-01, PLG-02, PLG-03, PLG-04, PLG-05, VAL-01, VAL-02
**Success Criteria** (what must be TRUE):
  1. `.claude-plugin/plugin.json` exists with name, version, description, author fields
  2. `commands/kata/` directory contains all 25 Kata slash commands
  3. `agents/` directory contains all Kata sub-agents (kata-*.md files)
  4. `skills/kata-*/SKILL.md` structure exists for all 14 skills
  5. `hooks/hooks.json` exists with Kata hook definitions
  6. `claude plugin validate .` passes with no errors
  7. `claude --plugin-dir ./` loads plugin and shows `/kata:*` commands
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md — Create plugin manifest, hooks.json, and validate ✓

#### Phase 1.1: Document PR Workflow Behavior (INSERTED)
**Goal**: Complete documentation of pr_workflow config behavior including branch naming, PR-per-phase, and release-milestone relationship
**Depends on**: Phase 1 (plugin structure exists)
**Requirements**: N/A (urgent insertion for product clarity)
**Success Criteria** (what must be TRUE):
  1. `kata/references/planning-config.md` documents complete pr_workflow behavior
  2. Branch naming convention documented: `feat/v{milestone}-{phase}-{name}`
  3. PR-per-phase workflow documented (one PR per phase, merged to main)
  4. Release = milestone relationship documented (releases only at milestone completion)
  5. Workflow timing documented (when to create branch, open PR, merge)
**Plans**: 1 plan

Plans:
- [x] 01.1-01-PLAN.md — Document complete pr_workflow behavior in planning-config.md ✓

#### Phase 2: Marketplace Distribution
**Goal**: Kata installable from marketplace repository via standard plugin install command
**Depends on**: Phase 1 (plugin validates locally)
**Requirements**: DST-01, DST-02, DST-03, DST-04, VAL-03, VAL-04
**Success Criteria** (what must be TRUE):
  1. GitHub repository `claude-code-plugins` exists with marketplace structure
  2. `marketplace.json` contains Kata plugin entry with source URL
  3. `/plugin install kata@claude-code-plugins` installs Kata successfully
  4. All `/kata:*` commands accessible after marketplace installation
  5. All Kata skills respond to natural language after marketplace installation
  6. Plugin version shows v0.1.9 via semantic versioning
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Create marketplace infrastructure (version bump, claude-code-plugins repo, marketplace.json)
- [ ] 02-02-PLAN.md — Verify marketplace installation end-to-end

#### Phase 3: Documentation
**Goal**: Users can install and use Kata plugin via documented instructions
**Depends on**: Phase 2 (marketplace installation works)
**Requirements**: DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. README includes installation instructions for marketplace install
  2. README includes local development instructions (`--plugin-dir`)
  3. Usage documented: how to start a project, common commands, skill invocation
**Plans**: TBD

Plans:
- [ ] 03-01: TBD (run /kata:phase-plan to break down)

### v0.1.10 GitHub Integration

#### Phase 1: Audit & Config Foundation
**Goal**: Understand where GitHub integration hooks into existing Kata workflows and establish config schema
**Depends on**: v0.1.9 complete (Plugin Distribution)
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

| Phase                             | Milestone | Plans Complete | Status      | Completed  |
| --------------------------------- | --------- | -------------- | ----------- | ---------- |
| 0. Hard Fork & Rebrand            | v0.1.4    | 5/5            | Complete    | 2026-01-18 |
| 0-2. Skills & Documentation       | v0.1.5    | 30/30          | Complete    | 2026-01-22 |
| 1. Plugin Structure & Validation  | v0.1.9    | 1/1            | Complete    | 2026-01-22 |
| 1.1 Document PR Workflow (INSERT) | v0.1.9    | 1/1            | Complete    | 2026-01-22 |
| 2. Marketplace Distribution       | v0.1.9    | 0/2            | Planned     | -          |
| 3. Documentation                  | v0.1.9    | 0/?            | Not started | -          |
| 1. Audit & Config Foundation      | v0.1.10   | 0/?            | Not planned | -          |
| 2. Onboarding & Milestones        | v0.1.10   | 0/?            | Not started | -          |
| 3. Phase Issues                   | v0.1.10   | 0/?            | Not started | -          |
| 4. Plan Sync                      | v0.1.10   | 0/?            | Not started | -          |
| 5. PR Integration                 | v0.1.10   | 0/?            | Not started | -          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-01-22 — Phase 2 planned (2 plans)*
