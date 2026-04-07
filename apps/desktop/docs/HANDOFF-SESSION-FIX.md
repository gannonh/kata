# Session Bug Handoff

## Branch: `fix/session-issues`

## The Bug

"New Session" in Desktop shows old session content instead of an empty chat. The sidebar shows the new session placeholder correctly, but the chat area displays messages from the previous session.

## Root Cause

The `hydrateSessionHistoryAtom` in `src/renderer/atoms/session.ts` replays session history events into `messagesAtom` via `applyChatEventAtom`. React 19 Strict Mode double-invokes the `useEffect` in `AppShell.tsx` that calls `initializeSessionsAtom`, causing history to be replayed twice (duplicate `history:user:N` keys in console). But the real problem is:

When "New Session" is clicked:
1. `createSessionAtom` sets `currentSessionIdAtom` to the new ID
2. `resetChatStateAtom` sets `messagesAtom` to `[]`
3. But the live `window.api.onChatEvent` listener in `ChatPanel.tsx` (line ~37) continues receiving RPC events from the CLI subprocess
4. The CLI subprocess's `new_session` RPC creates a new session, but **the event stream from the old session is not flushed** — pending events from the old session context still arrive and get applied to `messagesAtom` via `applyChatEventAtom`

The `onChatEvent` listener has no session awareness — it applies ALL incoming events to the current chat state regardless of which session produced them.

## Evidence

- Console shows `Encountered two children with the same key, 'history:user:1'` through `history:user:92` on both initial load AND after New Session
- The `MessageList.tsx:25` and `MessageList.tsx:41` components are the source — they render messages with `history:user:N` keys that collide when history is replayed twice
- The `[createSessionAtom]` console.log confirms the session IS created and `resetChatStateAtom` IS called — but old messages reappear

## What Was Changed on This Branch (Session-Related)

1. **`src/renderer/atoms/session.ts` — `applySessionListResponseAtom`**: Changed to preserve placeholder sessions in the list when the disk response doesn't include the new session yet. Checks `previousList` before overwriting.

2. **`src/renderer/atoms/session.ts` — `createSessionAtom`**: 
   - Removed the `refreshSessionListAtom` call after create (was racing and overwriting `currentSessionIdAtom`)
   - Injects a placeholder "New session" entry into `sessionListAtom` immediately
   - Sets `currentSessionIdAtom` before `resetChatStateAtom`

3. **Main process (`src/main/session-manager.ts`, `src/main/ipc.ts`, `src/main/pi-agent-bridge.ts`)**: Untouched from main — all session filtering changes were reverted.

## What Needs to Happen

### Option A: Session-scoped event filtering (correct fix)
The `onChatEvent` listener in `ChatPanel.tsx` needs to know which session an event belongs to. The RPC bridge should include a session ID in each event. Events from the old session should be dropped after `new_session`.

This requires changes in:
- `src/main/rpc-event-adapter.ts` — include session ID in adapted events
- `src/main/ipc.ts` — pass current session ID from bridge state
- `src/renderer/components/chat/ChatPanel.tsx` — filter events by current session ID
- `src/shared/types.ts` — add `sessionId` to `ChatEvent`

### Option B: Gate on session creating flag (quick fix)
While `sessionCreatingAtom` is true, have the `onChatEvent` listener in `ChatPanel.tsx` drop all incoming events. This prevents the old session's buffered events from repopulating the chat.

In `ChatPanel.tsx`:
```tsx
const unsubscribeChatEvents = window.api.onChatEvent((event) => {
  // Drop events while a session switch is in progress
  if (get(sessionCreatingAtom)) return
  applyChatEvent(event)
  ...
})
```

This requires making `sessionCreatingAtom` accessible from `ChatPanel` (it's in session.ts, ChatPanel is in chat/).

### Option C: Revert session changes entirely
Revert all session atom changes back to what's on `origin/main`. The original bug ("New Session drops to random session") existed before this branch too — it's the `sessions[0]` fallback in `applySessionListResponseAtom`. The kanban/MCP/UI fixes on this branch are the real value; the session fix can be done properly in a follow-up.

To revert only session changes:
```bash
git checkout origin/main -- apps/desktop/src/renderer/atoms/session.ts
```

## Files to Inspect

- `apps/desktop/src/renderer/atoms/session.ts` — all session atom logic (lines 37-240)
- `apps/desktop/src/renderer/components/chat/ChatPanel.tsx` — the `onChatEvent` listener (line ~37)
- `apps/desktop/src/renderer/atoms/chat.ts` — `resetChatStateAtom` and `applyChatEventAtom`
- `apps/desktop/src/main/ipc.ts` — `sessionNew` handler (line ~760)
- `apps/desktop/src/renderer/components/chat/MessageList.tsx` — where duplicate key warnings originate (line 25, 41)

## Test Commands

```bash
cd apps/desktop
npx tsc --noEmit          # TypeScript check
bun run test              # Unit tests (388 pass currently)
bun run build:main        # Rebuild main process after changes
# Renderer changes are picked up by Vite hot reload
```

## Current State of the Branch

- All M005 UAT fixes are committed and pushed
- MCP fixes committed (no more server spawning)
- Session atom has the placeholder injection + no-refresh-after-create logic
- Tests pass (388)
- The session bug manifests in production builds too (not just dev/HMR)
