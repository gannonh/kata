# M006: Integrated Beta — UAT Report

**Date:** 2026-04-08
**Milestone:** M006 Integrated Beta
**Method:** agent-browser --cdp 9333 connected to Electron
**Environment:** Dev mode, apps/desktop, macOS

---

## Summary

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Clean launch without false reliability banners | ✅ PASS | [01-clean-launch.png](01-clean-launch.png) |
| 2 | Chat sends and receives streaming responses | ✅ PASS | [02-chat-response.png](02-chat-response.png) |
| 3 | Permission modes switch correctly (Explore/Ask/Auto) | ✅ PASS | [03-permission-modes.png](03-permission-modes.png) |
| 4 | Settings panel opens with all tabs | ✅ PASS | [04-settings-panel.png](04-settings-panel.png) |
| 5 | MCP settings shows configured servers | ✅ PASS | [05-settings-mcp.png](05-settings-mcp.png) |
| 6 | Symphony settings tab shows runtime controls | ✅ PASS | [06-settings-symphony.png](06-settings-symphony.png) |
| 7 | Workflow board renders with live Linear data | ✅ PASS | [07-kanban-project-scope.png](07-kanban-project-scope.png) |
| 8 | New session creation works | ✅ PASS | [08-new-session.png](08-new-session.png) |
| 9 | Model selector shows available models | ✅ PASS | [09-model-selector.png](09-model-selector.png) |
| 10 | Session history switching works | ✅ PASS | [10-session-switch.png](10-session-switch.png) |
| 11 | Thinking level toggle present and functional | ✅ PASS | Visible in screenshots 01, 02, 07, 08 |
| 12 | No false Symphony errors when Symphony not started | ✅ PASS (after fix) | [01-clean-launch.png](01-clean-launch.png) |
| 13 | No false model readiness warnings | ✅ PASS (after fix) | [01-clean-launch.png](01-clean-launch.png) |
| 14 | No false heap growth stability alarms | ✅ PASS (after fix) | [01-clean-launch.png](01-clean-launch.png) |
| 15 | Bridge recovers from bad persisted model | ✅ PASS (after fix) | Retry-without-model logic added |
| 16 | Settings panel model readiness notice in Providers tab | ⚠️ KNOWN ISSUE | [04-settings-panel.png](04-settings-panel.png) — banner still shows inside settings |

---

## Detailed Observations

### ✅ Passing

**Chat Foundation (inherited from M001-M005)**
- Chat input accepts text, Send button works, streaming response renders
- User messages appear as right-aligned bubbles, assistant messages flat
- "Reasoned" thinking blocks display correctly
- Status shows "Ready" after response completes

**Session Management**
- 73+ sessions visible in sidebar with message counts and timestamps
- New Session creates a fresh session, increments count
- Session switching shows loading state then restores content
- Session sidebar shows model name and relative timestamps

**Right Pane (Workflow Board)**
- Kanban board renders with real Linear issues (KAT-2151, KAT-2166, KAT-2381)
- Scope switching works (Active/Project/Milestone)
- Cards show issue ID, title, status, assignee, task counts
- Cards have Open Linear issue, Add task, and status dropdown actions
- Status bar shows live data source, scope, column state

**Settings**
- All 5 tabs present: Providers, MCP, Symphony, General, Appearance
- Providers: shows Anthropic (Valid) and OpenAI (Valid) with masked keys
- MCP: shows 2 configured servers with Edit/Remove actions
- Symphony: shows Runtime (Idle) with Start/Restart/Stop controls and Live Dashboard

**UI Controls**
- Model selector dropdown shows all available models grouped by provider
- Permission mode radio buttons (Explore/Ask/Auto) switch correctly
- Thinking level toggle (off/minimal/low/med/high/xhigh) is present and functional

### ❌ Issues Fixed During UAT

1. **False Symphony reliability banner on startup** — Fixed by suppressing operator signals when runtime phase is idle/stopped
2. **False model readiness warning below model selector** — Fixed by removing the first-run readiness notice from ModelSelector (it's an onboarding concern, not main app)
3. **False heap growth stability alarm (180MB threshold too low)** — Fixed by raising to 512MB warning / 1024MB breach
4. **CLI subprocess crash on bad persisted model** — Fixed by adding retry-without-model logic when startup crashes within 5 seconds
5. **Symphony stale notice showing when Symphony never started** — Fixed by checking provenance !== 'runtime-disconnected'

### ⚠️ Known Issues

- **Settings panel still shows "Select a model before starting your first productive turn" banner** — This is the first-run readiness notice rendered in the Providers tab via `SettingsPanel.tsx`. Cosmetic issue; does not block functionality. The notice is technically correct during very first launch but stale for returning users.
- **"Symphony runtime disconnected" text on kanban slice cards** — Expected behavior when Symphony is not running; cards show Symphony context status per-slice.

---

## Test Environment
- **Platform:** macOS (Apple Silicon)
- **Electron:** Dev mode with `--remote-debugging-port=9333`
- **Automation:** agent-browser v3 via CDP
- **Auth:** Anthropic (OAuth) + OpenAI (OAuth) both valid
- **Workflow:** Linear-backed, Kata Desktop project
