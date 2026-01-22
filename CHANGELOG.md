# Changelog

All notable changes to Kata will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gannonh/kata/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/gannonh/kata/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/gannonh/kata/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/gannonh/kata/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/gannonh/kata/releases/tag/v0.1.0
