# Project Milestones: Kata

## v1.4.1 Issue Execution (Shipped: 2026-02-03)

**Delivered:** Complete issue lifecycle with execution workflows, PR auto-closure, roadmap integration, and plan-phase issue context wiring

**Phases completed:** 1-4 (6 plans total)

**Key accomplishments:**

- PR→Issue auto-closure for phase execution, milestone completion, and issue execution PRs
- Issue execution workflow with mode selection (quick task vs planned)
- Issue→roadmap integration: pull backlog issues into milestones and phases
- Source issue traceability chain from issue→plan→PR→closure
- Plan-phase issue context wiring for automated source_issue in generated plans

**Stats:**

- 152 files changed, 6,941 insertions, 651 deletions
- 4 phases, 6 plans
- 2 days (2026-02-01 → 2026-02-03)

**Git range:** `v1.4.0` → `v1.4.1`

**What's next:** v1.5.0 Phase Management

---

## v1.4.0 GitHub Issue Sync (Shipped: 2026-02-01)

**Delivered:** Unified issue model and bidirectional GitHub Issue integration

**Phases completed:** 1-2 (11 plans total)

**Key accomplishments:**

- GitHub Issue creation with automatic `backlog` label sync
- GitHub Issue pull for existing issues with selection UI
- Issue execution linking with auto-close on completion
- In-progress label sync and self-assignment
- Issue vocabulary normalized (todos → issues)

**Stats:**

- 2 phases, 11 plans
- 2 days (2026-01-31 → 2026-02-01)

**Git range:** `v1.3.5` → `v1.4.0`

**What's next:** v1.4.1 Issue Execution

---

## v1.3.3 Internal Documentation (Shipped: 2026-01-29)

**Delivered:** Workflow diagrams, terminology glossary, and internal documentation

**Phases completed:** 1 (4 plans total)

**Key accomplishments:**

- 6 Mermaid workflow diagrams covering orchestration, lifecycle, planning, execution, verification, and PR workflows
- Comprehensive glossary with 33 term definitions and relationship diagrams
- Dark theme styling for all diagrams

**Stats:**

- 1 phase, 4 plans
- 1 day (2026-01-29)

**Git range:** `v1.3.0` → `v1.3.3`

**What's next:** v1.4.0 GitHub Issue Sync

---

## v1.3.0 Release Automation (Shipped: 2026-01-28)

**Delivered:** Release workflow integrated into milestone completion with version detection and changelog generation

**Phases completed:** 0, 1 (4 plans total)

**Key accomplishments:**

- Release workflow in milestone completion — `/kata:completing-milestones` now offers release workflow
- Version detection reference — semantic version detection from conventional commits
- Changelog generation reference — Keep a Changelog format with commit-to-section mapping
- Dry-run mode — preview version bump and changelog without applying changes
- PR workflow integration — instructions for PR merge vs direct `gh release create`

**Stats:**

- 16 files changed, 1413 insertions, 84 deletions
- 2 phases, 4 plans
- 1 day (2026-01-28)

**Git range:** `v1.2.2` → `v1.3.0`

**What's next:** v1.3.3 Internal Documentation

---

## v1.1.0 GitHub Integration (Shipped: 2026-01-27)

**Delivered:** Config-driven GitHub Milestone, Issue, and PR workflows

**Phases completed:** 0-7 (33 plans total)

**Key accomplishments:**

- GitHub Milestone/Issue/PR integration with auto-linking
- Test harness with 27 skill tests and CI/CD integration
- PR review workflow with 6 specialized agents
- Plugin-only distribution (NPX deprecated, 27 skills renamed)
- Phase issues with `phase` label, plan checklist sync
- Branch creation and draft PR automation

**Stats:**

- 79 files changed, 2069 insertions, 885 deletions
- 10 phases, 33 plans
- 3 days (2026-01-25 → 2026-01-27)
- Includes rapid iteration on skills-only architecture (v1.1.0-1.1.15)

**Git range:** `v1.0.8` → `v1.1.0`

**What's next:** v1.2.0 Release Process Automation

---

## v1.0.8 Plugin Stability (Shipped: 2026-01-24)

**Delivered:** Skill self-containment architecture for stable plugin distribution

**Phases completed:** 2.1 (5 plans total)

**Key accomplishments:**

- Skills now self-contained — 10 skills bundle their own resources in local `references/` directories
- Shared directories removed — `kata/templates/`, `kata/workflows/`, `kata/references/` deleted (53 files)
- Build system simplified — `kata/` removed from COMMON_INCLUDES
- Agent namespacing fixed — plugin distribution uses `kata:kata-*` namespace
- Both distributions clean — plugin and npm outputs are fully self-contained

**Stats:**

- 53 files deleted, 28 files created
- 1 phase, 5 plans
- 1 day (2026-01-24) — single-day stabilization sprint

**Git range:** `v1.0.5` → `v1.0.8`

**What's next:** v1.1.0 GitHub Integration

---

## v1.0.0 Claude Code Plugin (Shipped: 2026-01-23)

**Delivered:** Kata packaged as Claude Code plugin for marketplace distribution

**Phases completed:** 1, 1.1, 2, 3 (5 plans total)

**Key accomplishments:**

- Plugin manifest created — `.claude-plugin/plugin.json` with all metadata
- Marketplace distribution — Published to gannonh/kata-marketplace
- Dual build system — `build.js` produces both NPM and plugin distributions
- Plugin-aware statusline — Detects installation method, shows appropriate update commands
- Documentation updated — README with plugin install as primary method

**Stats:**

- 4 phases, 5 plans
- 2 days (2026-01-22 → 2026-01-23)

**Git range:** `v0.1.8` → `v1.0.0`

**What's next:** v1.0.8 Plugin Stability

---

## v0.1.5 Skills & Documentation (Shipped: 2026-01-22)

**Delivered:** Complete skills architecture with 14 specialized skills, slash command suite, and testing framework

**Phases completed:** 0, 1, 1.1, 1.2, 1.3, 2 (30 plans total)

**Key accomplishments:**

- Skills architecture established — 14 specialized skills as orchestrators that spawn sub-agents via Task tool
- Skill naming conventions — gerund (verb-ing) style names with exhaustive trigger phrases for autonomous invocation
- Testing harness created — CLI-based test framework using `claude "prompt"` to verify skill invocation
- Todo management skill — kata-managing-todos handles ADD/CHECK operations with duplicate detection
- Discuss phase skill — kata-discussing-phases for pre-planning context gathering
- 25 slash commands created — thin wrappers delegating to skills via Task tool with disable-model-invocation

**Stats:**

- 468 files modified
- 96,500 insertions, 6,444 deletions
- 6 phases, 30 plans
- 4 days from start to ship (2026-01-18 → 2026-01-22)

**Git range:** `v0.1.4` → `v0.1.5`

**What's next:** v1.0.0 Claude Code Plugin

---

## v0.1.4 Hard Fork & Rebrand (Shipped: 2026-01-18)

**Delivered:** Complete separation from upstream GSD with independent Kata identity established

**Phases completed:** 0 (5 plans total)

**Key accomplishments:**

- Complete fork from upstream — severed all ties to glittercowboy/get-shit-done, configured gannonh/kata as sole origin
- Package identity established — updated to @gannonh/kata on npm with v0.1.0 baseline
- Documentation rebranded — CLAUDE.md, README.md, and all public docs reflect Kata standalone identity
- Support files reset — CHANGELOG.md started fresh, terminal.svg with Kata branding
- Internal references cleaned — all commands, hooks, and planning docs updated
- Verified clean slate — automated scans confirmed zero upstream references, human approval obtained

**Stats:**

- 130 files modified
- ~68,000 lines (md, js, json, sh)
- 1 phase, 5 plans, ~15 tasks
- 1 day from start to ship

**Git range:** `2cd2ace` → `0a0f10a`

**What's next:** v0.1.5 Skills & Documentation

---
