# Kata Agents

## What This Is

Native desktop client for the Kata ecosystem with integrated git context. Built on the Claude Agent SDK, it provides multi-session management, MCP server integration, and developer-focused features like real-time git branch/PR display and AI-aware git context injection. Includes live E2E testing infrastructure and CI-enforced coverage thresholds.

## Core Value

A developer-centric AI desktop client that understands your git workflow and provides contextual assistance.

## Requirements

### Validated

<!-- Inherited from Craft Agents codebase -->

- ✓ Multi-process Electron desktop app (main/renderer/preload) — existing
- ✓ Claude Agent SDK integration for AI code execution — existing
- ✓ Chat interface with real-time message streaming — existing
- ✓ Session persistence to disk with conversation history — existing
- ✓ Multi-workspace support with independent sessions — existing
- ✓ OAuth authentication (Google, Slack, Microsoft) — existing
- ✓ API key authentication for Anthropic — existing
- ✓ MCP (Model Context Protocol) server integration — existing
- ✓ Tool permissions management with user approval — existing
- ✓ Auto-update mechanism via electron-updater — existing
- ✓ Cross-platform builds (macOS, Windows, Linux) — existing
- ✓ Sentry error tracking integration — existing

<!-- v0.4.0 Foundation milestone -->

- ✓ Remove "Craft" from product name, metadata, and UI — v0.4.0
- ✓ Replace all Craft logos and icons with Kata branding — v0.4.0
- ✓ Update bundle ID to `sh.kata.desktop` — v0.4.0
- ✓ Remove/replace `craft.do` domain references — v0.4.0
- ✓ Configure GitHub releases for distribution — v0.4.0
- ✓ CI/CD workflows for PR validation and releases — v0.4.0
- ✓ Upstream management documentation — v0.4.0

<!-- v0.6.0 Git Integration milestone -->

- ✓ Display current git branch in workspace UI — v0.6.0
- ✓ Show linked PR title and status when one exists — v0.6.0
- ✓ Git status refreshes automatically on file changes and focus — v0.6.0
- ✓ Agent receives git context (branch, PR) per message — v0.6.0
- ✓ Worktree and submodule support — v0.6.0

<!-- v0.6.1 Testing Infrastructure milestone -->

- ✓ Live E2E test suite with real credentials in isolated demo environment — v0.6.1
- ✓ Coverage reporting and CI-enforced thresholds — v0.6.1
- ✓ Auth, chat, session, git, and permission mode E2E tests — v0.6.1
- ✓ Coverage gap analysis with documented rationale — v0.6.1

### Active

<!-- v0.7.0 Always-On Assistant milestone -->

- [ ] Daemon process as Bun subprocess with stdin/stdout JSON communication
- [ ] Plugin contract with registerChannel/registerTool/registerService
- [ ] ChannelAdapter interface with dual ingress (poll/subscribe)
- [ ] Daemon permission mode with explicit tool allowlist
- [ ] Per-channel CraftAgent sessions with compaction
- [ ] SQLite for daemon message queue and task scheduling
- [ ] Slack communication channel adapter
- [ ] Gmail service plugin adapter
- [ ] Daemon manager in Electron main process (spawn, health, IPC)
- [ ] Channel session UI integration

### Future

- [ ] Kata Orchestrator integration
- [ ] Re-enable Slack OAuth with Kata relay server

### Out of Scope

- Kata Context integration — future, not yet defined
- Custom MCP server hosting — use third-party or self-hosted

## Current State

**Current milestone:** v0.7.0 Always-On Assistant
**Last shipped:** v0.6.1 Testing Infrastructure (2026-02-05)

**Codebase:**
- 124 files changed in v0.6.1 (36 code, 88 planning)
- 2,115 lines added, 88 removed (code only)
- 9 phases, 26 plans completed (cumulative across all milestones)

**Tech stack:**
- Electron + React + Vite + shadcn/ui
- Claude Agent SDK for AI execution
- Bun for scripts and testing
- Playwright for E2E testing

**Distribution:**
- macOS: DMG (arm64, x64) with code signing and notarization
- Windows: NSIS installer (x64)
- Linux: AppImage (x64)
- Auto-update via GitHub Releases

## Context

**Origin:** Hard fork of [Craft Agents](https://github.com/AiCodecraft/craft-agents) by Craft Docs Ltd., Apache 2.0 licensed.

**Legal obligations (from TRADEMARK.md):**
1. ✓ Choose a different name not including "Craft" (Kata Agents)
2. ✓ Remove or replace all Craft logos and icons
3. ✓ Update bundle ID from `com.lukilabs.craft-agent`
4. ✓ Remove references to `craft.do` domains

**Preserved files (Apache 2.0 requirement):**
- `LICENSE` — original copyright notice
- `NOTICE` — Craft Docs Ltd. attribution

**Kata ecosystem:**
- **Kata Orchestrator** — Multi-agent framework (Claude Code plugin)
- **Kata Agents** — Native client (this project)
- **Kata Context** — Future memory/context API

**Disabled features (await infrastructure):**
- Slack OAuth (needs HTTPS relay at kata.sh)
- External docs links (needs docs.kata.sh)
- Version manifest API (needs kata.sh endpoint)

## Constraints

- **Compatibility**: Keep all existing features working
- **Dependencies**: Maintain compatibility with Claude Agent SDK and MCP
- **Platforms**: Continue supporting macOS (arm64, x64), Windows (x64), Linux (x64)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bundle ID: `sh.kata.desktop` | Reversed from owned domain kata.sh, avoids conflicts | ✓ Good |
| Keep all existing features | Minimize rebrand scope, ship faster | ✓ Good |
| Apache 2.0 compliance via LICENSE/NOTICE only | Legal minimum, no UI attribution needed | ✓ Good |
| Phase rebrand before Kata integration | Clean separation of concerns, validate rebrand works | ✓ Good |
| GitHub Releases for auto-update | No custom infrastructure needed initially | ✓ Good |
| Graceful disable for Slack OAuth | Keep implementation, show clear error message | ✓ Good |
| Support both KATA_ and CRAFT_ env vars | Backward compatibility for existing users | ✓ Good |
| Use simple-git for git operations | 8.5M weekly downloads, TypeScript-native, async-only | ✓ Good |
| Use gh CLI for PR data | Already authenticated on developer machines, no token management | ✓ Good |
| Workspace-scoped git state (Map) | Each workspace tracks git context independently | ✓ Good |
| Git branch badge in chat input toolbar | Better visibility than sidebar, near user's focus area | ✓ Good |
| PR badge colors match GitHub conventions | Familiar UX for developers (green/purple/red/gray) | ✓ Good |
| XML-tagged git context per user message | Prompt caching friendly, concise, matches existing patterns | ✓ Good |
| chokidar v4 for .git file watching | Native fs.watch unreliable cross-platform | ✓ Good |
| Auto-start git watcher on first GIT_STATUS request | Lazy init avoids overhead for non-git workspaces | ✓ Good |
| Parse .git file gitdir pointer for worktrees | Handles worktrees and submodules transparently | ✓ Good |
| Validate credentials.enc in live fixture | Prevents confusing test failures when credentials missing | ✓ Good |
| Dynamic branch detection in git tests | Demo repo may be on different branch | ✓ Good |
| data-streaming attribute on TurnCard | Allows tests to wait for streaming completion | ✓ Good |
| Skip single-instance lock with KATA_CONFIG_DIR | Enables parallel test runs with different config dirs | ✓ Good |
| Regression thresholds below current coverage | Protect against regression, not enforce aspirational targets | ✓ Good |
| Three-tier coverage gap categorization | Distinguish actionable gaps from integration-test-territory | ✓ Good |

---
*Last updated: 2026-02-07 after v0.7.0 milestone started*
