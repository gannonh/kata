---
phase: 12-channel-adapters
plan: 01
subsystem: channels
tags: [trigger-matcher, session-resolver, polling-state, sqlite, tdd]
dependency-graph:
  requires: [phase-10, phase-11]
  provides: [TriggerMatcher, ChannelSessionResolver, polling-state-persistence]
  affects: [12-02, 12-03]
tech-stack:
  added: []
  patterns: [regex-trigger-matching, sha256-session-keys, sqlite-upsert]
key-files:
  created:
    - packages/shared/src/channels/trigger-matcher.ts
    - packages/shared/src/channels/session-resolver.ts
    - packages/shared/src/channels/__tests__/trigger-matcher.test.ts
    - packages/shared/src/channels/__tests__/session-resolver.test.ts
  modified:
    - packages/shared/src/channels/index.ts
    - packages/shared/src/daemon/message-queue.ts
    - packages/shared/src/daemon/__tests__/message-queue.test.ts
decisions: []
metrics:
  duration: 3m
  completed: 2026-02-07
---

# Phase 12 Plan 01: TriggerMatcher, ChannelSessionResolver, and Polling State Summary

TDD-driven implementation of shared channel infrastructure: regex-based message filtering, SHA-256 thread-to-session mapping, and SQLite polling state persistence for adapter restart resilience.

## What Was Built

### TriggerMatcher (`packages/shared/src/channels/trigger-matcher.ts`)
Class that compiles an array of regex pattern strings with case-insensitive flag. Empty patterns array matches all messages (match-all default). Multiple patterns use any-match semantics. Invalid regex patterns throw descriptive errors with the original pattern string in the message.

### ChannelSessionResolver (`packages/shared/src/channels/session-resolver.ts`)
Static `resolveSessionKey` method that produces deterministic session keys in the format `daemon-{channelSlug}-{12 hex chars of SHA-256}`. Hash input is `{channelSlug}:{workspaceId}:{threadKey}` where threadKey falls back to channelSourceId when threadId is undefined.

### Polling State Persistence (`packages/shared/src/daemon/message-queue.ts`)
New `polling_state` table in MessageQueue with composite primary key `(adapter_id, channel_source_id)`. Two new methods: `getPollingState` returns `string | null`, `setPollingState` upserts via `INSERT OR REPLACE`. Prepared statements follow the existing MessageQueue pattern.

### Barrel Exports (`packages/shared/src/channels/index.ts`)
Both `TriggerMatcher` and `ChannelSessionResolver` are runtime exports (not type-only) from `@craft-agent/shared/channels`.

## Test Coverage

| Component | Tests | Assertions |
| --- | --- | --- |
| TriggerMatcher | 7 | 14 |
| ChannelSessionResolver | 8 | 12 |
| MessageQueue polling state | 4 | 7 |
| **Total new** | **19** | **33** |

Full suite: 1385 tests across 44 files, zero failures.

## Commits

| Hash | Type | Description |
| --- | --- | --- |
| b2c59cf | test | Add failing tests for TriggerMatcher |
| 246e657 | feat | Implement TriggerMatcher class |
| 749aee6 | test | Add failing tests for ChannelSessionResolver |
| 50561a8 | feat | Implement ChannelSessionResolver class |
| 39d70d7 | feat | Add polling state persistence to MessageQueue |

## Deviations from Plan

None. Plan executed exactly as written.

## Decisions Made

None. Implementation followed the plan specification directly.

## Next Phase Readiness

Plan 12-02 (Slack adapter, channel-runner, daemon entry wiring) can proceed immediately. The building blocks it depends on are in place:
- TriggerMatcher for filtering inbound Slack messages by configured patterns
- ChannelSessionResolver for mapping Slack threads to daemon sessions
- Polling state persistence for tracking `oldest` timestamp across daemon restarts
