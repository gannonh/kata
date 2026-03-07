---
phase: 17-end-to-end-message-processing
plan: 01
subsystem: daemon-message-processing
tags: [daemon, ipc, message-queue, channel-adapters, outbound-delivery]
requires:
  - phase-11 (message queue)
  - phase-12 (channel runner, adapters)
provides:
  - daemon inbound message consumer loop with concurrency control
  - daemon outbound delivery pipeline via ChannelRunner
  - process_message / message_processed IPC protocol
  - adapter send() interface and implementations
affects:
  - phase-17-02 (main process handler for process_message events)
tech-stack:
  added: []
  patterns:
    - consumer timer with concurrency semaphore
    - crash recovery via status reset query
    - fire-and-forget outbound delivery with queue tracking
key-files:
  created: []
  modified:
    - packages/core/src/types/daemon.ts
    - packages/shared/src/channels/types.ts
    - packages/shared/src/channels/index.ts
    - packages/shared/src/channels/adapters/slack-adapter.ts
    - packages/shared/src/channels/adapters/whatsapp-adapter.ts
    - packages/shared/src/daemon/entry.ts
    - packages/shared/src/daemon/channel-runner.ts
decisions:
  - Tasks 2 and 3 committed together because entry.ts calls deliverOutbound() which requires the ChannelRunner method to exist for typecheck
metrics:
  duration: 4m15s
  completed: 2026-02-10
---

# Phase 17 Plan 01: Daemon Message Processing Pipeline Summary

Daemon-side consumer loop with concurrency-limited inbound processing, outbound response delivery via adapter send(), and crash recovery.

## What Was Done

### IPC Type Extensions

Added `process_message` variant to `DaemonEvent` (daemon tells main process to process a message) and `message_processed` variant to `DaemonCommand` (main process returns the agent response). These form the request/response protocol for message processing.

### OutboundMessage Type and Adapter send()

Added `OutboundMessage` interface to `channels/types.ts` with `channelId`, `content`, optional `threadId`, and optional `metadata`. Added optional `send()` method to `ChannelAdapter` interface. Implemented `send()` on both adapters:

- `SlackChannelAdapter.send()` calls `WebClient.chat.postMessage()` with channel, text, and thread_ts
- `WhatsAppChannelAdapter.send()` calls `sock.sendMessage()` with JID and text content

### Daemon Consumer Loop

The daemon entry now includes:

1. **Recovery query** on startup: resets any messages stuck in `processing` status back to `pending` (handles previous crash)
2. **Consumer timer** (1s interval): dequeues pending inbound messages and emits `process_message` events
3. **Concurrency limiter**: tracks active processing count, caps at 3 concurrent messages
4. **message_processed handler**: marks inbound message processed, looks up original message to extract reply metadata, enqueues outbound message, delivers via `ChannelRunner.deliverOutbound()`, marks outbound as processed/failed

### ChannelRunner deliverOutbound()

Added `deliverOutbound(channelSlug, message)` method that looks up the running adapter by slug and calls its `send()` method. Throws clear errors for missing adapter or unsupported send.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added workspaceId to message metadata in ChannelRunner.handleMessage**

- **Found during:** Task 2
- **Issue:** The consumer loop needs `workspaceId` from the inbound message payload metadata, but `handleMessage` only stored `sessionKey` on the metadata before enqueueing
- **Fix:** Added `msg.metadata.workspaceId = workspaceId` alongside the existing `msg.metadata.sessionKey = sessionKey` assignment
- **Files modified:** packages/shared/src/daemon/channel-runner.ts
- **Commit:** cc968db

**2. [Rule 3 - Blocking] Merged Tasks 2 and 3 into single commit**

- **Found during:** Task 2
- **Issue:** entry.ts calls `state.channelRunner.deliverOutbound()` which requires the method to exist on ChannelRunner for TypeScript compilation. Task 3 (deliverOutbound) must exist before Task 2 can typecheck.
- **Fix:** Implemented deliverOutbound in the same commit as the entry.ts consumer loop
- **Commit:** cc968db

**3. [Rule 1 - Bug] Added explicit `unknown` type to catch parameter**

- **Found during:** Task 2
- **Issue:** TypeScript strict mode flagged implicit `any` type on the `.catch((err) => ...)` callback parameter
- **Fix:** Changed to `.catch((err: unknown) => ...)`
- **Commit:** cc968db

## Verification

- `bun run typecheck:all` passes across all 4 packages
- `bun test packages/shared` passes all 809 tests with 0 failures

## Commits

| Commit | Description |
|--------|-------------|
| d2778df | feat(17-01): add IPC types for message processing and adapter send methods |
| cc968db | feat(17-01): add message consumer loop, recovery, and outbound delivery to daemon |

## Next Phase Readiness

Plan 17-02 can proceed. It will need to:
- Handle `process_message` events in the Electron main process
- Route messages to agent sessions for processing
- Send `message_processed` commands back to the daemon with the agent response
