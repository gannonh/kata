# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Milestones

- ✅ **v1.5.0 Phase Management** — Phases 1-3 (shipped 2026-02-04)
- ✅ **v1.4.1 Issue Execution** — Phases 1-4 (shipped 2026-02-03)
- ✅ **v1.6.0 Skills-Native Subagents** — Phases 30-34 (shipped 2026-02-06)
- ✅ **v1.7.0 Brainstorm Integration** — Phases 35-36 (shipped 2026-02-07)
- ✅ **v1.8.0 Adaptive Workflows** — Phases 37-39 (shipped 2026-02-08)
- ✅ **v1.9.0 Template Overrides (Universal)** — Phases 40-43 (shipped 2026-02-08)
- 🔄 **v1.10.0 Git Worktree Support** — Phases 44-47 (in progress)

## Current Milestone: v1.10.0 Git Worktree Support

**Goal:** Add optional git worktree support so each plan agent during phase execution gets its own isolated worktree and branch, replacing the shared-directory model.

#### Phase 44: Config Foundation

**Goal:** Establish worktree configuration infrastructure and onboarding integration.

**Requirements:** CFG-01, CFG-02, CFG-03, CFG-04, CFG-05

**Success Criteria** (what must be TRUE):
1. Users can enable worktrees via `kata-configure-settings` and see worktree config appear in `.planning/config.json`
2. `read-config.sh` successfully reads nested config keys (e.g., `worktree.enabled` returns "true")
3. `setup-worktrees.sh` converts standard repo to bare + worktree layout without data loss
4. New projects ask about worktrees during onboarding when PR workflow enabled
5. Existing projects can toggle worktree mode retroactively

#### Phase 45: Worktree Scripting

**Goal:** Create core worktree lifecycle management tooling.

**Requirements:** EXEC-01, HOUSE-01

**Success Criteria** (what must be TRUE):
1. `manage-worktree.sh create` spawns new worktree with branch for a plan
2. `manage-worktree.sh merge` integrates worktree branch back to main and removes worktree
3. `manage-worktree.sh list` shows active worktrees with plan associations
4. Inline scripts from `kata-execute-phase` extracted to standalone files

#### Phase 46: Execution Integration

**Goal:** Wire worktree lifecycle into phase execution workflow.

**Requirements:** EXEC-02, EXEC-03, EXEC-04

**Success Criteria** (what must be TRUE):
1. When worktrees enabled, `kata-execute-phase` creates isolated worktree per wave
2. Plan executor agents receive `<working_directory>` pointing to worktree path
3. After wave completion, worktree merges back to main and cleans up automatically
4. Documentation explains worktree lifecycle (create → execute → merge → cleanup)

#### Phase 47: Downstream & Release

**Goal:** Update related skills and improve milestone completion workflow.

**Requirements:** DOWN-01, DOWN-02, HOUSE-02

**Success Criteria** (what must be TRUE):
1. `git-integration.md` documents two-tier branch flow (main + release vs worktree + plan branches)
2. `kata-complete-milestone` creates release branch respecting worktree configuration
3. Users completing milestone see release task options (verify/fix from GitHub #83)

- [x] Phase 44: Config Foundation (2/2 plans) — completed 2026-02-09
  - [x] 44-01-PLAN.md — Config schema + reader script (CFG-01, CFG-02)
  - [x] 44-02-PLAN.md — Setup script + skill integration (CFG-03, CFG-04, CFG-05)
- [x] Phase 45: Worktree Scripting (2/2 plans) — completed 2026-02-09
  - [x] 45-01-PLAN.md — manage-worktree.sh create/merge/list (EXEC-01)
  - [x] 45-02-PLAN.md — Extract inline scripts to standalone files (HOUSE-01)
- [x] Phase 46: Execution Integration (2/2 plans) — completed 2026-02-10
  - [x] 46-01-PLAN.md — Worktree awareness in reference docs (EXEC-03, EXEC-04)
  - [x] 46-02-PLAN.md — Wire worktree lifecycle into SKILL.md orchestrator (EXEC-02)
- [ ] Phase 47: Downstream & Release (0/0 plans)

## Completed Milestones

<details>
<summary>✅ v1.9.0 Template Overrides Universal (Phases 40-43) — SHIPPED 2026-02-08</summary>

**Goal:** Fix template override infrastructure to work universally for all users (plugin + skills-only), migrate validation from hooks into skills, create template customization UI, and document the feature.

- [x] Phase 40: Template Resolution (1/1 plans) — completed 2026-02-08
- [x] Phase 41: Validation Migration (2/2 plans) — completed 2026-02-08
- [x] Phase 42: Template Customization Skill (1/1 plans) — completed 2026-02-08
- [x] Phase 43: Documentation (1/1 plans) — completed 2026-02-08

[Full archive](milestones/v1.9.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.8.0 Adaptive Workflows (Phases 37-39) — SHIPPED 2026-02-08</summary>

**Goal:** Enable project-specific customization of Kata workflows through preferences infrastructure, template overrides, and config-driven workflow variants.

- [x] Phase 37: Preferences Infrastructure & Progressive Capture (2/2 plans) — completed 2026-02-07
- [x] Phase 38: Template Overrides (2/2 plans) — completed 2026-02-08
- [x] Phase 39: Config Workflow Variants & Settings (3/3 plans) — completed 2026-02-08

[Full archive](milestones/v1.8.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.7.0 Brainstorm Integration (Phases 35-36) — SHIPPED 2026-02-07</summary>

**Goal:** Ship the kata-brainstorm skill and integrate structured brainstorming as an optional step across Kata workflows.

- [x] Phase 35: Ship Brainstorm Skill (2/2 plans) — completed 2026-02-07
- [x] Phase 36: Workflow Integration (3/3 plans) — completed 2026-02-07

[Full archive](milestones/v1.7.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.6.0 Skills-Native Subagents (Phases 30-34) — SHIPPED 2026-02-06</summary>

**Goal:** Deprecate custom subagent types to make Kata portable across Agent Skills-compatible platforms.

- [x] Phase 30: Proof of Concept (3/3 plans) — completed 2026-02-05
- [x] Phase 31: Full Conversion (7/7 plans) — completed 2026-02-05
- [x] Phase 32: Phase lookup ignores milestone scope causing collisions (3/3 plans) — completed 2026-02-06
- [x] Phase 33: skills.sh Distribution Channel (2/2 plans) — completed 2026-02-06
- [x] Phase 34: Cleanup (2/2 plans) — completed 2026-02-06

[Full archive](milestones/v1.6.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.5.0 Phase Management (Phases 1-3) — SHIPPED 2026-02-04</summary>

**Goal:** Improved phase organization, movement, and roadmap visibility.

- [x] Phase 1: Phase Organization (2/2 plans) — completed 2026-02-03
- [x] Phase 2: Phase Movement (2/2 plans) — completed 2026-02-03
- [x] Phase 3: Roadmap Enhancements (2/2 plans) — completed 2026-02-04

[Full archive](milestones/v1.5.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.4.1 Issue Execution (Phases 1-4) — SHIPPED 2026-02-03</summary>

**Goal:** Complete the issue lifecycle with execution workflows and PR integration.

- [x] Phase 1: PR → Issue Closure (1/1 plans) — completed 2026-02-01
- [x] Phase 2: Issue Execution Workflow (2/2 plans) — completed 2026-02-02
- [x] Phase 3: Issue → Roadmap Integration (2/2 plans) — completed 2026-02-02
- [x] Phase 4: Wire plan-phase Issue Context (1/1 plans) — completed 2026-02-02

[Full archive](milestones/v1.4.1-ROADMAP.md)

</details>

<details>
<summary>✅ v1.4.0 GitHub Issue Sync — SHIPPED 2026-02-01</summary>

**Goal:** Unified issue model and bidirectional GitHub Issue integration.

- [x] Phase 1: Issue Model Foundation (6/6 plans) — completed 2026-01-31
- [x] Phase 2: GitHub Issue Sync (5/5 plans) — completed 2026-02-01

[Full archive](milestones/v1.4.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.3.3 Internal Documentation — SHIPPED 2026-01-29</summary>

**Goal:** Create internal documentation and terminology reference for Kata.

- [x] Phase 1: Internal Documentation (4/4 plans) — completed 2026-01-29

[Full archive](milestones/v1.3.3-ROADMAP.md)

</details>

<details>
<summary>✅ v1.3.0 Release Automation — SHIPPED 2026-01-28</summary>

**Goal:** Harden CI validation and automate the release pipeline.

- [x] Phase 0: Foundation & CI Hardening (2/2 plans) — completed 2026-01-28
- [x] Phase 1: Release Automation (2/2 plans) — completed 2026-01-28

[Full archive](milestones/v1.3.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1.0 GitHub Integration — SHIPPED 2026-01-27</summary>

**Goal:** GitHub integration with issue sync, PR workflow, and review automation.

- [x] Phase 0: Develop Robust Testing Suite (7/7 plans) — completed 2026-01-25
- [x] Phase 1: Audit & Config Foundation (2/2 plans) — completed 2026-01-25
- [x] Phase 2: Onboarding & Milestones (3/3 plans) — completed 2026-01-25
- [x] Phase 2.1: GitHub Repo Setup (2/2 plans) — completed 2026-01-26
- [x] Phase 2.2: Decouple Project Init & Milestone Setup (4/4 plans) — completed 2026-01-26
- [x] Phase 3: Phase Issues (2/2 plans) — completed 2026-01-26
- [x] Phase 4: Plan Sync (3/3 plans) — completed 2026-01-26
- [x] Phase 5: PR Integration (3/3 plans) — completed 2026-01-27
- [x] Phase 6: PR Review Workflow Skill & Agents (4/4 plans) — completed 2026-01-27
- [x] Phase 7: Deprecate NPX Support (6/6 plans) — completed 2026-01-27

[Full archive](milestones/v1.1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.0.9 Command Consolidation — SHIPPED 2026-01-25</summary>

**Goal:** Normalize all entry points onto the skills system.

- [x] Phase 2.2: Normalize on Skills (3/3 plans) — completed 2026-01-25

[Full archive](milestones/v1.0.9-ROADMAP.md)

</details>

<details>
<summary>✅ v1.0.8 Plugin Stability — SHIPPED 2026-01-24</summary>

**Goal:** Restructure skill resources for plugin stability.

- [x] Phase 2.1: Skill Resource Restructure (5/5 plans) — completed 2026-01-24

[Full archive](milestones/v1.0.8-ROADMAP.md)

</details>

<details>
<summary>✅ v1.0.0 Claude Code Plugin — SHIPPED 2026-01-23</summary>

**Goal:** Package Kata as a Claude Code plugin for marketplace distribution.

- [x] Phase 1: Plugin Structure & Validation (1/1 plans) — completed 2026-01-22
- [x] Phase 1.1: Document PR Workflow Behavior (1/1 plans) — completed 2026-01-22
- [x] Phase 2: Marketplace Distribution (2/2 plans) — completed 2026-01-23
- [x] Phase 3: Documentation (1/1 plans) — completed 2026-01-23

**Patch releases:** v1.0.1-v1.0.5 (plugin distribution fixes)

[Full archive](milestones/v1.0.0-ROADMAP.md)

</details>

<details>
<summary>✅ v0.1.5 Skills & Documentation — SHIPPED 2026-01-22</summary>

**Goal:** Convert commands to skills and establish documentation patterns.

- [x] Phase 0: Convert Commands to Skills (12/12 plans) — completed 2026-01-20
- [x] Phase 1: Migrate Todo Commands to Kata Skill (3/3 plans) — completed 2026-01-20
- [x] Phase 1.1: Testing & Evals Harness (2/2 plans) — completed 2026-01-20
- [x] Phase 1.2: Skill Tests (4/4 plans) — completed 2026-01-20
- [x] Phase 1.3: Discuss Phase Skill (2/2 plans) — completed 2026-01-20
- [x] Phase 2: Create Kata Slash Commands (7/7 plans) — completed 2026-01-21

[Full archive](milestones/v0.1.5-ROADMAP.md)

</details>

<details>
<summary>✅ v0.1.4 Hard Fork & Rebrand — SHIPPED 2026-01-18</summary>

**Goal:** Fork from upstream and rebrand as Kata.

- [x] Phase 0: Hard Fork & Rebrand (5/5 plans) — completed 2026-01-18

[Full archive](milestones/v0.1.4-ROADMAP.md)

</details>

---

## Progress Summary

| Milestone | Phases | Plans | Status      | Shipped    |
| --------- | ------ | ----- | ----------- | ---------- |
| v0.1.4    | 1      | 5     | Shipped     | 2026-01-18 |
| v0.1.5    | 6      | 30    | Shipped     | 2026-01-22 |
| v1.0.0    | 4      | 5     | Shipped     | 2026-01-23 |
| v1.0.8    | 1      | 5     | Shipped     | 2026-01-24 |
| v1.0.9    | 1      | 3     | Shipped     | 2026-01-25 |
| v1.1.0    | 10     | 33    | Shipped     | 2026-01-27 |
| v1.3.0    | 2      | 4     | Shipped     | 2026-01-28 |
| v1.3.3    | 1      | 4     | Shipped     | 2026-01-29 |
| v1.4.0    | 2      | 11    | Shipped     | 2026-02-01 |
| v1.4.1    | 4      | 6     | Shipped     | 2026-02-03 |
| v1.5.0    | 3      | 6     | Shipped     | 2026-02-04 |
| v1.6.0    | 5      | 17    | Shipped     | 2026-02-06 |
| v1.7.0    | 2      | 5     | Shipped     | 2026-02-07 |
| v1.8.0    | 3      | 7     | Shipped     | 2026-02-08 |
| v1.9.0    | 4      | 5     | Shipped     | 2026-02-08 |
| v1.10.0   | 4      | 6     | In Progress | —          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-02-10 — Phase 46 Execution Integration complete (2/2 plans verified)*
