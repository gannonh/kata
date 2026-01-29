# Project Milestones: Kata

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

**What's next:** v1.3.1 patch (milestone completion workflow fix)

---

## v1.2.2 (Shipped: 2026-01-28)

**Delivered:** Bug fixes for skill scripts and GitHub issue updates

**Phases completed:** N/A (patch release)

**Key accomplishments:**

- GitHub issue body updates — replaced awk with Python script for reliable multiline content
- Skill scripts directory — plugin build now includes `skills/*/scripts/` directories
- Script path resolution — skills use base directory from invocation header

**Stats:**

- 3 files modified
- Patch release (same day as v1.2.1)

**Git range:** `v1.2.1` → `v1.2.2`

**What's next:** v1.3.0 Release Automation

---

## v1.2.1 (Shipped: 2026-01-28)

**Delivered:** VERSION file path fix for plugin distribution

**Phases completed:** N/A (patch release)

**Key accomplishments:**

- Fixed VERSION file path in skills to use `$CLAUDE_PLUGIN_ROOT/VERSION`
- Removed deprecated NPX fallback paths from skills
- Removed stale `kata/VERSION` source file

**Stats:**

- 3 files modified
- Patch release (same day as v1.2.0)

**Git range:** `v1.2.0` → `v1.2.1`

**What's next:** v1.3.0 Release Automation

---

## v1.2.0 Release Process Automation (Shipped: 2026-01-27)

**Delivered:** Automated release pipeline with CI-driven GitHub Releases

**Phases completed:** N/A (single-day release automation)

**Key accomplishments:**

- CI workflow creates GitHub Releases with tags on version change
- Changelog extraction automated from CHANGELOG.md
- Release skill updated for plugin-only distribution
- Removed all NPM publishing references

**Stats:**

- ~10 files modified
- CI/CD automation sprint (same day as v1.1.0)

**Git range:** `v1.1.0` → `v1.2.0`

**What's next:** v1.2.1 patch (VERSION path fix)

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
- Includes patches v1.0.8, v1.0.7

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
- Followed by rapid patch releases v1.0.1-v1.0.5 addressing distribution issues

**Git range:** `v0.1.8` → `v1.0.0`

**What's next:** v1.0.8 Plugin Stability (stabilize after rapid patches)

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

**What's next:** v0.1.9 Claude Code Plugin (Package and publish as plugin)

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

**What's next:** v0.1.5 Skills & Documentation (In Progress)

---
