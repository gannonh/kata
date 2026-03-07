# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2026-02-07

### Changed
- Upgraded Opus model from 4.5 to 4.6

## [0.6.0] - 2026-02-04

### Added
- Git branch display in workspace UI with real-time updates via chokidar file watching
- PR badge showing linked pull request title, status, and click-to-open in browser
- Focus-aware PR polling with configurable refresh interval
- AI context injection: agent receives current branch and PR info per message
- Worktree and submodule support in GitWatcher with gitdir pointer resolution
- Async GitService delegation replacing legacy execSync GET_GIT_BRANCH handler

### Fixed
- existsSync guard prevents simple-git console noise on non-git directories
- PrService handles non-git directories silently
- Git status scoped to working directory instead of workspace root
- Session filters scoped to active workspace
- ENOSPC errors produce actionable Linux inotify instructions

### Changed
- Git branch badge moved from WorkspaceSwitcher to chat input toolbar
- PrBadge refactored to use usePrStatus hook with focus-aware polling

## [0.5.0] - 2026-02-01

### Added
- Expandable message content: Messages now display at full height by default, eliminating nested scrolling
- Per-message collapse toggle for long content (1500px+ threshold)
- Settings toggle in Appearance → Display to control default expand behavior
- New test coverage for preferences merging and expand/collapse logic (46 new tests)

### Fixed
- E2E tests renamed from `.spec.ts` to `.e2e.ts` to avoid Bun test runner conflicts
- Test isolation for preferences tests (pure unit tests without file I/O)

## [0.4.20] - 2026-02-01

### Added
- Complete Kata Agents branding (icons, logos, React components)
- macOS code signing support
- CI/CD workflows for PR validation and releases
- GitHub Releases distribution for all platforms
- Upstream management documentation (UPSTREAM.md)

### Fixed
- Remove all prior domain references from active code
- Update config paths to .kata-agents
- Harden GitHub Actions workflows with fork protection
- Strip executable permissions from bundled scripts to improve notarization compatibility

### Changed
- Rebrand to Kata Agents
- Bundle ID changed to `sh.kata.desktop`
- Auto-update provider changed from generic to GitHub Releases
- Slack OAuth temporarily disabled (requires infrastructure)

