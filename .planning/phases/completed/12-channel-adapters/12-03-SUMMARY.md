---
phase: 12-channel-adapters
plan: 03
subsystem: channels
tags: [whatsapp-adapter, baileys, subscribe-adapter, bun-compatibility]
dependency-graph:
  requires: [12-01]
  provides: [WhatsAppChannelAdapter]
  affects: [phase-13]
tech-stack:
  added: ["@whiskeysockets/baileys@7.0.0-rc.9", "@hapi/boom@10.0.1", "pino@10.3.0"]
  patterns: [websocket-subscribe, auto-reconnect, qr-pairing, self-message-filter]
key-files:
  created:
    - packages/shared/src/channels/adapters/whatsapp-adapter.ts
    - packages/shared/src/channels/__tests__/whatsapp-adapter.test.ts
  modified:
    - packages/shared/src/channels/adapters/index.ts
    - packages/shared/src/channels/index.ts
decisions:
  - title: "Proceed with Baileys implementation"
    rationale: "Compatibility test showed Baileys works under Bun (QR code received, connection events fire). Two ws warnings (upgrade, unexpected-response) are edge cases only."
metrics:
  completed: 2026-02-08
---

# Phase 12 Plan 03: WhatsApp Channel Adapter Summary

Validated Baileys compatibility with Bun and implemented WhatsAppChannelAdapter as a subscribe-based channel adapter using Baileys WebSocket connection.

## Execution Path

### Task 1: Baileys + Bun compatibility test (a27e114)
Installed `@whiskeysockets/baileys`, `@hapi/boom`, and `pino`. Ran a live compatibility script that connected to WhatsApp Web via Baileys under Bun. Result: QR code received, connection events fired correctly. Two warnings about missing ws events (`upgrade`, `unexpected-response`) logged but did not prevent operation. Conclusion: Baileys is compatible with Bun for production use.

### Checkpoint: User chose "implement"
Compatibility test passed. Proceeded with WhatsApp adapter implementation.

### Task 3: WhatsAppChannelAdapter (0708179)

## What Was Built

### WhatsAppChannelAdapter (`packages/shared/src/channels/adapters/whatsapp-adapter.ts`)
Subscribe-based adapter using Baileys `makeWASocket`. `configure(authStatePath, onQr?)` stores the auth directory and optional QR callback before `start()`. On start, loads multi-file auth state via `useMultiFileAuthState`, creates socket with `makeCacheableSignalKeyStore`, and registers three event handlers:

- `connection.update`: Sets healthy on open, unhealthy on close. Checks `DisconnectReason.loggedOut` to decide reconnect vs permanent stop. Forwards QR data to configured callback.
- `messages.upsert`: Filters to `type === 'notify'`, skips `fromMe` messages, skips messages without text content. Extracts text from `conversation` or `extendedTextMessage.text`. Builds `ChannelMessage` with JID, participant metadata, and thread reply context from `contextInfo.stanzaId`.
- `creds.update`: Persists credentials via `saveCreds`.

Uses a `stopping` flag to prevent reconnect loops during shutdown.

### Adapter Registry Update (`packages/shared/src/channels/adapters/index.ts`)
Added `case 'whatsapp': return new WhatsAppChannelAdapter()` to `createAdapter`.

### Barrel Exports (`packages/shared/src/channels/index.ts`)
`WhatsAppChannelAdapter` and `QrCallback` type exported from `@craft-agent/shared/channels`.

## Test Coverage

| Component | Tests | Assertions |
| --- | --- | --- |
| WhatsAppChannelAdapter | 15 | 35 |

Full suite: 1421 tests across 47 files, zero failures.

## Commits

| Hash | Type | Description |
| --- | --- | --- |
| a27e114 | chore | Baileys + Bun compatibility test (deps install) |
| 0708179 | feat | WhatsApp channel adapter with Baileys |

## Deviations from Plan

### QR callback via configure()
Plan suggested storing QR data for later retrieval. Implementation uses a `QrCallback` parameter on `configure()` instead. This follows the observer pattern and avoids polling for QR state.

### Stopping flag for reconnect guard
Added `this.stopping` boolean checked before auto-reconnect in `connection.update` handler. Prevents reconnect attempts after explicit `stop()` call, which the plan did not specify.

### Text-only message filtering
Messages without extractable text (images, stickers, etc.) are silently skipped. The plan specified extracting text but did not address non-text messages.

## Decisions Made

| Decision | Rationale |
| --- | --- |
| Proceed with Baileys (not defer) | Compatibility test confirmed Baileys works under Bun with minor ws warnings |
| QrCallback instead of stored QR state | Observer pattern; avoids stale state and polling |
| stopping flag on reconnect | Prevents reconnect loop when stop() is called during a disconnection cycle |

## Phase 12 Completion

All three plans in Phase 12 are complete:
- 12-01: TriggerMatcher, ChannelSessionResolver, polling state persistence
- 12-02: SlackChannelAdapter, ChannelRunner, daemon entry wiring
- 12-03: WhatsAppChannelAdapter with Baileys
