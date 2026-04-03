# RPC Event Adapter Overhaul — Design Spec

**Date:** 2026-04-01  
**Issue:** KAT-2223  
**Status:** Approved  

---

## Problem Summary

`RpcEventAdapter` was built against assumed RPC event shapes. Real CLI output (`/tmp/two-turn-capture.jsonl`, 71 events, 2 turns) exposes five root bugs that corrupt chat rendering in multi-turn sessions.

---

## Root Causes (verified against real capture)

### Bug 1 — ID mismatch → empty "ASSISTANT" block

`message_start` has no `id` field. The adapter assigns a counter ID (`message:1`). Then `message_update` events carry `message.responseId = "msg_01Rexz..."` and `resolveAssistantMessageId` returns *that ID*, not `message:1`. Text deltas are applied to a second message entry that gets auto-created. `message:1` stays empty and renders as an empty "ASSISTANT" block.

**Fix:** `resolveAssistantMessageId` always returns `currentAssistantMessageId`. It never inspects `message.responseId` from update/end events — that field is irrelevant for ID resolution.

### Bug 2 — `message_end` for wrong roles overwrites assistant content

`message_end(toolResult)` is emitted after tool execution. Its `message.content` is the full tool result (e.g., the electron SKILL.md file). The adapter resolves this to `currentAssistantMessageId` and emits a `message_end` with `text = <3000 lines of skill file>`. The chat atom then overwrites the assistant response with the skill file content.

Same issue for `message_end(user)` on turn boundaries.

**Fix:** In the `message_end` handler, check `message.role`. Only emit a `ChatEvent` when `role === 'assistant'`. Return `[]` for `toolResult`, `user`, and any other role.

### Bug 3 — `tool_execution_end` has no `args` → empty file path in tool card

`tool_execution_start` carries `args: { path: "/Users/.../electron/SKILL.md" }`. `tool_execution_end` carries no `args` field at all (not null, just absent). `extractToolArgs('read', undefined)` returns `{ path: '' }`. `extractReadResult` computes `result.path = '' ?? args.path = ''`. `FileReadCard` shows `"read · "`.

**Fix:** Add `private toolArgsCache = new Map<string, ToolArgs>()`. On `tool_execution_start`, store extracted args keyed by `toolCallId`. On `tool_execution_end`, if `event.args` is absent/null, fall back to cached args before calling `extractToolResult`.

### Bug 4 — Multiple `message_start(assistant)` per turn → extra ghost entries

Turn 2 pattern from real capture:
1. `message_start(assistant)` — thinking + toolCall phase
2. `tool_execution_start/end`
3. `message_start(toolResult)` — tool result delivery
4. `message_start(assistant)` — final text response phase

Each `message_start(assistant)` currently creates a new chat entry. The first thinking+tool phase entry produces a visible but (after fix 1) empty assistant bubble above the tool cards.

**Fix:** Add `private currentAssistantMessageHadContent = false`. When `message_start(assistant)` arrives:
- If `!hadContent`: reuse `currentAssistantMessageId` (same ID, chat atom's `existing` guard skips re-creation)
- If `hadContent`: assign a new counter ID

Set `hadContent = true` when a `text_delta` or `thinking_delta` is emitted. Reset to `false` when a new ID is assigned.

### Bug 5 — Thinking events silently dropped

`message_update:thinking_start/delta/end` events carry the model's internal reasoning. Currently the adapter emits nothing for these. The issue requests a collapsible thinking block.

**Fix:** Add three new `ChatEvent` types and adapter handlers to emit them.

---

## Design

### 1. New ChatEvent Types (`shared/types.ts`)

Add to the `ChatEvent` union:

```typescript
| { type: 'thinking_start'; messageId: string }
| { type: 'thinking_delta'; messageId: string; delta: string }
| { type: 'thinking_end'; messageId: string; content: string }
```

`ChatMessageView` gains two new fields:

```typescript
export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming: boolean
  thinking?: string       // accumulated thinking text
  isThinking: boolean     // true while thinking_delta stream is open
}
```

### 2. Adapter Rewrite (`rpc-event-adapter.ts`)

#### Stateful fields

```typescript
private messageIdCounter = 0
private currentAssistantMessageId: string | null = null
private currentAssistantMessageHadContent = false
private toolArgsCache = new Map<string, ToolArgs>()
```

#### `message_start` handler

```
role = extractRole(event.message)
if role !== 'assistant' and role !== 'user' → return []
if role === 'user':
  messageId = `message:${++counter}`
  return [{ type: 'message_start', role: 'user', messageId }]
if role === 'assistant':
  if !hadContent:
    reuse currentAssistantMessageId (assign one if null)
  else:
    assign new counter ID, reset hadContent
  return [{ type: 'message_start', role: 'assistant', messageId }]
```

#### `message_update` handler

```
type = event.assistantMessageEvent?.type
switch type:
  'text_delta':
    delta = event.assistantMessageEvent.delta
    if delta is non-empty:
      hadContent = true
      emit text_delta with currentAssistantMessageId
  'thinking_start':
    emit thinking_start with currentAssistantMessageId
  'thinking_delta':
    delta = event.assistantMessageEvent.delta
    if delta is non-empty:
      hadContent = true
      emit thinking_delta with currentAssistantMessageId
  'thinking_end':
    content = event.assistantMessageEvent.content ?? ''
    emit thinking_end with currentAssistantMessageId
  all other types (toolcall_start/delta/end, text_start/end):
    return []
```

#### `message_end` handler

```
role = extractRole(event.message)
if role !== 'assistant' → return []
text = extractText(event.message)
emit message_end with currentAssistantMessageId
handle stopReason: 'error' as before
```

#### `tool_execution_start` handler

```
extract args
store in toolArgsCache[toolCallId]
emit tool_start
```

#### `tool_execution_end` handler

```
rawArgs = event.args ?? toolArgsCache.get(toolCallId) ?? null
args = extractToolArgs(toolName, rawArgs)
result = extractToolResult(toolName, args, event.result)
emit tool_end
(do NOT clear cache — keep for debugging; cache is per-instance and short-lived)
```

### 3. Chat Atom (`atoms/chat.ts`)

`applyChatEventAtom` handles three new cases:

```typescript
case 'thinking_start': {
  // Mark the message as thinking-in-progress
  update message where id === event.messageId:
    isThinking = true
  return
}

case 'thinking_delta': {
  // Accumulate thinking text
  update message where id === event.messageId:
    thinking = (existing.thinking ?? '') + event.delta
  return
}

case 'thinking_end': {
  // Finalize — use event.content as authoritative text if available
  update message where id === event.messageId:
    thinking = event.content || existing.thinking
    isThinking = false
  return
}
```

`appendUserMessageAtom`: add `isThinking: false` to the new message object (default value for the new field).

`message_start` case: add `isThinking: false` to the new message object.

### 4. ThinkingBlock Component (`components/chat/ThinkingBlock.tsx`)

A collapsible card rendered above the text bubble for assistant messages with thinking content.

- **Open by default** while `isThinking === true`
- **Auto-collapses** when `isThinking` transitions to `false` (thinking stream ends)
- **Plain text** rendering (not markdown — thinking is raw internal reasoning)
- **Trigger label**: "Thinking" while streaming, "Thought for N words" when done
- Visually distinct from tool cards: amber/warm tint, italic text, smaller font

```tsx
interface ThinkingBlockProps {
  content: string
  isThinking: boolean
}
```

Uses Radix `Collapsible`. Controlled open state: `isOpen` defaults to `isThinking`, transitions to `false` on first render where `isThinking` becomes `false`.

### 5. MessageList Update (`components/chat/MessageList.tsx`)

Two changes:

1. **Render thinking blocks**: For assistant messages with `thinking` content (non-empty string or `isThinking === true`), render `<ThinkingBlock>` immediately before the text bubble within the same `<article>`.

2. **Filter ghost entries**: Add guard to skip rendering assistant message bubbles where `content === ''` and `streaming === false` and `!thinking`. These are coalesced-away entries that may still exist in state from the counter-ID period. (Belt-and-suspenders on top of the root fix.)

```tsx
{message.role === 'assistant' && (message.thinking || message.isThinking) && (
  <ThinkingBlock content={message.thinking ?? ''} isThinking={message.isThinking} />
)}
```

### 6. FileReadCard Defensive Fix (`components/chat/FileReadCard.tsx`)

Change:
```typescript
const filePath = asString(result?.path) ?? asString(args?.path) ?? 'unknown-file'
```
To:
```typescript
const filePath = (asString(result?.path) || asString(args?.path)) ?? 'unknown-file'
```

This ensures an empty string `result.path` falls through to `args.path` rather than being accepted as a valid path. Belt-and-suspenders — the root fix is in the adapter.

---

## Files Changed

| File | Nature of change |
|---|---|
| `src/main/rpc-event-adapter.ts` | Rewrite: ID coalescing, role filtering on message_end, args cache, thinking event emission |
| `src/shared/types.ts` | Add `thinking_start/delta/end` ChatEvents; add `thinking`/`isThinking` to `ChatMessageView` |
| `src/renderer/atoms/chat.ts` | Handle 3 new event types; `isThinking` field initialization |
| `src/renderer/components/chat/ThinkingBlock.tsx` | New component |
| `src/renderer/components/chat/MessageList.tsx` | Render ThinkingBlock; filter ghost entries |
| `src/renderer/components/chat/FileReadCard.tsx` | `||` fallback for empty path |
| `src/main/__tests__/rpc-event-adapter.test.ts` | New tests with real-capture event sequences |

**Not changed:** `ToolCallCard.tsx`, `StreamingMessage.tsx`, `WriteCard.tsx`, `BashOutputCard.tsx`, `FileEditCard.tsx`.

---

## Test Coverage Plan

### Adapter unit tests (new group: "Real RPC event shapes")

- **Turn 1 (text only)**: Feed `message_start(assistant)` → N × `message_update:text_delta` → `message_end(assistant)`. Verify all deltas use the same messageId; message_end uses same ID.
- **Turn 2 (thinking + tool + text)**: Feed full real turn-2 sequence. Verify:
  - `thinking_start/delta/end` emitted with correct messageId
  - `tool_start` has `args.path = "/Users/gannonhall/.agents/skills/electron/SKILL.md"`
  - `tool_end` also has path (from cache)
  - Second `message_start(assistant)` gets a **new** counter ID (hadContent=true because thinking_delta was emitted)
  - Final text response text_deltas use the same messageId
- **`message_end(toolResult)` → nothing**: Feed `message_end` with `role: 'toolResult'`. Expect `[]`.
- **`message_end(user)` → nothing**: Expect `[]`.
- **Absent args on tool_end**: Feed `tool_execution_start` with path arg, then `tool_execution_end` with no `args`. Verify result.path is populated.
- **Thinking stream**: Verify `thinking_delta` sets `hadContent = true` (subsequent `message_start` gets new ID).

### Chat atom integration test

Feed all 71 events from real capture through `adapter.adapt()` then `applyChatEventAtom`. Assert final `messagesAtom` state:
- Exactly 2 user message entries
- Exactly 3 assistant entries: turn-1 response, turn-2 thinking+tool entry (with thinking text), turn-2 text response
- No entries with `content === '' && !streaming && !thinking`  
- Tool call entry has `args.path` = electron SKILL.md path
- Thinking entry has non-empty `thinking` string and `isThinking === false`

---

## What Is Not In Scope

- Session switching (KAT-2151) — separate issue
- `extension_ui_request` routing improvements — no bugs found in capture
- Rendering `extension_ui_request:setStatus` or `notify` events — no regression
- Any changes to bash/edit/write tool rendering

---

## Verification

After implementation, run:
1. `bun run test` — all existing + new tests pass, coverage thresholds met
2. Manual UAT: two-turn session "What skills do you have?" → "tell me about the electron skill":
   - No empty ASSISTANT blocks between tool card and response text
   - Tool card header shows `read · /Users/.../electron/SKILL.md`
   - Thinking block appears collapsed above turn-2 response
   - Turn-1 content still visible when turn-2 completes
