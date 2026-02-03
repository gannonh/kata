# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Current Milestone

### v1.4.1 Issue Execution (In Progress)

**Goal:** Complete the issue lifecycle with execution workflows and PR integration.

#### Phase 1: PR → Issue Closure ✓

**Goal:** All PR-creating workflows properly close their associated GitHub Issues.
**Requirements:** CLOSE-01, CLOSE-02, CLOSE-03
**Plans:** 1/1 complete

Plans:
- [x] 01-01-PLAN.md — Verify execute-phase, implement complete-milestone closure, document pattern

**Success Criteria** (what must be TRUE):
1. ✓ Phase execution PRs include `Closes #X` for the phase GitHub Issue
2. ✓ Milestone completion PRs include `Closes #X` for all completed phase issues
3. ✓ Issue execution PRs include `Closes #X` for the source issue

#### Phase 2: Issue Execution Workflow ✓

**Goal:** Structured execution path when working on an issue.
**Requirements:** EXEC-01, EXEC-02, EXEC-03
**Dependencies:** Phase 1
**Plans:** 2/2 complete

Plans:
- [x] 02-01-PLAN.md — Mode selection + quick task enhancement (EXEC-01, EXEC-02)
- [x] 02-02-PLAN.md — Planned mode routing (EXEC-03)

**Success Criteria** (what must be TRUE):
1. ✓ "Work on it now" offers execution mode selection (quick task vs planned)
2. ✓ Quick task execution creates plan, executes with commits, creates PR with `Closes #X`
3. ✓ Planned execution links issue to a new or existing phase

#### Phase 3: Issue → Roadmap Integration ✓

**Goal:** Pull backlog issues into milestones and phases.
**Requirements:** INTEG-01, INTEG-02, INTEG-03
**Dependencies:** Phase 2
**Plans:** 2/2 complete

Plans:
- [x] 03-01-PLAN.md — Issue selection in add-milestone + complete phase linkage (INTEG-01, INTEG-02)
- [x] 03-02-PLAN.md — source_issue traceability in plans (INTEG-03)

**Success Criteria** (what must be TRUE):
1. ✓ User can pull backlog issues into a milestone's scope
2. ✓ User can pull issues into a phase (becomes a task/plan)
3. ✓ Phase plans can reference their source issue number for traceability

#### Phase 4: Wire plan-phase to Issue Context

**Goal:** Connect plan-phase to STATE.md issue sections so source_issue is set in generated plans.
**Requirements:** INTEG-03 (gap closure)
**Dependencies:** Phase 3
**Gap Closure:** Closes gaps from v1.4.1 audit
**Plans:** 0/0 complete

Plans:
- [ ] 04-01-PLAN.md — Wire plan-phase to STATE.md issue sections

**Success Criteria** (what must be TRUE):
1. plan-phase reads STATE.md "Pending Issues" section
2. plan-phase reads STATE.md "Milestone Scope Issues" section
3. Issue context passed to kata-planner when linked issues exist
4. Generated PLAN.md files include `source_issue` when created from linked issues

---

## Planned Milestones

### v1.5.0 Phase Management (Planned)

**Goal:** Improved phase organization, movement, and roadmap visibility.

#### Phase 1: Phase Organization

**Goal:** Organize phase artifacts into state directories with completion validation.
**Requirements:** PHASE-01, PHASE-05

**Success Criteria** (what must be TRUE):
1. Phase directories are organized under `pending/`, `active/`, `completed/` subdirectories
2. Phase completion validates PLAN.md and SUMMARY.md existence
3. Non-gap phases require VERIFICATION.md for completion validation

#### Phase 2: Phase Movement

**Goal:** Enable flexible phase reorganization within and across milestones.
**Requirements:** PHASE-02, PHASE-03, PHASE-04
**Dependencies:** Phase 1

**Success Criteria** (what must be TRUE):
1. User can move a phase to a different milestone via `/kata:move-phase`
2. User can reorder phases within a milestone with automatic renumbering
3. Each milestone starts phase numbering at 1 (not cumulative across milestones)

#### Phase 3: Roadmap Enhancements

**Goal:** Improve roadmap visibility and readability.
**Requirements:** ROAD-01, ROAD-02

**Success Criteria** (what must be TRUE):
1. ROADMAP.md displays future planned milestones (not just current)
2. Phase and milestone hierarchy is visually clear with consistent formatting
3. Progress indicators are easily scannable

---

## Completed Milestones

<details>
<summary>v1.4.0 GitHub Issue Sync — SHIPPED 2026-02-01</summary>

**Goal:** Unified issue model and bidirectional GitHub Issue integration.

- [x] Phase 1: Issue Model Foundation (6/6 plans) — completed 2026-01-31
- [x] Phase 2: GitHub Issue Sync (5/5 plans) — completed 2026-02-01

[Full archive](milestones/v1.4.0-ROADMAP.md)

</details>

<details>
<summary>v1.3.3 Internal Documentation — SHIPPED 2026-01-29</summary>

**Goal:** Create internal documentation and terminology reference for Kata.

- [x] Phase 1: Internal Documentation (4/4 plans) — completed 2026-01-29

[Full archive](milestones/v1.3.3-ROADMAP.md)

</details>

<details>
<summary>v1.3.0 Release Automation — SHIPPED 2026-01-28</summary>

**Goal:** Harden CI validation and automate the release pipeline.

- [x] Phase 0: Foundation & CI Hardening (2/2 plans) — completed 2026-01-28
- [x] Phase 1: Release Automation (2/2 plans) — completed 2026-01-28

</details>

<details>
<summary>v1.1.0 GitHub Integration — SHIPPED 2026-01-27</summary>

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

</details>

<details>
<summary>v1.0.9 Command Consolidation — COMPLETE 2026-01-25</summary>

- [x] Phase 2.2: Normalize on Skills (3/3 plans) — completed 2026-01-25

</details>

<details>
<summary>v1.0.8 Plugin Stability — SHIPPED 2026-01-24</summary>

- [x] Phase 2.1: Skill Resource Restructure (5/5 plans) — completed 2026-01-24

[Full archive](milestones/v1.0.8-ROADMAP.md)

</details>

<details>
<summary>v1.0.0 Claude Code Plugin — SHIPPED 2026-01-23</summary>

- [x] Phase 1: Plugin Structure & Validation (1/1 plans) — completed 2026-01-22
- [x] Phase 1.1: Document PR Workflow Behavior (1/1 plans) — completed 2026-01-22
- [x] Phase 2: Marketplace Distribution (2/2 plans) — completed 2026-01-23
- [x] Phase 3: Documentation (1/1 plans) — completed 2026-01-23

**Patch releases:** v1.0.1-v1.0.5 (plugin distribution fixes)

</details>

<details>
<summary>v0.1.5 Skills & Documentation — SHIPPED 2026-01-22</summary>

- [x] Phase 0: Convert Commands to Skills (12/12 plans) — completed 2026-01-20
- [x] Phase 1: Migrate Todo Commands to Kata Skill (3/3 plans) — completed 2026-01-20
- [x] Phase 1.1: Testing & Evals Harness (2/2 plans) — completed 2026-01-20
- [x] Phase 1.2: Skill Tests (4/4 plans) — completed 2026-01-20
- [x] Phase 1.3: Discuss Phase Skill (2/2 plans) — completed 2026-01-20
- [x] Phase 2: Create Kata Slash Commands (7/7 plans) — completed 2026-01-21

[Full archive](milestones/v0.1.5-ROADMAP.md)

</details>

<details>
<summary>v0.1.4 Hard Fork & Rebrand — SHIPPED 2026-01-18</summary>

- [x] Phase 0: Hard Fork & Rebrand (5/5 plans) — completed 2026-01-18

[Full archive](milestones/v0.1.4-ROADMAP.md)

</details>

---

## Progress Summary

| Milestone | Phases | Plans | Status   | Shipped    |
| --------- | ------ | ----- | -------- | ---------- |
| v0.1.4    | 1      | 5     | Shipped  | 2026-01-18 |
| v0.1.5    | 6      | 30    | Shipped  | 2026-01-22 |
| v1.0.0    | 4      | 5     | Shipped  | 2026-01-23 |
| v1.0.8    | 1      | 5     | Shipped  | 2026-01-24 |
| v1.0.9    | 1      | 3     | Complete | 2026-01-25 |
| v1.1.0    | 10     | 33    | Shipped  | 2026-01-27 |
| v1.3.0    | 2      | 4     | Shipped  | 2026-01-28 |
| v1.3.3    | 1      | 4     | Shipped  | 2026-01-29 |
| v1.4.0    | 2      | 11    | Shipped  | 2026-02-01 |
| v1.4.1    | 4      | 6     | Current  | —          |
| v1.5.0    | 3      | TBD   | Planned  | —          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-02-02 — Phase 4 added (gap closure)*
