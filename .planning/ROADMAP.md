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
- ✅ **v1.10.0 Git Worktree Support** — Phases 44-48 (shipped 2026-02-12)
- ✅ **v1.11.0 Phase-Level Worktrees** — Phases 49-53 (shipped 2026-02-14)
- 🔄 **v1.12.0 Codebase Intelligence** — Phases 54-59 (in progress)

## Current Milestone: v1.12.0 Codebase Intelligence

Automatic codebase knowledge capture, storage, and consumption across all Kata agent workflows. Agents receive architecture, conventions, and dependency knowledge in their context windows.

#### Phase 54: Knowledge Architecture & Consumption

**Goal:** Agents receive codebase knowledge when spawned. Storage schema exists. Summary.md is the compressed entry point.

**Demo:** Run `/kata-plan-phase` on a project with `.planning/intel/` populated. The planner agent's context includes architecture summary, naming conventions, and directory structure. An executor agent for a UI task gets component conventions; an API task gets integration patterns.

**Requirements:** ARCH-01, ARCH-02, INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05, INTEG-06

**Plans:** 4 plans

Plans:
- [x] 54-01-PLAN.md — generate-intel.js script + summary template + kata-map-codebase wiring — completed 2026-02-15
- [x] 54-02-PLAN.md — planner integration (read + inject intel summary) — completed 2026-02-15
- [x] 54-03-PLAN.md — executor integration (read + inject intel summary) — completed 2026-02-15
- [x] 54-04-PLAN.md — verifier integration + KATA-STYLE.md documentation — completed 2026-02-15

**Success Criteria:**
- `.planning/intel/` contains index.json, conventions.json, summary.md with documented schemas
- Planner agents receive summary.md content in spawned context
- Executor agents receive conventions relevant to their task type
- Verifier agents receive conventions for compliance checking
- summary.md auto-generates from index.json + conventions.json (~80-150 lines)

#### Phase 55: Codebase Capture & Indexing

**Goal:** System scans code files, extracts exports/imports, detects naming conventions and directory patterns, builds dependency graph. All artifacts include freshness metadata.

**Demo:** Execute a plan that creates 3 new TypeScript files. After completion, `index.json` contains those files' exports/imports. `conventions.json` shows detected camelCase naming (confidence 85%). Directory purposes map `components/` and `hooks/`. Each entry has a last-indexed commit hash.

**Requirements:** CAP-02, CAP-03, CAP-04, CAP-05, MAINT-04

**Success Criteria:**
- In-skill step after plan completion scans changed files and updates index.json
- Naming convention detection fires at 5+ exports with 70%+ match rate
- Directory purposes and file suffix patterns detected from codebase structure
- index.json contains import/export dependency graph per file
- All intel artifacts include generation timestamp, confidence scores, and commit hash

**Plans:** 3 plans

Plans:
- [x] 55-01-PLAN.md — scan-codebase.cjs script (import/export extraction, naming detection, directory mapping, freshness metadata) — completed 2026-02-16
- [x] 55-02-PLAN.md — tests and fixtures for scan-codebase.cjs (unit + integration tests) — completed 2026-02-16
- [x] 55-03-PLAN.md — generate-intel.js freshness metadata + kata-map-codebase and kata-execute-phase integration — completed 2026-02-16

Plans:
- [x] Phase 56: Greenfield Integration (2/2 plans) — completed 2026-02-16

Plans:
- [x] Phase 57: Knowledge Maintenance (3/3 plans) — completed 2026-02-16 (gaps closed)

- [x] Phase 58: Brownfield Doc Auto-Refresh (4/4 plans) — completed 2026-02-17
- [x] Phase 59: Brownfield Intel Pipeline Gap Closure (3/3 plans) — completed 2026-02-18

## Completed Milestones

<details>
<summary>✅ v1.11.0 Phase-Level Worktrees (Phases 49-53) — SHIPPED 2026-02-14</summary>

**Goal:** Refactor worktree system so phase execution creates phase-level worktrees instead of switching `main/` off the main branch. `main/` stays on `main` permanently.

- [x] Phase 49: Script Layer — Phase Worktree Creation and Merge Target (2/2 plans) — completed 2026-02-13
- [x] Phase 50: Orchestrator Integration — Phase Worktree Lifecycle in Execution (2/2 plans) — completed 2026-02-13
- [x] Phase 51: Workspace Worktree Architecture (3/3 plans) — completed 2026-02-14
- [x] Phase 52: Documentation — Updated Worktree Structure Docs (1/1 plans) — completed 2026-02-14
- [x] Phase 53: Worktree-Safe PR Merge (2/2 plans) — completed 2026-02-14

[Full archive](milestones/v1.11.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.10.0 Git Worktree Support (Phases 44-48) — SHIPPED 2026-02-12</summary>

**Goal:** Optional git worktree support for plan-level agent isolation during phase execution.

- [x] Phase 44: Config Foundation (2/2 plans) — completed 2026-02-09
- [x] Phase 45: Worktree Scripting (2/2 plans) — completed 2026-02-09
- [x] Phase 46: Execution Integration (2/2 plans) — completed 2026-02-10
- [x] Phase 47: Downstream & Release (2/2 plans) — completed 2026-02-10
- [x] Phase 48: Test Coverage of New Functionality (3/3 plans) — completed 2026-02-10

[Full archive](milestones/v1.10.0-ROADMAP.md)

</details>

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

---

## Progress Summary

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v0.1.4 Hard Fork | 1 | 5 | Shipped 2026-01-18 |
| v0.1.5 Skills | 6 | 30 | Shipped 2026-01-22 |
| v1.0.0 Plugin | 4 | 5 | Shipped 2026-01-23 |
| v1.0.8 Stability | 1 | 5 | Shipped 2026-01-24 |
| v1.1.0 GitHub | 10 | 33 | Shipped 2026-01-27 |
| v1.3.0 Release | 2 | 4 | Shipped 2026-01-28 |
| v1.3.3 Docs | 1 | 4 | Shipped 2026-01-29 |
| v1.4.0 Issues | 2 | 11 | Shipped 2026-02-01 |
| v1.4.1 Execution | 4 | 6 | Shipped 2026-02-03 |
| v1.5.0 Phases | 3 | 6 | Shipped 2026-02-04 |
| v1.6.0 Subagents | 5 | 17 | Shipped 2026-02-06 |
| v1.7.0 Brainstorm | 2 | 5 | Shipped 2026-02-07 |
| v1.8.0 Adaptive | 3 | 7 | Shipped 2026-02-08 |
| v1.9.0 Templates | 4 | 5 | Shipped 2026-02-08 |
| v1.10.0 Worktrees | 5 | 11 | Shipped 2026-02-12 |
| v1.11.0 Phase Worktrees | 5 | 10 | Shipped 2026-02-14 |
| v1.12.0 Codebase Intel | 5 | 12 | In Progress |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-02-17 — Phase 58 added (gap closure: brownfield doc auto-refresh)*
