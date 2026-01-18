# Changelog

All notable changes to Kata will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gannonh/kata/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/gannonh/kata/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/gannonh/kata/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/gannonh/kata/releases/tag/v0.1.0
