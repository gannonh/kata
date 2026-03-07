# Project State: Kata Agents

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-07)

**Core value:** Developer-centric AI desktop client that understands your git workflow and provides contextual assistance.
**Current focus:** v0.7.0 Always-On Assistant

---

## Current Position

**Milestone:** v0.7.0 Always-On Assistant
**Phase:** 19 — Tech Debt Cleanup
**Plan:** 1 of 1
**Status:** Phase complete
**Last activity:** 2026-02-15 - Completed 19-01-PLAN.md

```
Progress: [████████████████████████] 100% (24 of 24 plans complete across 10 phases)
```

---

## Performance Metrics

**Milestone velocity:**
- v0.4.0: 10 requirements in 2 phases (6 plans)
- v0.6.0: 12 requirements in 5 phases (14 plans)
- v0.6.1: 10 requirements in 2 phases (6 plans) -- 2 days
- v0.7.0: 20 requirements in 10 phases (24 plans)

---

## Accumulated Context

### Key Decisions

See PROJECT.md Key Decisions table for full history.

**v0.7.0 architecture decision (brainstorm 2026-02-07):**
- Hybrid architecture selected over minimal (NanoClaw-style) and gateway (OpenClaw-style)
- Daemon as Bun subprocess of Electron (not WebSocket gateway)
- Plugin contract with 3 registration methods (registerChannel/registerTool/registerService)
- Dual ingress channel adapter (poll/subscribe)
- New `daemon` permission mode with tool allowlist
- SQLite for daemon state, first-party plugins only
- launchd/systemd deferred to v0.8.0+
- Full brainstorm: .planning/brainstorms/2026-02-07T06-16-brainstorm/SUMMARY.md

**Phase 11 Plan 01 decisions:**
- SQLite snake_case columns mapped to camelCase QueuedMessage fields at the dequeue boundary
- Payload stored as JSON TEXT, serialized on enqueue, deserialized on dequeue

**Phase 11 Plan 02 decisions:**
- CONFIG_DIR computed inline in electron main process (no subpath export for config/paths)
- DaemonManager does not auto-start; Phase 12+ triggers start when channels are configured

**Phase 12 Plan 02 decisions:**
- ChannelRunner accepts optional AdapterFactory constructor parameter (avoids bun:test module mock cross-contamination)
- Daemon entry uses state object pattern for mutable ChannelRunner reference (TypeScript narrowing workaround)

**Phase 12 Plan 03 decisions:**
- Baileys compatible with Bun (QR received, connection events fire; ws warnings are edge cases)
- QrCallback observer pattern instead of stored QR state
- stopping flag guards against reconnect loops during shutdown

**Phase 13 Plan 03 decisions:**
- Daemon collects enabledPlugins as union across all workspace arrays; single PluginManager serves all workspaces
- Shutdown order: TaskScheduler, PluginManager, ChannelRunner, MessageQueue
- No ChannelRunner API changes needed; existing adapterFactory parameter reused

**Phase 14 Plan 01 decisions:**
- DaemonManagerState type duplicated inline in shared/types.ts (portable, no cross-boundary import from daemon-manager.ts)
- TrayManager uses nativeImage template on macOS only; regular icon on other platforms
- window-all-closed keeps app alive when daemon is running on all platforms (not just macOS)

**Phase 14 Plan 02 decisions:**
- ChannelSettingsPage uses inline toggle rather than SettingsToggle for row layout with adapter icon
- Channel badge uses adapter-specific Lucide icons (Hash/MessageCircle/Radio)
- Daemon state subscription as standalone useEffect in AppShell for lifecycle isolation
- Channel IPC handlers use synchronous readFileSync/writeFileSync consistent with existing patterns

**Phase 15 Plan 01 decisions:**
- Channel credentials use `channel_credential::{workspaceId}::{channelSlug}` key format, parallel to source credentials
- ChannelRunner resolves tokens from channelSlug (preferred) falling back to sourceSlug (legacy)

**Phase 16 Plan 01 decisions:**
- deliverChannelConfigs accepts credentialManagerGetter parameter (avoids circular dependency)
- Credential resolution: channelSlug preferred, sourceSlug (source_apikey) as legacy fallback
- Empty workspaces array always sent to daemon to clear stale adapters
- enabledPlugins derived from adapter types across enabled configs per workspace

**Phase 16 Plan 02 decisions:**
- No new architectural decisions; follows existing inline form patterns from Phase 14

**Phase 17 Plan 01 decisions:**
- Tasks 2 (consumer loop) and 3 (deliverOutbound) committed together due to compile-time dependency
- workspaceId added to message metadata in ChannelRunner.handleMessage for consumer extraction

**Phase 17 Plan 02 decisions:**
- Used text_complete event for response capture (matches AgentEvent discriminated union)
- Used storedToMessage() for session loading (existing pattern)
- persistSession() for channel/name persistence (updateSessionMetadata doesn't support channel field)
- process_message events excluded from renderer broadcast

**Phase 18 Plan 02 decisions:**
- App-level token stored as separate channel credential with slug `{channel}-app-token`
- SocketModeClient created in start() after polling setup (additive, non-breaking)
- Slash command body typed as Record<string, string> with fallback defaults for optional fields
- socketConnected flag tracks Socket Mode health independently from poll health

**Phase 19 Plan 01 decisions:**
- ChannelOrigin defined in core session.ts alongside Session interface (single source of truth)
- Plugin initializeAll() getCredential returns null (daemon does not yet resolve per-source credentials)
- Health polling interval set to 30s with dedup (emit only on state change)

### Roadmap Evolution

- Phases 15-17 added (2026-02-10): Gap analysis from Phase 14 identified 5 gaps grouped into 3 phases
  - Phase 15: Channel credential storage + session channel attribution (Gaps 1, 4)
  - Phase 16: Channel creation UI + daemon config delivery (Gaps 2, 3)
  - Phase 17: End-to-end message processing (Gap 5)
- Phase 18 added (2026-02-13): Channel fit and finish (markdown stripping, channel awareness, chat lifecycle management, end-user setup docs)
- Phase 19 added (2026-02-15): Tech debt cleanup from v0.7.0 milestone audit

### Active Todos

None.

### Known Blockers

None.

### Technical Debt

**From v0.6.0:**
- GitStatusBadge.tsx exists but unused (inline GitBranchBadge used instead)
- Deprecated GET_GIT_BRANCH channel retained for backward compatibility
- isGitRepository() exported but not called externally

**From v0.6.1:**
- Coverage thresholds set conservatively (regression guard, not aspirational)
- MCP and workspace switching E2E tests deferred
- Mock infrastructure for CI-based chat/MCP testing deferred (issue #49)

---

## Session Continuity

**Last session:** 2026-02-15
**Stopped at:** Completed 19-01-PLAN.md
**Resume file:** None

**Next action:** v0.7.0 milestone complete. All 24 plans across 10 phases executed.

---

_Last updated: 2026-02-15 after completing Phase 19 Plan 01 (tech debt cleanup)_
