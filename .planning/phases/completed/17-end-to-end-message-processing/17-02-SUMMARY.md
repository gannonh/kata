---
phase: 17-end-to-end-message-processing
plan: 02
subsystem: electron-main
tags: [daemon, sessions, agent, ipc]
requires:
  - 17-01 (DaemonEvent/DaemonCommand types, consumer loop, deliverOutbound)
provides:
  - SessionManager.processDaemonMessage() for daemon-to-agent message routing
  - SessionManager.sendMessageHeadless() for IPC-free agent execution
  - process_message event handler in index.ts for daemon round-trip
affects:
  - apps/electron/src/main/sessions.ts
  - apps/electron/src/main/index.ts
tech-stack:
  added: []
  patterns:
    - headless agent execution (no renderer IPC)
    - two-phase session lookup (in-memory then persisted)
    - async event handler with promise-based response
key-files:
  created: []
  modified:
    - apps/electron/src/main/sessions.ts
    - apps/electron/src/main/index.ts
decisions:
  - Used text_complete event (not assistant message.content) for response capture, matching the AgentEvent discriminated union from chat generator
  - Used storedToMessage() helper for session loading (existing pattern from ensureMessagesLoaded)
  - persistSession() used for channel/name persistence instead of updateSessionMetadata (which doesn't support channel field)
  - process_message events excluded from renderer broadcast (internal daemon-main handshake)
metrics:
  duration: ~4.5m
  completed: 2026-02-10
---

# Phase 17 Plan 02: Main Process Message Handler Summary

SessionManager wired to process daemon channel messages headlessly and return responses via DaemonManager commands.

## What Was Built

### sendMessageHeadless() (sessions.ts)
Runs CraftAgent.chat() without emitting IPC events to the renderer. Iterates the async generator, captures the last `text_complete` event as the response, loads sources, and persists session state after execution.

### processDaemonMessage() (sessions.ts)
Creates or reuses sessions by matching sessionKey against session names. Two-phase lookup: checks in-memory sessions first (fast path), then falls back to persisted sessions on disk (cold start after app restart). New sessions are created with safe permission mode, workspace default working directory, and channel attribution (adapter, slug, displayName). Delegates to sendMessageHeadless() for agent execution.

### process_message event handler (index.ts)
Handles process_message DaemonEvents in the onEvent callback. Calls processDaemonMessage on SessionManager and sends message_processed DaemonCommand back with response text on success, or error string on failure. process_message events are excluded from the renderer window broadcast (internal round-trip only).

## End-to-End Flow (Plans 01 + 02)

1. Daemon dequeues inbound message from SQLite queue
2. Daemon emits process_message event to main process via stdout
3. Main process creates/reuses session and runs agent headlessly
4. Main process sends message_processed command back via stdin
5. Daemon marks message processed, enqueues outbound, delivers via adapter

## Deviations

None. Plan executed as written.
