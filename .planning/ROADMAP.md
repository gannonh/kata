# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Current Milestone

### v1.4.0 Issue & Phase Management (In Progress)

**Goal:** Unified issue model and improved phase management.

#### Phase 1: Issue Model Foundation

**Goal:** Establish "issues" as Kata's vocabulary with local storage and unified display.
**Requirements:** ISS-01, ISS-03, ISS-04
**Plans:** 6 plans

- [x] 01-01-PLAN.md — Rename adding-todos to adding-issues
- [x] 01-02-PLAN.md — Rename checking-todos to checking-issues
- [x] 01-03-PLAN.md — Add auto-migration logic
- [x] 01-04-PLAN.md — Update secondary skill references
- [x] 01-05-PLAN.md — Deprecation handling
- [x] 01-06-PLAN.md — STATE.md integration verification

**Success Criteria** (what must be TRUE):
1. All Kata skills, agents, and UI messages use "issues" instead of "todos"
2. User can create issues that persist to `.planning/issues/` in non-GitHub projects
3. `/kata:check-issues` displays all issues with consistent format regardless of source

**Status:** COMPLETE

#### Phase 2: GitHub Issue Sync

**Goal:** Integrate Kata issues with GitHub Issues for bidirectional workflow.
**Requirements:** ISS-02, PULL-01, PULL-02
**Dependencies:** Phase 1
**Plans:** 3 plans

- [x] 02-01-PLAN.md — Add GitHub Issue sync to add-issue skill
- [x] 02-02-PLAN.md — Add GitHub Issue pull to check-issues skill
- [x] 02-03-PLAN.md — Add execution linking (auto-close on completion)

**Success Criteria** (what must be TRUE):
1. Issues created in Kata appear as GitHub Issues with `backlog` label when `github.enabled=true`
2. User can pull existing GitHub Issues into Kata workflow via filtering
3. Kata execution can reference and auto-update external GitHub Issues on completion

**Status:** COMPLETE

#### Phase 3: Phase Organization

**Goal:** Organize phase artifacts into state directories with completion validation.
**Requirements:** PHASE-01, PHASE-05

**Success Criteria** (what must be TRUE):
1. Phase directories are organized under `pending/`, `active/`, `completed/` subdirectories
2. Phase completion validates PLAN.md and SUMMARY.md existence
3. Non-gap phases require VERIFICATION.md for completion validation

#### Phase 4: Phase Movement

**Goal:** Enable flexible phase reorganization within and across milestones.
**Requirements:** PHASE-02, PHASE-03, PHASE-04
**Dependencies:** Phase 3

**Success Criteria** (what must be TRUE):
1. User can move a phase to a different milestone via `/kata:move-phase`
2. User can reorder phases within a milestone with automatic renumbering
3. Each milestone starts phase numbering at 1 (not cumulative across milestones)

#### Phase 5: Roadmap Enhancements

**Goal:** Improve roadmap visibility and readability.
**Requirements:** ROAD-01, ROAD-02

**Success Criteria** (what must be TRUE):
1. ROADMAP.md displays future planned milestones (not just current)
2. Phase and milestone hierarchy is visually clear with consistent formatting
3. Progress indicators are easily scannable

---

## Completed Milestones

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
| v1.4.0    | 5      | TBD   | Current  | —          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-02-01 — Phase 2 complete (3 plans)*
