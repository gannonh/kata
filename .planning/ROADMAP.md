# Roadmap: Kata

## Overview

Kata is an independent meta-prompting and context engineering system for Claude Code. The roadmap begins with establishing the independent project identity, then builds complete GitHub Integration (tested in Claude Code), and finally creates a VS Code Adapter for broader adoption.

**Terminology:**
- **Adapter** — Code that makes Kata run in a specific IDE (Claude Code adapter, VS Code adapter)
- **Integration** — Code that connects Kata to an external system (GitHub integration, Linear integration)
- **"Kata for VS Code"** — User-facing name for VS Code adapter

## Phases

**Phase Numbering:**
- Integer phases (0, 1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 0: Hard Fork & Rebrand** - Sever ties from upstream, establish independent Kata identity
- [ ] **Phase 00.1: Antigravity Adapter** (INSERTED) - Adapter layer for Antigravity IDE integration
- [ ] **Phase 1: GitHub Issues Core** - Bidirectional sync and lifecycle tracking
- [ ] **Phase 2: GitHub Issues Polish** - Auto-labeling and issue templates
- [ ] **Phase 3: GitHub PR Creation** - Automated PR workflow with conventions enforced
- [ ] **Phase 4: GitHub PR Collaboration** - Native reviews and team comment response
- [ ] **Phase 5: GitHub CI/CD** - Orchestrate checks and generate changelogs
- [ ] **Phase 6: VS Code Adapter** - Kata for VS Code with full GitHub Integration

## Phase Details

### Phase 0: Hard Fork & Rebrand
**Goal**: Complete separation from upstream with new identity and clean codebase
**Depends on**: Nothing (first phase)
**Requirements**: Remove all upstream references, establish gannonh/kata identity
**Success Criteria** (what must be TRUE):
  1. All references to original project (glittercowboy) removed or updated
  2. Project branding applied consistently (Kata by gannonh)
  3. Git history preserved but upstream remote removed
  4. CLAUDE.md updated to reflect standalone project (no upstream sync)
  5. Package author and repository updated to gannonh
**Plans**: 5 plans

Plans:
- [x] 00-01-PLAN.md — Git configuration and package.json identity
- [x] 00-02-PLAN.md — Core documentation (CLAUDE.md, README.md, install.js)
- [x] 00-03-PLAN.md — Support files (FUNDING, CHANGELOG, assets, scripts)
- [x] 00-04-PLAN.md — Internal references (commands, hooks, planning docs)
- [x] 00-05-PLAN.md — Verification and human approval

### Phase 00.1: Antigravity Adapter (INSERTED)
**Goal:** [Urgent work - to be planned]
**Depends on:** Phase 0
**Plans:** 0 plans

Plans:
- [ ] TBD (run /kata:plan-phase 00.1 to break down)

**Details:**
[To be added during planning]

### Phase 1: GitHub Issues Core
**Goal**: Kata milestones and phases sync bidirectionally with GitHub Issues
**Depends on**: Phase 00.1 (Antigravity Adapter)
**Requirements**: GHISS-01, GHISS-02
**Success Criteria** (what must be TRUE):
  1. Creating a milestone/phase in Kata creates corresponding GitHub issues
  2. Updating a GitHub issue reflects in Kata state
  3. Issue status transitions (New, In Progress, In Review, Done) are tracked
  4. Closing an issue in GitHub marks the phase complete in Kata
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: GitHub Issues Polish
**Goal**: Issues are automatically labeled and templates standardize creation
**Depends on**: Phase 1
**Requirements**: GHISS-03, GHISS-04
**Success Criteria** (what must be TRUE):
  1. New issues automatically receive type labels (bug, feature, task)
  2. Priority and size labels are applied based on requirements metadata
  3. Bug report template captures reproduction steps, expected/actual behavior
  4. Feature request template captures user story, acceptance criteria
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: GitHub PR Creation
**Goal**: Execute-phase automatically creates well-formed PRs with conventions enforced
**Depends on**: Phase 1 (PRs link to issues)
**Requirements**: GHPR-01, GHPR-02, GHPR-03, GHPR-04, GHPR-05
**Success Criteria** (what must be TRUE):
  1. Completing execute-phase automatically creates a PR
  2. Branch names follow conventions (feature/, fix/, doc/, chore/, refactor/)
  3. Commits use conventional format (feat, fix, docs, style, refactor, test, chore)
  4. Draft PRs can be created for early feedback
  5. PR descriptions include linked issues, change summary, and testing steps
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: GitHub PR Collaboration
**Goal**: Claude conducts PR reviews and responds to team feedback
**Depends on**: Phase 3
**Requirements**: GHPR-06, GHPR-07
**Success Criteria** (what must be TRUE):
  1. Claude posts review comments directly to GitHub PR
  2. Reviews consider full Kata context (requirements, plans), not just diff
  3. Claude reads new comments on PRs it created or reviewed
  4. Claude can address team feedback by pushing fixes or responding
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: GitHub CI/CD
**Goal**: CI checks are orchestrated and changelogs are auto-generated
**Depends on**: Phase 3 (PR workflow complete)
**Requirements**: GHCI-01, GHCI-02
**Success Criteria** (what must be TRUE):
  1. Kata waits for CI checks (lint, build, test) to pass before merge
  2. CI failures are surfaced with actionable information
  3. Changelog is auto-generated from merged PRs
  4. Changelog entries include PR title, linked issues, and contributor
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: VS Code Adapter
**Goal**: Kata for VS Code — full workflow with GitHub Integration
**Depends on**: Phases 0-5 (complete GitHub Integration to port)
**Requirements**: VSCODE-01, VSCODE-02, VSCODE-03
**Success Criteria** (what must be TRUE):
  1. All Kata slash commands work in VS Code (new-project, plan-phase, execute-phase, etc.)
  2. Extension installs from VS Code marketplace or VSIX
  3. Team member can install and configure in under 5 minutes
  4. GitHub Integration works identically to Claude Code version
  5. No bash workarounds required for core workflow
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 0 -> 00.1 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Hard Fork & Rebrand | 5/5 | Complete | 2026-01-18 |
| 00.1. Antigravity Adapter | 0/? | Not planned | - |
| 1. GitHub Issues Core | 0/3 | Not started | - |
| 2. GitHub Issues Polish | 0/2 | Not started | - |
| 3. GitHub PR Creation | 0/3 | Not started | - |
| 4. GitHub PR Collaboration | 0/2 | Not started | - |
| 5. GitHub CI/CD | 0/2 | Not started | - |
| 6. VS Code Adapter | 0/3 | Not started | - |


---
*Roadmap created: 2026-01-17*
*Last updated: 2026-01-18*
