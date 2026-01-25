# Changelog

## [Unreleased]

## [1.1.3] - 2026-01-25

### Fixed
- **Autocomplete not working**: Restored `commands/` layer as thin wrappers for skills. Skills provide the implementation, commands provide `/` menu autocomplete. This fixes autocomplete that broke in 1.1.0 when commands were removed.
- **Command→skill mapping mismatch**: Fixed `executing-quick-tasks` command referencing wrong skill (`kata-executing-task-executes` → `kata-executing-quick-tasks`)
- **Stale command references**: Removed references to non-existent `/kata:discussing-milestones` skill, fixed `/kata:update` → `/kata:updating`, fixed `/kata:analyze-codebase` → `/kata:mapping-codebases`

### Changed
- **Command naming convention**: All 27 commands renamed from old syntax to new gerund form (e.g., `phase-execute.md` → `executing-phases.md`, `project-new.md` → `starting-projects.md`)
- **Build system**: Added commands to both NPM and plugin builds. Plugin build lifts `commands/kata/*` to `commands/*` and strips `kata:` prefix from command names.
- **Tests and CI/CD**: Updated to validate commands directory exists in distributions

## [1.1.2] - 2026-01-25

### Fixed
- **Stale command references**: Updated 286 references from old command syntax (`/kata:phase-execute`, `/kata:project-new`, etc.) to new skill syntax (`/kata:executing-phases`, `/kata:starting-projects`, etc.) across skills, agents, and documentation
- **zsh glob compatibility**: Fixed bash commands with glob patterns (like `ls *.md 2>/dev/null`) that fail in zsh when no matches exist. Added `|| true` and subshell wrappers for zsh compatibility

## [1.1.0] - 2026-01-25

**Skills-only architecture.** Commands layer removed — skills are now the primary interface.

### Changed
- **Skills-only distribution**: All 27 commands removed. Skills are now the sole interface for all Kata functionality
- **Skill naming convention**: Changed from verb-noun (`/kata:planning-phases`) to gerund form (`/kata:planning-phases`) for natural language matching
- **All skills user-invocable**: Skills appear directly in `/` menu for explicit invocation and respond to natural language
- **Build.js prefix transformation**: Plugin build strips `kata-` prefix from skill directories for clean `/kata:skill-name` invocation

### Removed
- **Commands directory**: 27 command wrapper files deleted — skills handle everything now
- **`commands/` from package.json files array**: No longer needed in NPM distribution

### Fixed
- **Test suite updated**: Tests now verify skills-only architecture (no commands directory expected)

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
- **Command namespace**: All commands now use `kata:` prefix (e.g., `/kata:providing-help`, `/kata:planning-phases`)
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

[Unreleased]: https://github.com/gannonh/kata/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/gannonh/kata/compare/v1.0.2...v1.0.3
[1.0.0]: https://github.com/gannonh/kata/compare/v0.1.8...v1.0.0
[0.1.8]: https://github.com/gannonh/kata/compare/v0.1.6...v0.1.8
[0.1.6]: https://github.com/gannonh/kata/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/gannonh/kata/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/gannonh/kata/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/gannonh/kata/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/gannonh/kata/releases/tag/v0.1.0
