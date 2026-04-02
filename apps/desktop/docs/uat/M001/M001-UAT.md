# M001: Chat Foundation — UAT Report

**Date:** 2026-04-01
**Milestone:** M001 Chat Foundation
**Method:** Automated via `agent-browser --cdp 9333` connected to Electron's remote debugging port
**Environment:** Dev mode (`apps/desktop`), Electron + Vite renderer, `kata` CLI subprocess via `KATA_BIN_PATH`

---

## Summary

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | App launches, shows onboarding wizard on first run | ✅ PASS | [01-initial-launch.png](01-initial-launch.png) |
| 2 | Onboarding Step 2: Provider selection with status badges | ✅ PASS | [02-onboarding-providers.png](02-onboarding-providers.png) |
| 3 | Onboarding Step 3: API key input with validation UI | ✅ PASS | [03-onboarding-api-key.png](03-onboarding-api-key.png) |
| 4 | Onboarding Step 4: Completion step | ✅ PASS | [04-onboarding-complete.png](04-onboarding-complete.png) |
| 5 | Onboarding dismissed, main chat view visible | ✅ PASS | [05-main-chat-view.png](05-main-chat-view.png) |
| 6 | CLI subprocess connects, bridge status "Ready" | ✅ PASS | [06-chat-ready.png](06-chat-ready.png) |
| 7 | Streaming chat: send message, receive response | ✅ PASS | [07-chat-after-send.png](07-chat-after-send.png) |
| 8 | Settings panel: provider auth with masked keys | ✅ PASS | [08-settings-providers.png](08-settings-providers.png) |
| 9 | Permission mode switching (Explore/Ask/Auto) | ✅ PASS | [09-permission-auto.png](09-permission-auto.png) |
| 10 | New session creation, session list updates | ✅ PASS | [10-new-session.png](10-new-session.png) |
| 11 | No "Craft Agents" references in codebase | ✅ PASS | `grep -ri` returns 0 matches |
| 12 | Unit tests pass (17/17) | ✅ PASS | `bun test` — 17 pass, 0 fail |
| 13 | Error handling: CLI not found shows clear message | ✅ PASS | [05-main-chat-view.png](05-main-chat-view.png) (initial state before fix) |

---

## Detailed Observations

### ✅ Passing

**Onboarding Wizard (S03):**
- 4-step wizard with progress bars renders correctly
- Step 1: Welcome screen with "KATA DESKTOP" branding, "Get started" button
- Step 2: Provider cards for Anthropic, OpenAI, Google, Mistral. Anthropic correctly shows "Configured" badge (read from shared `~/.kata-cli/agent/auth.json`)
- Step 3: API key input with "Validate & Save" and "Skip for now" buttons. Shows path to shared auth.json
- Step 4: "You're all set!" completion screen with "Start chatting"
- Wizard doesn't re-appear on subsequent launches (localStorage persistence)

**Chat (S01):**
- PiAgentBridge spawns `kata --mode rpc` subprocess successfully
- Streaming text response renders in chat (user message → assistant response)
- Bridge status "Ready" visible at bottom of chat
- Chat input enabled when bridge is connected, disabled when crashed

**Session List (S04):**
- Session sidebar shows session count, entries with title (from first message), model badge, relative timestamp, message count
- "+ New Session" creates a fresh conversation, clears chat
- "Refresh" button available

**Settings (S03):**
- Settings panel with Providers / General / Appearance tabs
- 6 providers listed with status indicators (green dot = configured, gray = not configured)
- Anthropic shows masked key (`••••nwAA`), Status: Valid, "Remove key" button
- Keys are never shown in full

**Permission Modes (S02):**
- Explore / Ask / Auto radio buttons render correctly
- Switching modes updates the highlighted state immediately
- Ask mode is default

**App Shell (S01):**
- Split-pane layout: session sidebar (left), chat (center), context pane (right)
- Context pane placeholder: "Planning and kanban views are coming in M002/M003."
- Workspace indicator shows current directory
- Model selector present in toolbar (disabled when no models loaded)

**Error Handling (S05):**
- CLI not found → red error banner: "Agent process crashed" with specific paths checked and install instructions
- "Restart" button available on crash

**Code Quality:**
- Zero "Craft Agents" / `@craft-agent/*` references (`grep -ri` across `src/` and `package.json`)
- 17/17 unit tests passing (PiAgentBridge, RpcEventAdapter, AuthBridge)
- electron-builder config exists, packaging scripts present

### ⚠️ Known Issues (Existing Tickets)

**KAT-2166: Onboarding asks for API key even when provider is "Configured"**
- Step 2 correctly shows Anthropic as "Configured"
- But Step 3 still shows the key input form instead of skipping or pre-filling
- Severity: Low — user can "Skip for now" and the key is already saved

**KAT-2151: True session switching not implemented**
- Session sidebar shows session list with metadata
- Clicking a session doesn't switch the chat context (noted in sidebar: "Session switching is not available yet in Desktop")
- New session creation works; full session restore is deferred

**Model Selector disabled:**
- Shows "No models available" — the `get_available_models` RPC may not be returning data, or the bridge isn't populating the dropdown from the subprocess
- Chat still works (defaults to whatever model the CLI subprocess uses)

### 🔧 Dev Environment Fix Applied

**Tests relied on `KATA_BIN_PATH` pointing to non-executable file.** Fixed tests to save/restore `KATA_BIN_PATH` env var so the "binary not found" crash path is properly isolated. `loader.js` now has `+x` permission for local dev testing.

---

## Test Environment

- **Platform:** macOS, Electron (Chromium renderer)
- **Automation:** `agent-browser --cdp 9333` connected to Electron's CDP port
- **CLI subprocess:** `kata --mode rpc` via `KATA_BIN_PATH` → `loader.js`
- **Auth:** Shared `~/.kata-cli/agent/auth.json` with Anthropic key pre-configured
