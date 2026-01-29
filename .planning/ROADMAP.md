# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Current Milestone

### v1.3.3 Internal Tooling ← YOU ARE HERE

**Goal:** Create internal documentation and terminology reference for Kata.

**Phases:** 1
**Requirements:** 3 (TOOL-01, TOOL-02, TOOL-03)

- [ ] **Phase 2: Internal Documentation** — Flow diagrams, glossary, roadmap format fix

#### Phase 2: Internal Documentation

**Goal:** Create Mermaid flow diagrams, terminology glossary, and fix ROADMAP.md format

**Depends on:** v1.3.0 complete

**Requirements:** TOOL-01, TOOL-02, TOOL-03

**Success Criteria** (what must be TRUE):
1. Mermaid diagrams exist for major workflow paths (orchestration, lifecycle, planning, execution, verification, PR)
2. Diagrams stored in `docs/` or `kata/references/` for progressive disclosure
3. Kata glossary defines all key terms (milestone, phase, issue, plan, etc.)
4. Glossary shows relationships between concepts
5. Documentation is usable by both humans and future Claude instances
6. ROADMAP.md format is clear — current milestone at top, obvious "where are we now?", consistent structure

**Plans:** TBD (created during phase planning)

---

## Completed Milestones

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
| v1.3.3    | 1      | 0     | Current  | —          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-01-29 — Reformatted for clarity*
