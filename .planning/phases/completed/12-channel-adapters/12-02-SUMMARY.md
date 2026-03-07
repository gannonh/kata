---
phase: 12-channel-adapters
plan: 02
subsystem: channels, daemon
tags: [slack-adapter, channel-runner, polling, bot-filter, daemon-entry]
dependency-graph:
  requires: [12-01]
  provides: [SlackChannelAdapter, ChannelRunner, configure_channels-command]
  affects: [12-03, phase-13]
tech-stack:
  added: ["@slack/web-api@7.13.0"]
  patterns: [conversations-history-polling, bot-self-filter, adapter-factory, dependency-injection]
key-files:
  created:
    - packages/shared/src/channels/adapters/slack-adapter.ts
    - packages/shared/src/channels/adapters/index.ts
    - packages/shared/src/channels/__tests__/slack-adapter.test.ts
    - packages/shared/src/daemon/channel-runner.ts
    - packages/shared/src/daemon/__tests__/channel-runner.test.ts
  modified:
    - packages/shared/src/channels/index.ts
    - packages/shared/src/daemon/entry.ts
    - packages/shared/src/daemon/index.ts
    - packages/core/src/types/daemon.ts
    - package.json
decisions:
  - title: "Adapter factory via constructor injection"
    rationale: "Module mocking in bun:test is process-global, causing cross-test contamination. Injecting factory via constructor parameter keeps tests isolated without module mocking side effects."
metrics:
  duration: 7m
  completed: 2026-02-08
---

# Phase 12 Plan 02: Slack Adapter, Channel Runner, and Daemon Entry Wiring Summary

Implemented Slack channel adapter with conversations.history polling, channel-runner for adapter lifecycle orchestration, and wired both into the daemon entry point via a new `configure_channels` command.

## What Was Built

### SlackChannelAdapter (`packages/shared/src/channels/adapters/slack-adapter.ts`)
Poll-based adapter that integrates with `@slack/web-api` WebClient. `configure(token, pollingState?)` initializes the client before `start()`. On start, calls `auth.test()` to resolve bot identity (both `bot_id` and `user_id`) for self-message filtering. Polls `conversations.history` with `oldest` timestamp tracking per channel. Filters messages matching the bot's own `bot_id` or `user_id`. Reverses Slack's newest-first ordering to deliver messages chronologically. Persists polling state via injected callbacks for restart resilience. Reports health status and last error.

### Adapter Registry (`packages/shared/src/channels/adapters/index.ts`)
Factory function `createAdapter(type)` returns a fresh adapter instance for known types (`slack`). Returns null for unknown types.

### ChannelRunner (`packages/shared/src/daemon/channel-runner.ts`)
Orchestrates adapter lifecycle within the daemon. Accepts an optional `AdapterFactory` parameter (defaults to `createAdapter`) for testability. For each enabled config: creates adapter, configures with token and polling state callbacks wired to MessageQueue, creates TriggerMatcher from config patterns, and starts the adapter. `handleMessage` applies trigger filtering, resolves session key via ChannelSessionResolver (using slackChannel metadata for channelSourceId), attaches sessionKey to message metadata, enqueues to MessageQueue, and emits `message_received` event.

### Daemon Entry Wiring (`packages/shared/src/daemon/entry.ts`)
Refactored to use pending commands array pattern with async `handleCommand`. Added `configure_channels` case that builds workspace configs map, stops any existing runner, creates a new ChannelRunner, and starts all adapters. Graceful shutdown calls `stopAll()` on the active runner.

### DaemonCommand Extension (`packages/core/src/types/daemon.ts`)
Added `configure_channels` variant with `workspaces` array containing `workspaceId`, `configs: unknown[]` (to avoid circular dependency), and `tokens: Record<string, string>`. Cast to `ChannelConfig[]` in daemon entry.

### Barrel Exports
`SlackChannelAdapter`, `createAdapter`, and `PollingStateFns` exported from `@craft-agent/shared/channels`. `ChannelRunner` exported from `@craft-agent/shared/daemon`.

## Test Coverage

| Component | Tests | Assertions |
| --- | --- | --- |
| SlackChannelAdapter | 14 | 36 |
| ChannelRunner | 7 | 19 |
| **Total new** | **21** | **55** |

Full suite: 1406 tests across 46 files, zero failures.

## Commits

| Hash | Type | Description |
| --- | --- | --- |
| 1a9819b | feat | SlackChannelAdapter and adapter registry |
| 60e5bfb | feat | ChannelRunner and daemon entry wiring |

## Deviations from Plan

### Adapter factory injection
ChannelRunner accepts an optional `AdapterFactory` constructor parameter instead of only importing `createAdapter` directly. This avoids bun:test module mock contamination that caused SlackChannelAdapter tests to fail when the full suite ran (the channel-runner test's mock of the adapters module replaced SlackChannelAdapter with a dummy class globally). The default factory still uses `createAdapter` from the adapters module, so production behavior is unchanged.

### State object for TypeScript narrowing
Daemon entry uses `const state = { channelRunner: null as ChannelRunner | null }` instead of a `let` variable. TypeScript's control flow analysis doesn't track mutations inside nested async functions, causing the `channelRunner` variable to narrow to `never` after the initial `null` assignment. Wrapping in a state object avoids this.

## Decisions Made

| Decision | Rationale |
| --- | --- |
| Constructor-injected adapter factory | Prevents cross-test contamination from bun:test global module mocking |
| State object for mutable daemon state | Works around TypeScript narrowing limitation with nested function assignments |

## Next Phase Readiness

Plan 12-03 (WhatsApp adapter with Bun compatibility gate) can proceed. The adapter registry supports adding new adapter types by extending the `createAdapter` switch. The ChannelRunner and daemon entry wiring are adapter-agnostic.
