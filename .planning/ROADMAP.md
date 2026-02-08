# Roadmap: Kata

## Overview

Kata is a spec-driven development framework for Claude Code. This roadmap tracks milestones for packaging, distribution, and integration features.

## Milestones

- ✅ **v1.5.0 Phase Management** — Phases 1-3 (shipped 2026-02-04)
- ✅ **v1.4.1 Issue Execution** — Phases 1-4 (shipped 2026-02-03)
- ✅ **v1.6.0 Skills-Native Subagents** — Phases 30-34 (shipped 2026-02-06)
- ✅ **v1.7.0 Brainstorm Integration** — Phases 35-36 (shipped 2026-02-07)
- ✅ **v1.8.0 Adaptive Workflows** — Phases 37-39 (shipped 2026-02-08)
- 🔄 **v1.9.0 Template Overrides (Universal)** — Phases 40-43 (in progress)

## Current Milestone: v1.9.0 Template Overrides (Universal)

**Goal:** Fix template override infrastructure to work universally for all users (plugin + skills-only), migrate validation from hooks into skills, create template customization UI, and document the feature.

### ✅ Phase 40: Template Resolution

**Requirements:** TMPL-01, TMPL-02, TMPL-03

Rewrite resolve-template.sh to use relative sibling discovery so template resolution works for all installation locations without absolute paths.

**Success criteria:**
- ✅ resolve-template.sh discovers templates via sibling skill directories (not absolute paths)
- ✅ Template resolution works identically for plugin and skills-only installations
- ✅ Missing templates produce clear error messages naming the template and search paths
- ✅ Existing skills that use templates continue to work without modification

### Phase 41: Validation Migration

**Requirements:** VAL-01, VAL-02, VAL-03, VAL-04

Move template drift detection and config validation from SessionStart hooks into skills so validation runs universally for plugin + skills-only users.

**Success criteria:**
- Template drift detection runs inside skills that interact with templates (not at session start)
- Config validation runs inside skills that read config (not at session start)
- Both validation paths work for plugin and skills-only installations
- SessionStart hooks for template-drift and config-validator are removed
- No regression in validation coverage (same checks, different trigger point)

### Phase 42: Template Customization Skill

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05

Build `/kata-customize-template` skill for listing, copying, editing, and validating template overrides.

**Success criteria:**
- `/kata-customize-template` skill exists and responds to natural language triggers ("customize template", "override template", "edit template")
- User can list all available templates with descriptions of what each controls
- User can copy a plugin default template to `.planning/templates/` for local override
- User can edit a template override and get validation feedback after save
- Template validation checks required fields and reports missing/malformed sections

### Phase 43: Documentation

**Requirements:** DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05

Document template customization in README, template schemas, example workflows, and migration guide from hooks to skills-based validation.

**Success criteria:**
- README includes a template customization section with setup instructions
- All customizable templates listed with descriptions and field documentation
- Example workflow shows end-to-end template customization
- Template schema documentation covers required and optional fields per template
- Migration guide explains transition from hooks-based to skills-based validation

## Completed Milestones

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
| v1.9.0    | 4      | —     | In Progress | —          |

---
*Roadmap created: 2026-01-18*
*Last updated: 2026-02-08 — v1.9.0 Template Overrides (Universal) roadmap created*
