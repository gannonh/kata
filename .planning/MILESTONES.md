## v1.12.0 Codebase Intelligence (Shipped: 2026-02-18)

**Delivered:** Automatic codebase knowledge capture, storage, and injection into all Kata agent workflows. Agents receive architecture summaries, naming conventions, and dependency graphs in their context windows.

**Phases completed:** 54-59 (19 plans total)

**Key accomplishments:**

- End-to-end codebase intelligence pipeline: `scan-codebase.cjs` → `generate-intel.js` → `.planning/intel/` → agent context injection
- Planner, executor, and verifier agents now receive codebase conventions and architecture summaries when spawned
- Incremental intel updates during phase execution (step 7.25 smart scan gate with SCAN_RAN guard)
- Brownfield doc staleness detection with auto-refresh path via mapper agent spawning
- Greenfield intel scaffolding via `scaffold-intel.cjs` wired into kata-new-project
- generate-intel.js v2 schema with camelCase stats and commitHash freshness metadata
- 167/167 tests passing; 84 new tests for scan-codebase.cjs; brownfield staleness tests with backdated git commits
- All 4 gaps from milestone audit closed (oldest-commit fallback, brownfield guard removal, v2 schema migration, Phase 55 verification report)

**Stats:**

- 144 files changed, 18,349 insertions, 3,136 deletions
- 6 phases, 19 plans
- 4 days (2026-02-15 → 2026-02-18)

**Git range:** `v1.11.1` → `v1.12.0`

**What's next:** TBD

---

## v1.11.0 Phase-Level Worktrees (Shipped: 2026-02-14)

**Delivered:** Phase-level worktree architecture so `main/` stays on the main branch permanently, with persistent `workspace/` as the working directory.

**Phases completed:** 49-53 (10 plans total)

**Key accomplishments:**

- Phase-level worktrees replace `git checkout -b` in `main/`, keeping `main/` on the main branch permanently
- Workspace worktree architecture with persistent `workspace/` as working directory and read-only `main/`
- Two-tier worktree model: plan worktrees fork from phase branch, merges target phase worktree
- Worktree-safe PR merge patterns across all 4 affected skills
- Full test coverage for workspace model across all worktree scripts

**Stats:**

- 61 files changed, 6,421 insertions, 391 deletions
- 5 phases, 10 plans
- 2 days (2026-02-13 → 2026-02-14)

**Git range:** `v1.10.3` → `v1.11.0`

**What's next:** TBD

---

## v1.10.0 Git Worktree Support (Shipped: 2026-02-12)

**Delivered:** Optional git worktree support for plan-level agent isolation during phase execution, replacing the shared-directory model.

**Phases completed:** 44-48 (11 plans total)

**Key accomplishments:**

- Config foundation with worktree.enabled setting and read-config.sh for nested JSON keys
- Git worktree lifecycle management via manage-worktree.sh (create, merge, list subcommands)
- Wave-based execution integration with per-plan worktree isolation
- Worktree-aware downstream skills and two-tier branch flow documentation
- Comprehensive test suite for all new worktree scripts and infrastructure
- Post-release verification with active task offerings

**Stats:**

- 98 files created/modified
- 7,199 insertions, 1,116 deletions
- 5 phases, 11 plans, 19 tasks
- 1 day from start to ship (2026-02-09 → 2026-02-10)

**Git range:** `b111432` → `f697508`

**What's next:** Continue improving Kata's development workflow infrastructure

---


## v1.9.0 Template Overrides Universal (Shipped: 2026-02-08)

**Delivered:** Universal template override infrastructure with portable resolution, in-skill validation, template customization UI, and full documentation.

**Phases completed:** 40-43 (5 plans total)

**Key accomplishments:**

- Universal template resolution via sibling discovery, works for plugin and skills-only installations
- `/kata-customize` skill for listing, copying, editing, and validating template overrides
- Validation migrated from SessionStart hooks into skills (template drift + config validation)
- Template system test suite covering resolution, drift detection, and override behavior
- All default templates converted to YAML frontmatter with schema documentation
- Comprehensive template customization docs and hooks-to-skills migration guide

**Stats:**

- 71 files changed, 5,610 insertions, 527 deletions
- 4 phases, 5 plans
- 1 day (2026-02-08)

**Git range:** `v1.8.0` → `v1.9.0`

**What's next:** TBD

---

## v1.8.0 Adaptive Workflows (Shipped: 2026-02-08)

**Delivered:** Project-specific workflow customization through preferences storage, progressive capture, template overrides, and config-driven workflow variants.

**Phases completed:** 37-39 (7 plans total)

**Key accomplishments:**

- Preferences infrastructure with `read-pref.sh`, `has-pref.sh`, `set-config.sh` accessor scripts and flat `preferences.json` storage
- Progressive capture reducing onboarding from 11 to 5 questions, with deferred preferences captured at first use via check-or-ask pattern
- Template overrides with project-local templates in `.planning/templates/` that override plugin defaults
- Template drift detection SessionStart hook warning when project templates diverge from plugin schema
- Config workflow variants with `workflows` section in config.json for per-skill customization
- Config validator hook on session start warning on unknown keys and erroring on invalid types
- kata-doctor skill for project health checks including roadmap format validation

**Stats:**

- 92 files changed, 9,921 insertions, 1,321 deletions
- 3 phases, 7 plans
- 2 days (2026-02-07 → 2026-02-08)

**Git range:** `v1.7.0` → `v1.8.0`

**What's next:** TBD

---

## v1.7.0 Brainstorm Integration (Shipped: 2026-02-07)

**Delivered:** Structured explorer/challenger brainstorming via Agent Teams, wired into 5 existing workflows as an optional step with downstream context injection.

**Phases completed:** 35-36 (5 plans total)

**Key accomplishments:**

- kata-brainstorm skill with explorer/challenger Agent Teams for structured ideation
- Agent Teams prerequisite detection with auto-enable via settings.json
- Kata-aware context assembly injecting PROJECT.md, ROADMAP.md, issues, and STATE.md into brainstorm agents
- Brainstorm gates in 5 workflows (add-milestone, new-project, discuss-phase, research-phase, plan-phase)
- Brainstorm SUMMARY.md auto-feeds into planner and researcher agents as downstream context

**Stats:**

- 77 files changed, 4,319 insertions, 571 deletions
- 2 phases, 5 plans, ~9 tasks
- 2 days (2026-02-06 → 2026-02-07)

**Git range:** `v1.6.1` → `v1.7.0`

**What's next:** TBD

---

## v1.6.0 Skills-Native Subagents (Shipped: 2026-02-06)

**Delivered:** All 19 custom agent types migrated to skill resources with general-purpose subagent spawning, making Kata portable across Agent Skills-compatible platforms.

**Phases completed:** 30-34 (17 plans total)

**Key accomplishments:**

- Skill resource pattern: agent instructions in `skills/*/references/`, inlined into subagent prompts at spawn time
- All 19 custom `kata:kata-*` subagent types replaced with standard `general-purpose`
- Automated migration validation tests (6 tests ensuring compliance)
- skills.sh distribution channel via `gannonh/kata-skills` with CI dual-publish
- All 29 SKILL.md files normalized to Agent Skills spec
- Globally sequential phase numbering replacing per-milestone numbering
- `agents/` directory removed; instructions self-contained in skill resources

**Stats:**

- 446 files changed, 15,114 insertions, 4,282 deletions
- 5 phases, 17 plans
- 3 days (2026-02-04 → 2026-02-06)

**Git range:** `v1.5.0` → `v1.6.0`

**What's next:** TBD

---

## v1.5.0 Phase Management (Shipped: 2026-02-04)

**Delivered:** Phase state directories, cross-milestone phase movement, per-milestone numbering, and standardized roadmap formatting

**Phases completed:** 1-3 (6 plans total)

**Key accomplishments:**

- Universal phase discovery pattern with state-aware `find` across all skills and agents
- Phase state directories (`pending/`, `active/`, `completed/`) with automatic transitions
- `/kata-move-phase` for cross-milestone moves and within-milestone reordering
- Per-milestone phase numbering starting at 1 (independent per milestone)
- Roadmap format standardization with Planned Milestones section
- Format conventions propagated to milestone completion, add-milestone, and roadmapper agents

**Stats:**

- 88 files changed, 4,618 insertions, 226 deletions
- 3 phases, 6 plans
- 2 days (2026-02-03 → 2026-02-04)

**Git range:** `v1.4.1` → `v1.5.0`

**What's next:** TBD

---

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
