# Phase 17 Plan 03: Channel Badge Fix + Daemon Lifecycle Summary

Channel sessions now display the correct adapter icon (Hash for Slack, MessageCircle for WhatsApp) and the daemon auto-starts/stops when channels are toggled.

## Tasks

### Task 1: Resolve adapter type from channel config in process_message handler
- **File:** `apps/electron/src/main/index.ts`
- **Commit:** `5a82c18`
- **What:** Added `resolveAdapterType()` helper that reads `config.adapter` from the channel's `config.json` on disk. Updated `processDaemonMessage` call to pass the resolved adapter type (e.g., "slack") instead of the channel slug (e.g., "slack-kata-agent"). Added `readFileSync` and `getWorkspaceByNameOrId` imports.

### Task 2: Auto-start/stop daemon on channel enable/disable toggle
- **File:** `apps/electron/src/renderer/pages/settings/ChannelSettingsPage.tsx`
- **Commit:** `28593f6`
- **What:** Rewrote `handleToggleChannel` to use `setChannels` callback form. After computing updated channel list, checks if daemon should auto-start (first channel enabled, daemon stopped) or auto-stop (last channel disabled, daemon running). Added `daemonState` to `useCallback` dependency array. Fire-and-forget IPC calls with error logging.

## Deviations

None - plan executed exactly as written.

## Verification

- `bun run typecheck:all` passes
- `bun run lint:electron` passes (0 errors, pre-existing warnings only)
- `resolveAdapterType` reads `config.adapter` from channel's `config.json`
- `CHANNEL_ICONS` keys (`slack`, `whatsapp`) match resolved adapter values
- Toggle triggers daemon start/stop based on enabled channel count

## Duration

~1m 40s
