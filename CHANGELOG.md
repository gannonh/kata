# Changelog

## [Unreleased]

## [1.6.0] - 2026-02-06 — Skills-Native Subagents

Kata v1.6.0 ships **Skills-Native Subagents**: all 19 custom agent types migrated to skill resources with general-purpose subagent spawning, making Kata portable across Agent Skills-compatible platforms.

### Added
- **Skill resource pattern**: Agent instructions live in `skills/*/references/` and are inlined into subagent prompts at spawn time
- **Migration validation tests**: Automated tests verify all agents have instruction files, use general-purpose type, and wrap with `<agent-instructions>`
- **Test suite step**: Execute-phase runs project test suite before spawning verifier
- **skills.sh distribution channel**: Second distribution via `gannonh/kata-skills` repo alongside plugin marketplace
- **skills-sh build target**: `npm run build:skills-sh` produces cross-platform skill distribution
- **CI dual-publish**: Release pipeline publishes to both marketplace and skills.sh registry
- **Agent Skills spec compliance**: All 29 SKILL.md files normalized to Agent Skills spec with automated validation
- **Phase migration skill**: `/kata:kata-migrate-phases` fixes duplicate phase numbering with collision detection
- **Globally sequential phase numbering**: Phase numbers are unique across all milestones

### Changed
- All 19 custom `kata:kata-*` subagent types replaced with `general-purpose`
- Cross-skill instruction sharing via file duplication (self-contained, portable skills)
- `agents/` directory removed; instructions now in skill `references/` directories
- Build system no longer copies or references agent files
- CLAUDE.md, KATA-STYLE.md, README.md updated to skill resources terminology
- Phase numbering reverted from per-milestone to globally sequential

### Fixed
- Phase lookup collision when multiple milestones had phases starting at 1
- Parallel Task spawning enforced in add-milestone and map-codebase skills
- Missing execution stage banner in kata-execute-phase
- Instruction file path documentation standardized across skills
- Script path resolution in kata-execute-phase uses `SKILL_BASE_DIR` instead of hardcoded relative path

---

## [1.5.0] - 2026-02-04 — Phase Management

Kata v1.5.0 ships **Phase Management**: organized phase directories, cross-milestone phase movement, and improved roadmap visibility.

### Added
- **Phase state directories**: Phases organized under `pending/`, `active/`, `completed/` subdirectories
- **Phase completion validation**: Validates PLAN.md and SUMMARY.md exist; non-gap phases require VERIFICATION.md
- **Phase movement skill**: `/kata:kata-move-phase` moves phases between milestones with automatic renumbering
- **Within-milestone reorder**: Reorder phases within a milestone via `/kata:kata-move-phase`
- **Per-milestone phase numbering**: Each milestone starts numbering at 1 (independent, not cumulative)
- **Planned milestones in roadmap**: ROADMAP.md displays future planned milestones with placeholder goals
- **Roadmap format conventions**: Standardized formatting propagated to milestone completion, add-milestone, and roadmapper agents

### Changed
- Universal phase discovery pattern across all skills and agents (state-aware `find` instead of `ls` glob)
- Roadmap completed milestone details blocks standardized with consistent formatting
- Progress summary table updated with milestone-level tracking

### Fixed
- Replaced all `ls` glob patterns with `find` for zsh-safe phase discovery across skills and agents
- Self-validation checkpoint added before completion banner
- Directory creation ordering in new-project skill

---

## [1.4.1] - 2026-02-03 — Issue Execution

Kata v1.4.1 completes the **issue lifecycle**: execution workflows, PR integration with auto-closure, roadmap integration, and plan-phase issue context wiring.

### Added
- **Issue execution workflow**: "Work on it now" offers mode selection (quick task vs planned) with full PR lifecycle
- **Quick task issue execution**: Creates plan, executes with commits, creates PR with `Closes #X` for source issue
- **Planned execution routing**: Links issues to new or existing phases for structured execution
- **Issue → milestone integration**: Pull backlog issues into milestone scope via `/kata:kata-add-milestone`
- **Issue → phase integration**: Pull issues into phases as tasks/plans with source issue traceability
- **Source issue in plans**: `source_issue` frontmatter in PLAN.md files for traceability from issue to execution
- **Plan-phase issue context**: plan-phase reads STATE.md issue sections and passes context to kata-planner
- **Multi-issue PR closure**: Milestone completion PRs include `Closes #X` for all phase issues in the milestone
- **Repo creation prompt**: When GitHub enabled but no remote, offer to create repository during `/kata:kata-new-project`

### Changed
- All skill names prefixed with `kata-` for consistent namespacing (`add-issue` → `kata-add-issue`)
- Skill descriptions reduced — removed filler phrases for cleaner autonomous matching
- Execute-phase reads `source_issue` from PLAN.md frontmatter for PR body `Closes #X`

### Fixed
- Variable expansion in heredoc for PR body generation
- Private repository set as default option in new-project skill

---

## [1.4.0] - 2026-02-01 — GitHub Issue Sync

Kata v1.4.0 ships **GitHub Issue Sync**: bidirectional GitHub Issue integration with automatic labeling, assignment, and lifecycle management.

### Added
- **GitHub Issue creation**: Issues created via `/kata:kata-add-issue` automatically sync to GitHub with `backlog` label
- **GitHub Issue pull**: `/kata:kata-check-issues` pulls existing GitHub Issues with `backlog` label for selection
- **Execution linking**: Kata execution can reference and auto-close GitHub Issues on completion
- **In-progress label sync**: When starting work, adds `in-progress` label and removes `backlog`
- **Self-assignment**: When starting work on GitHub-linked issue, auto-assigns to `@me`
- **Local fallback**: Non-GitHub projects continue using `.planning/issues/` storage

### Changed
- Issue vocabulary normalized from "todos" to "issues" throughout all skills
- Issue storage moved from `.planning/todos/` to `.planning/issues/open/`
- Skills renamed from gerund style to simple names (`add-issue`, `check-issues`)

### Fixed
- Auto-migration archives old `.planning/todos/` directory when migrating

---

## [1.3.5] - 2026-02-01 — Issue Model & Skills-First

**Issue Model Foundation** — Kata now uses "issues" vocabulary consistently:
- Renamed all references from "todos" to "issues" throughout skills and UI
- Migrated storage from `.planning/todos/` to `.planning/issues/` with auto-archive
- `/kata:kata-add-issue` and `/kata:kata-check-issues` replace todo equivalents

**Skills-First Architecture** — Simplified invocation layer:
- Removed commands wrapper layer (29 files deleted)
- Skills are now directly user-invocable via `/kata:kata-skill-name`
- Cleaner skill names: `help`, `add-issue`, `execute-phase` (not gerund style)

### Changed
- Vocabulary normalized from "todos" to "issues" across all skills, agents, and messages
- Skills renamed from gerund style (`adding-issues`) to simple names (`add-issue`)
- Commands layer removed — skills are primary interface

### Added
- Auto-migration from `.planning/todos/` to `.planning/issues/` (archives old location)
- Deprecation handling for legacy "todo" vocabulary redirects users to new names

---

## [1.3.4] - 2026-01-31 — GitHub Issue Integration

### Fixed
- **Issue closure on PR merge**: Phase issues now explicitly closed after PR merge (backup for `Closes #X` auto-close)
- **GitHub Milestone closure**: Milestones now properly closed via API when completing milestones

---

## [1.3.3] - 2026-01-29 — Internal Documentation

Kata v1.3.3 ships **Internal Documentation**: workflow diagrams, terminology glossary, and dark theme styling for all diagrams.

### Added
- **Post-release verification checklist**: Milestone completion now includes CI/CD, release artifact, and smoke test verification steps

### Fixed
- **High-level orchestration diagram**: Simplified diagram structure for better clarity

### Changed
- **Internal documentation**: Added workflow diagrams (FLOWS.md), terminology glossary (GLOSSARY.md), and dark theme styling for all diagrams

---

## [1.3.2] - 2026-01-28

### Changed
- **PR merge strategy**: Changed from `--squash` to `--merge` to preserve atomic commit history. Squash was destroying the per-task commit granularity that Kata creates.

### Added
- **Branch protection guidance**: When `pr_workflow` is enabled, now recommends enabling GitHub branch protection on main (shown in new projects and settings).

---

## [1.3.1] - 2026-01-28

### Fixed
- **Milestone completion branch workflow**: When `pr_workflow=true`, now creates release branch FIRST before any commits. Previously committed to main then offered to create branch (too late, causing lost work on reset).

### Added
- **v1.3.0 milestone archives**: Recovered and added missing milestone archive files from v1.3.0 release.

---

## [1.3.0] - 2026-01-28 — Release Automation

Kata v1.3.0 integrates release workflow into milestone completion: version detection, changelog generation, and GitHub Release creation.

### Added
- **Release workflow in milestone completion**: `/kata:kata-completing-milestones` now offers release workflow before verification
- **Version detection reference**: `version-detector.md` with semantic version detection from conventional commits
- **Changelog generation reference**: `changelog-generator.md` with Keep a Changelog format and commit-to-section mapping
- **Dry-run mode**: Preview version bump and changelog without applying changes
- **PR workflow integration**: Instructions for PR merge vs direct `gh release create` based on config

### Changed
- **Milestone completion skill**: Updated description with release triggers (release version, create release, ship milestone)
- **Execution phase workflow**: Consolidated post-execution options into step 10.6 checkpoint loop
- **README**: Updated for v1.3.0 with What's New section documenting release automation

### Fixed
- **Merge timing**: Merge now offered after UAT/PR review, not before

---

## [1.2.2] - 2026-01-28

### Fixed
- **GitHub issue body updates**: Replaced awk with Python script for reliable multiline content handling in plan checklists
- **Skill scripts directory**: Plugin build now includes `skills/*/scripts/` directories (was globally excluded)
- **Script path resolution**: Skills use base directory from invocation header instead of hardcoded marketplace paths

---

## [1.2.1] - 2026-01-28

### Fixed
- **VERSION file path**: Skills now correctly reference `$CLAUDE_PLUGIN_ROOT/VERSION` instead of deprecated `kata/VERSION` path
- **Removed deprecated NPX fallbacks**: Skills no longer check `~/.claude/kata/VERSION` paths (NPX deprecated in v1.1.0)

### Removed
- **Stale `kata/VERSION` file**: Removed outdated source file (build generates VERSION correctly)

---

## [1.2.0] - 2026-01-27 — Release Process Automation

Kata v1.2.0 automates the release pipeline: CI now creates GitHub Releases with tags automatically.

### Added
- **Automated GitHub Releases**: CI workflow creates GitHub Releases with tags on version change
- **Changelog extraction**: Release notes automatically extracted from CHANGELOG.md

### Changed
- **Release skill updated**: `releasing-kata` reflects plugin-only distribution (NPM deprecated)
- **CI permissions**: `plugin-release.yml` now has `contents: write` for release creation

### Removed
- **NPM references**: Removed all NPM publishing references from release documentation
- **Outdated troubleshooting**: Removed NPM-specific troubleshooting sections
- **Deprecated NPX smoke tests**: Removed NPX install tests from smoke.test.js (NPX deprecated in v1.1.0)

---

## [1.1.0] - 2026-01-27 — GitHub Integration

Kata v1.1.0 ships **GitHub Integration**: config-driven GitHub Milestone, Issue, and PR workflows.

### Added
- **GitHub config namespace**: `.planning/config.json` now includes `github.enabled` and `github.issueMode` settings
- **GitHub Milestone creation**: `/kata:kata-adding-milestones` creates GitHub Milestones via `gh api`
- **Phase issue creation**: Phases become GitHub Issues with `phase` label, assigned to milestone
- **Plan checklist sync**: Plans shown as checklist items in phase issues, checked as plans complete
- **PR integration**: `/kata:kata-executing-phases` creates branches, draft PRs with "Closes #X" linking, marks ready on completion
- **PR status display**: `/kata:kata-tracking-progress` shows PR status (Draft/Ready/Merged)
- **PR review workflow**: `/kata:kata-review-pr` command with 6 specialized review agents
- **Test harness**: 27 skill tests with affected-test detection and CI/CD integration

### Changed
- **Plugin-only distribution**: NPX support deprecated; install via Claude Code plugin marketplace
- **Skill directory naming**: Renamed from `kata-*` to `*` (27 skills)
- **Build system simplified**: NPM target removed, plugin build retained

### Removed
- **NPX distribution path**: `bin/install.js` now shows deprecation message
- **Update skill**: Removed `kata-updating` (plugin updates via marketplace)
- **NPX hooks**: Removed `kata-check-update.js`, `kata-npm-statusline.js`

---

## [1.1.15] - 2026-01-25

### Fixed
- **NPX install failure**: Fixed `ENOENT: no such file or directory, scandir '.../kata/kata'` error when running `npx @gannonh/kata`. The `kata/` source directory was removed in v1.0.6 but three places still referenced it:
  - `package.json` files field listed `"kata"` (build.js now filters it out)
  - `bin/install.js` tried to copy from non-existent `kata/` directory (removed)
  - `bin/install.js` CHANGELOG copy failed because kata dest dir wasn't created first (fixed ordering)

## [1.1.14] - 2026-01-25

### Fixed
- **Plugin Skill() invocation**: Build system now transforms `Skill("kata-xxx")` to `Skill("kata:xxx")` for plugin distribution. Commands calling skills failed with "Unknown skill" because skill directories are renamed (`kata-xxx` → `xxx`) but Skill() calls weren't being transformed to match the plugin namespace.

## [1.1.10] - 2026-01-25

### Fixed
- **Restored v1.0.8 working state**: Reverted commands, skills, agents, and build.js to v1.0.8 state. Commands use `phase-add` style naming, skills use `adding-phases` style - no namespace conflicts.

## [1.1.9] - 2026-01-25

### Fixed
- **Plugin skill invocation**: Removed commands from plugin build. Commands and skills had same namespace (`kata:adding-phases`) causing conflicts. Skills now handle everything in plugin context with `user-invocable: true`.

## [1.1.8] - 2026-01-25

### Fixed
- **Reverted skills-only architecture**: Rolled back to v1.0.8 codebase. The v1.1.x skills-only changes broke natural language invocation entirely — skills with `user-invocable: false` were hidden from the Skill tool, and commands with `disable-model-invocation: true` were blocked.

### Architecture
- Commands + Skills architecture restored (commands for autocomplete, skills for implementation)
- Skills: `user-invocable: false`, `disable-model-invocation: false`
- Commands delegate to skills via Task tool

## [1.1.0 - 1.1.7] - 2026-01-25 (REVERTED)

**These releases attempted a skills-only architecture that broke natural language invocation. Reverted in 1.1.8.**

## [1.0.8] - 2026-01-24

### Fixed
- **Stale template references**: Fixed 15+ prose references to `$KATA_BASE/templates/` in skills and agents that remained after Phase 2.1 skill-centric restructure
- **Nested reference paths**: Fixed `@./references/` paths inside `references/` directories to use sibling-relative `@./` syntax
- **Test suite alignment**: Updated tests to reflect Phase 2.1 architecture (skills use local `@./references/` paths, no shared `kata/` directory)
- **resolveRef() relative path handling**: Fixed path resolution to correctly handle `@./` references relative to the containing file's directory

### Added
- **Local plugin testing script**: Added `scripts/test-local.sh` for easy local plugin testing during development

## [1.0.7] - 2026-01-24

### Fixed
- **Plugin agent namespacing**: Build system now transforms `subagent_type="kata-*"` to `subagent_type="kata:kata-*"` for plugin distribution. Claude Code namespaces plugin agents as `pluginname:agentname`, so skills referencing agents like `kata-executor` need the `kata:` prefix in plugin context. Source files remain unchanged for npx distribution compatibility.

## [1.0.6] - 2026-01-24

### Fixed
- **Plugin path transformation**: Fixed `build.js` to transform `@~/.claude/kata/` → `@./kata/` (was incorrectly producing `@./`). This caused "file not found" errors when plugin skills referenced templates, workflows, and references.

### Added
- **Path transformation tests**: New tests verify plugin `@-references` use the correct `@./kata/` pattern and resolve to existing files
- **Release skill**: Added `.claude/skills/releasing-kata/` for guided release workflow

## [1.0.5] - 2026-01-24

### Fixed
- **Plugin marketplace deployment**: Fixed workflow to include hidden directories (`.claude-plugin/`) when copying to marketplace — bash glob `*` doesn't match hidden dirs

## [1.0.4] - 2026-01-24

### Fixed
- **Plugin path resolution (v2)**: Reverted `@$KATA_BASE/` approach from 1.0.3 — Claude's `@` reference system is a static file path parser that cannot substitute variables. Restored canonical `@~/.claude/kata/` paths which `build.js` transforms correctly to `@./kata/` for plugins.

### Changed
- **Removed `<kata_path>` blocks**: These blocks didn't help with @ references since Claude can't use bash-resolved variables in @ paths

### Added
- **Tests to catch this class of bug**: New tests detect `@$VARIABLE/` and `@${VAR}/` patterns in source files (which will never work)
- **Integration test for plugin @ references**: Verifies that plugin build @ references resolve to existing files
- **Path reference documentation**: Added section to KATA-STYLE.md explaining why @ references must use static paths

## [1.0.3] - 2026-01-23

### Fixed
- **Plugin path resolution**: Attempted to fix "Error reading file" when agents load templates by adding `$KATA_BASE` path resolution (reverted in 1.0.4 — this approach doesn't work)

### Added
- **Test coverage for path resolution**: Added tests for path resolution (updated in 1.0.4)

## [1.0.2] - 2026-01-23

### Fixed
- **Marketplace version update**: Fixed plugin-release workflow to update version in correct path (`.claude-plugin/marketplace.json`)

## [1.0.1] - 2026-01-23

### Fixed
- **Plugin release workflow**: Changed trigger from `release` event to `workflow_run` to fix GitHub limitation where workflows using GITHUB_TOKEN don't trigger downstream workflows
- **CI test runner**: Fixed glob pattern expansion issue on CI runners
- **NPM publish**: Removed dev scripts from dist package.json to prevent prepublishOnly failures

## [1.0.0] - 2026-01-23

Kata 1.0 ships with **Claude Code plugin support** as the recommended installation method.

### Added
- **Claude Code plugin distribution**: Install via `/plugin marketplace add gannonh/kata-marketplace` + `/plugin install kata@gannonh-kata-marketplace`
- **Dual build system**: `node scripts/build.js` produces both NPM and plugin distributions
- **Plugin-aware statusline**: Detects installation method (NPM vs plugin) and shows appropriate update commands
- **CI validation pipelines**: Tests and build artifact validation run before NPM publish and plugin release
- **Plugin marketplace badge**: README now shows both plugin and NPM badges

### Changed
- **Plugin install is now recommended**: Getting Started section leads with marketplace install, NPM moved to collapsible alternative
- **Command namespace**: All commands now use `kata:` prefix (e.g., `/kata:kata-providing-help`, `/kata:kata-planning-phases`)
- **Hook scripts converted to ES modules**: All hooks now use ESM syntax
- **Staying Updated section**: Split into separate commands for plugin and NPM users

### Fixed
- Source directory detection in update skill prevents npx failure
- Stale `kata-cc` references updated to `@gannonh/kata`
- Main branch push blocking logic updated to new format
- Removed unused hooks and statusline from default settings

## [0.1.8] - 2026-01-22

### Added
- **Website launch**: [kata.sh](https://kata.sh) is live (documentation coming soon)
- Phonetic pronunciation (/ˈkɑːtɑː/) below kanji in all SVG assets

### Changed
- **Brand refresh**: Updated visual identity to match new website design
  - New color palette: Amber (#d4a574) replaces Kata Blue (#7aa2f7)
  - Background: Ink (#0d0d0d) replaces Deep Slate (#0f0f14)
  - Typography: Noto Serif JP (weight 200) for kanji mark
- **CLI installer**: Simplified to standard ANSI colors for terminal compatibility
- **All SVG assets**: Updated with new brand colors

## [0.1.6] - 2026-01-22

### Added
- **PR workflow config option**: Enable PR-based release workflow via `pr_workflow` setting
- **PR creation in milestone completion**: Offer to create PR via `gh pr create` when pr_workflow enabled
- **GitHub Actions scaffolding**: Scaffold release workflow during project-new when pr_workflow enabled
- **Config schema documentation**: Full schema reference in `kata/references/planning-config.md`
- **Missing config key detection**: Settings skill detects and prompts for missing config keys

### Changed
- Config schema now includes `commit_docs` and `pr_workflow` options
- Settings skill presents 6 settings (was 5)
- PR workflow defaults to "No" (direct commits to main)

### Fixed
- Hooks installation now handles subdirectories correctly
- GSD reference validation in transform workflow

## [0.1.5] - 2026-01-22

### Added
- **Skills architecture**: 14 specialized skills as orchestrators that spawn sub-agents via Task tool
- **Slash command suite**: 25 commands delegating to skills with `disable-model-invocation: true`
- **Test harness**: CLI-based testing framework using `claude "prompt"` for skill verification
- **kata-managing-todos skill**: ADD/CHECK operations with duplicate detection
- **kata-discussing-phases skill**: Pre-planning context gathering with adaptive questioning
- **Quick task skill**: Fast execution for small ad-hoc tasks with Kata guarantees

### Changed
- Skills use gerund (verb-ing) naming convention with exhaustive trigger phrases
- Skills have `user-invocable: false` to control invocation via commands or natural language
- ESM module type added to package.json for test harness compatibility

### Fixed
- Skill trigger reliability via exhaustive description trigger phrases
- Research workflow clarified with tripartite split (discuss, research, assumptions)

## [0.1.4] - 2026-01-18

### Fixed
- Global install now properly adds Kata SessionStart hook when other SessionStart hooks are already configured

## [0.1.3] - 2026-01-18

### Added
- Local vs global installation detection in update command
- Enhanced local installation detection in update check and statusline

### Fixed
- Cache path handling for local and global installation detection
- Local installation detection in update check hook

### Changed
- Improved README content clarity and consistency

## [0.1.0] - 2026-01-18

### Changed
- Rebranded project from upstream fork to standalone Kata
- Reset version to 0.1.0 for fresh start
- Updated package ownership to gannonh

### Removed
- Upstream remote and sync workflow
- References to original project maintainer

[Unreleased]: https://github.com/gannonh/kata/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/gannonh/kata/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/gannonh/kata/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/gannonh/kata/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/gannonh/kata/compare/v1.3.5...v1.4.0
[1.3.5]: https://github.com/gannonh/kata/compare/v1.3.4...v1.3.5
[1.3.4]: https://github.com/gannonh/kata/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/gannonh/kata/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/gannonh/kata/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/gannonh/kata/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/gannonh/kata/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/gannonh/kata/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/gannonh/kata/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/gannonh/kata/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/gannonh/kata/compare/v1.0.8...v1.1.0
[1.0.8]: https://github.com/gannonh/kata/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/gannonh/kata/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/gannonh/kata/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/gannonh/kata/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/gannonh/kata/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/gannonh/kata/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/gannonh/kata/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/gannonh/kata/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/gannonh/kata/compare/v0.1.8...v1.0.0
[0.1.8]: https://github.com/gannonh/kata/compare/v0.1.6...v0.1.8
[0.1.6]: https://github.com/gannonh/kata/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/gannonh/kata/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/gannonh/kata/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/gannonh/kata/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/gannonh/kata/releases/tag/v0.1.0
