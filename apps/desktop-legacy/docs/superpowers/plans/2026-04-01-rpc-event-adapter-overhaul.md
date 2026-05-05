# RPC Event Adapter Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five root bugs in `RpcEventAdapter` that corrupt chat rendering in multi-turn sessions — empty ASSISTANT blocks, wrong-role message_end overwrites, missing tool card paths, ghost message entries from multi-start turns, and silently dropped thinking content — and add a collapsible ThinkingBlock UI component.

**Architecture:** The adapter is a stateful class that translates raw CLI RPC events to typed `ChatEvent` values. We add three instance fields (ID coalescing flag, tool args cache, had-content flag), tighten role filtering, emit three new thinking event types, and wire the new events through the chat atom into a new React component. Every change is driven by failing tests before implementation code.

**Tech Stack:** TypeScript, Vitest, React 19, Jotai, Radix UI `@radix-ui/react-collapsible`, Tailwind CSS v4, `lucide-react`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/shared/types.ts` | Modify | Add `thinking_start/delta/end` to `ChatEvent`; add `thinking`/`isThinking` to `ChatMessageView` |
| `src/main/rpc-event-adapter.ts` | Modify | Five bug fixes: ID coalescing, role filtering, args cache, multi-start coalescing, thinking events |
| `src/main/__tests__/rpc-event-adapter.test.ts` | Modify | New test group with real-capture event sequences covering all five bugs |
| `src/renderer/atoms/chat.ts` | Modify | Handle three new thinking events; add `isThinking: false` to message creation sites |
| `src/renderer/components/chat/ThinkingBlock.tsx` | Create | Collapsible thinking content card |
| `src/renderer/components/chat/MessageList.tsx` | Modify | Render `ThinkingBlock`; filter ghost empty entries |
| `src/renderer/components/chat/FileReadCard.tsx` | Modify | `||` fallback for empty string path (belt-and-suspenders) |

---

## Task 1: Add thinking event types and `isThinking` field to shared types

This is foundation. All other tasks depend on these types compiling.

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Open `src/shared/types.ts` and add the three thinking ChatEvent variants**

In `src/shared/types.ts`, find the `ChatEvent` type union (currently ends with `| { type: 'subprocess_crash'; ... }`). Add three new variants immediately before the closing semicolon:

```typescript
export type ChatEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'message_start'; messageId: string; role: 'assistant' | 'user' }
  | { type: 'text_delta'; messageId: string; delta: string }
  | { type: 'message_end'; messageId: string; text?: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: ToolArgs }
  | {
      type: 'tool_update'
      toolCallId: string
      toolName: string
      status?: string
      partialStdout?: string
    }
  | {
      type: 'tool_end'
      toolCallId: string
      toolName: string
      result?: ToolResult
      isError: boolean
      error?: string
    }
  | { type: 'agent_error'; message: string }
  | {
      type: 'subprocess_crash'
      message: string
      exitCode: number | null
      signal: NodeJS.Signals | null
      stderrLines: string[]
    }
  | { type: 'thinking_start'; messageId: string }
  | { type: 'thinking_delta'; messageId: string; delta: string }
  | { type: 'thinking_end'; messageId: string; content: string }
```

- [ ] **Step 2: Add `thinking` and `isThinking` to `ChatMessageView` in `src/renderer/atoms/chat.ts`**

Open `src/renderer/atoms/chat.ts`. Find `ChatMessageView` interface and update it:

```typescript
export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming: boolean
  thinking?: string    // accumulated thinking text; undefined until first thinking_delta
  isThinking: boolean  // true while thinking_delta stream is open
}
```

- [ ] **Step 3: Fix TypeScript errors from new `isThinking` field — update all message creation sites**

There are two sites in `src/renderer/atoms/chat.ts` that create `ChatMessageView` objects. Both need `isThinking: false`.

Site 1 — in `appendUserMessageAtom`:
```typescript
set(messagesAtom, [
  ...get(messagesAtom),
  {
    id: `user:${Date.now()}`,
    role: 'user',
    content: trimmed,
    streaming: false,
    isThinking: false,
  },
])
```

Site 2 — in `applyChatEventAtom`, `case 'message_start'`:
```typescript
set(messagesAtom, [
  ...get(messagesAtom),
  {
    id: event.messageId,
    role: 'assistant',
    content: '',
    streaming: true,
    isThinking: false,
  },
])
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors (or only pre-existing errors unrelated to these types).

- [ ] **Step 5: Commit the type changes**

```bash
cd apps/desktop
git add src/shared/types.ts src/renderer/atoms/chat.ts
git commit -m "feat(types): add thinking_start/delta/end ChatEvent types and isThinking field"
```

---

## Task 2: Write failing adapter tests for all five bugs

Write the new tests first. They must fail against the current adapter code.

**Files:**
- Modify: `src/main/__tests__/rpc-event-adapter.test.ts`

- [ ] **Step 1: Add the "Real RPC event shapes" describe block to the test file**

Open `src/main/__tests__/rpc-event-adapter.test.ts`. After all existing `describe`/`test` blocks (before the final closing `}`), add:

```typescript
describe('Real RPC event shapes', () => {
  // Fresh adapter per describe block — isolates counter state
  let adapter: RpcEventAdapter

  beforeEach(() => {
    adapter = new RpcEventAdapter()
  })

  test('turn 1 (text only): all text_deltas and message_end use the single assigned messageId', () => {
    // message_start has no id — adapter assigns counter ID
    const [startEvent] = adapter.adapt({
      type: 'message_start',
      message: { role: 'assistant', content: [], stopReason: 'stop' },
    })
    expect(startEvent).toMatchObject({ type: 'message_start', role: 'assistant' })
    const assignedId = (startEvent as { messageId: string }).messageId
    expect(assignedId).toBeTruthy()

    // First text_delta must use the assigned ID, NOT a responseId from the event
    const [delta1] = adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' },
      message: { role: 'assistant', responseId: 'msg_DIFFERENT_ID', content: [] },
    })
    expect(delta1).toEqual({ type: 'text_delta', messageId: assignedId, delta: 'Hello ' })

    const [delta2] = adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'world' },
      message: { role: 'assistant', responseId: 'msg_DIFFERENT_ID', content: [] },
    })
    expect(delta2).toEqual({ type: 'text_delta', messageId: assignedId, delta: 'world' })

    // message_end must also use assigned ID
    const [endEvent] = adapter.adapt({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
        responseId: 'msg_DIFFERENT_ID',
        stopReason: 'stop',
      },
    })
    expect(endEvent).toEqual({ type: 'message_end', messageId: assignedId, text: 'Hello world' })
  })

  test('message_end with role=user emits nothing', () => {
    const events = adapter.adapt({
      type: 'message_end',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'tell me about the electron skill' }],
      },
    })
    expect(events).toEqual([])
  })

  test('message_end with role=toolResult emits nothing', () => {
    const events = adapter.adapt({
      type: 'message_end',
      message: {
        role: 'toolResult',
        toolCallId: 'toolu_01V5QHe2CxbEe7dytnAYbWrT',
        toolName: 'read',
        content: [{ type: 'text', text: '---\nname: electron\n...' }],
        isError: false,
      },
    })
    expect(events).toEqual([])
  })

  test('tool_execution_end with no args falls back to cached args from tool_execution_start', () => {
    // Start event has the path
    const [toolStart] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'toolu_01V5QHe2CxbEe7dytnAYbWrT',
      toolName: 'read',
      args: { path: '/Users/gannonhall/.agents/skills/electron/SKILL.md' },
    })
    expect(toolStart).toMatchObject({ type: 'tool_start', args: { path: '/Users/gannonhall/.agents/skills/electron/SKILL.md' } })

    // End event has NO args field at all — real CLI shape
    const [toolEnd] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'toolu_01V5QHe2CxbEe7dytnAYbWrT',
      toolName: 'read',
      result: {
        content: [{ type: 'text', text: '# Electron Skill content here' }],
      },
      isError: false,
      // no 'args' key at all
    })
    expect(toolEnd).toMatchObject({
      type: 'tool_end',
      toolCallId: 'toolu_01V5QHe2CxbEe7dytnAYbWrT',
      result: {
        path: '/Users/gannonhall/.agents/skills/electron/SKILL.md',
        content: '# Electron Skill content here',
      },
    })
  })

  test('thinking events are emitted with correct types and messageId', () => {
    // Establish current assistant message
    adapter.adapt({
      type: 'message_start',
      message: { role: 'assistant', content: [] },
    })

    const [thinkStart] = adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
      message: { role: 'assistant', content: [] },
    })
    expect(thinkStart).toMatchObject({ type: 'thinking_start' })
    const thinkingId = (thinkStart as { messageId: string }).messageId

    const [thinkDelta] = adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'The user wants' },
      message: { role: 'assistant', content: [] },
    })
    expect(thinkDelta).toEqual({ type: 'thinking_delta', messageId: thinkingId, delta: 'The user wants' })

    const [thinkEnd] = adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'thinking_end',
        contentIndex: 0,
        content: 'The user wants to know about the electron skill.',
      },
      message: { role: 'assistant', content: [] },
    })
    expect(thinkEnd).toEqual({
      type: 'thinking_end',
      messageId: thinkingId,
      content: 'The user wants to know about the electron skill.',
    })
  })

  test('turn 2 (thinking + tool + text): second message_start gets new ID because hadContent=true after thinking', () => {
    // message_start for thinking+tool phase
    const [start1] = adapter.adapt({
      type: 'message_start',
      message: { role: 'assistant', content: [] },
    })
    const id1 = (start1 as { messageId: string }).messageId

    // thinking_delta sets hadContent = true
    adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
      message: { role: 'assistant', content: [] },
    })
    adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'The user wants to know.' },
      message: { role: 'assistant', content: [] },
    })
    adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_end', contentIndex: 0, content: 'The user wants to know.' },
      message: { role: 'assistant', content: [] },
    })

    // toolResult message_start (should emit [] — role is not user or assistant)
    const toolResultStart = adapter.adapt({
      type: 'message_start',
      message: { role: 'toolResult', content: [] },
    })
    expect(toolResultStart).toEqual([])

    // second assistant message_start — hadContent was true, so gets NEW ID
    const [start2] = adapter.adapt({
      type: 'message_start',
      message: { role: 'assistant', content: [] },
    })
    const id2 = (start2 as { messageId: string }).messageId
    expect(id2).not.toEqual(id1)

    // text deltas for the final response use id2
    const [delta] = adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '## The electron Skill' },
      message: { role: 'assistant', content: [] },
    })
    expect(delta).toMatchObject({ type: 'text_delta', messageId: id2 })
  })

  test('non-text-delta message_update types (toolcall_start/delta/end, text_start/end) emit nothing', () => {
    adapter.adapt({ type: 'message_start', message: { role: 'assistant', content: [] } })

    for (const ameType of ['toolcall_start', 'toolcall_delta', 'toolcall_end', 'text_start', 'text_end']) {
      const events = adapter.adapt({
        type: 'message_update',
        assistantMessageEvent: { type: ameType, contentIndex: 0 },
        message: { role: 'assistant', content: [] },
      })
      expect(events, `expected [] for ame type ${ameType}`).toEqual([])
    }
  })
})
```

- [ ] **Step 2: Add the `beforeEach` import — `RpcEventAdapter` is already imported, but add `beforeEach` to the vitest import if not present**

Check the top of the test file. If the import is `import { describe, expect, test } from 'vitest'`, update it to:

```typescript
import { beforeEach, describe, expect, test } from 'vitest'
```

- [ ] **Step 3: Run only the new test group to confirm all tests fail**

```bash
cd apps/desktop && npx vitest run src/main/__tests__/rpc-event-adapter.test.ts --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|✓|✗|×|Error)" | tail -30
```

Expected: The 7 new tests in "Real RPC event shapes" fail. Existing tests still pass.

- [ ] **Step 4: Commit the failing tests**

```bash
cd apps/desktop
git add src/main/__tests__/rpc-event-adapter.test.ts
git commit -m "test(adapter): add failing tests for real RPC event shapes (KAT-2223)"
```

---

## Task 3: Fix the adapter — ID coalescing, role filtering, args cache, thinking events

All five bugs fixed in one coordinated rewrite of the adapter class state and handlers.

**Files:**
- Modify: `src/main/rpc-event-adapter.ts`

- [ ] **Step 1: Add the four new instance fields at the top of the class body**

Open `src/main/rpc-event-adapter.ts`. Find the existing private fields (currently `private messageIdCounter = 0` and `private currentAssistantMessageId`). Replace the entire block of private fields with:

```typescript
private messageIdCounter = 0
private currentAssistantMessageId: string | null = null
private currentAssistantMessageHadContent = false
private readonly toolArgsCache = new Map<string, ToolArgs>()
```

- [ ] **Step 2: Rewrite the `message_start` case in `adapt()`**

Find the `case 'message_start':` block. Replace it entirely:

```typescript
case 'message_start': {
  const role = this.extractRole(event.message)
  if (role !== 'assistant' && role !== 'user') {
    return []
  }

  if (role === 'user') {
    const messageId = `message:${++this.messageIdCounter}`
    return [{ type: 'message_start', role: 'user', messageId }]
  }

  // role === 'assistant'
  // If the previous assistant message has not yet had any content (text or thinking),
  // reuse its ID — this handles the multi-start pattern where thinking+tool phase
  // starts a message but the real text comes in a later message_start(assistant).
  let messageId: string
  if (!this.currentAssistantMessageHadContent && this.currentAssistantMessageId !== null) {
    messageId = this.currentAssistantMessageId
  } else {
    messageId = `message:${++this.messageIdCounter}`
    this.currentAssistantMessageId = messageId
    this.currentAssistantMessageHadContent = false
  }

  return [{ type: 'message_start', role: 'assistant', messageId }]
}
```

- [ ] **Step 3: Rewrite the `message_update` case**

Find the `case 'message_update':` block. Replace it entirely:

```typescript
case 'message_update': {
  const ameType = event.assistantMessageEvent?.type
  const messageId = this.currentAssistantMessageId ?? `message:${++this.messageIdCounter}`

  switch (ameType) {
    case 'text_delta': {
      const delta = event.assistantMessageEvent?.delta
      if (typeof delta === 'string' && delta.length > 0) {
        this.currentAssistantMessageHadContent = true
        return [{ type: 'text_delta', messageId, delta }]
      }
      return []
    }

    case 'thinking_start': {
      return [{ type: 'thinking_start', messageId }]
    }

    case 'thinking_delta': {
      const delta = event.assistantMessageEvent?.delta
      if (typeof delta === 'string' && delta.length > 0) {
        this.currentAssistantMessageHadContent = true
        return [{ type: 'thinking_delta', messageId, delta }]
      }
      return []
    }

    case 'thinking_end': {
      const content = event.assistantMessageEvent?.content ?? ''
      return [{ type: 'thinking_end', messageId, content: typeof content === 'string' ? content : '' }]
    }

    // toolcall_start/delta/end, text_start, text_end — all silently dropped
    default:
      return []
  }
}
```

Note: The `AssistantMessageEvent` interface at the top of the file needs `content?: string` and `delta?: string` added. Find the interface and update it:

```typescript
interface AssistantMessageEvent {
  type?: string
  delta?: string
  text?: string
  content?: string
  contentIndex?: number
}
```

- [ ] **Step 4: Rewrite the `message_end` case**

Find the `case 'message_end':` block. Replace it entirely:

```typescript
case 'message_end': {
  const message = event.message as Record<string, unknown> | undefined
  const role = this.extractRole(message)

  // Only emit for assistant messages — user and toolResult ends are ignored
  if (role !== 'assistant') {
    return []
  }

  const text = this.extractText(message)
  const errorMessage = typeof message?.errorMessage === 'string' ? message.errorMessage : undefined
  const stopReason = typeof message?.stopReason === 'string' ? message.stopReason : undefined
  const messageId = this.currentAssistantMessageId ?? `message:${++this.messageIdCounter}`

  if (stopReason === 'error' && errorMessage) {
    return [
      { type: 'message_end', messageId, text: text || undefined },
      { type: 'agent_error', message: errorMessage },
    ]
  }

  return [{ type: 'message_end', messageId, text: text || undefined }]
}
```

- [ ] **Step 5: Update `tool_execution_start` to cache args**

Find the `case 'tool_execution_start':` block. Replace it:

```typescript
case 'tool_execution_start': {
  const toolName = this.extractToolName(event)
  const toolCallId = this.extractToolCallId(event)
  const args = this.extractToolArgs(toolName, event.args)
  // Cache args so tool_execution_end can use them when event.args is absent
  this.toolArgsCache.set(toolCallId, args)
  return [{ type: 'tool_start', toolCallId, toolName, args }]
}
```

- [ ] **Step 6: Update `tool_execution_end` to use cached args as fallback**

Find the `case 'tool_execution_end':` block. Replace it:

```typescript
case 'tool_execution_end': {
  const toolName = this.extractToolName(event)
  const toolCallId = this.extractToolCallId(event)
  // event.args is absent (not null) in real CLI output — fall back to cached start args
  const rawArgs = event.args != null ? event.args : (this.toolArgsCache.get(toolCallId) ?? null)
  const args = this.extractToolArgs(toolName, rawArgs)
  const rawResult = event.result ?? event.message?.result
  const result = this.extractToolResult(toolName, args, rawResult)
  const error = typeof event.error === 'string' ? event.error : this.extractToolError(event.message)

  return [
    {
      type: 'tool_end',
      toolCallId,
      toolName,
      result,
      isError: Boolean(event.isError || error),
      error: error ?? undefined,
    },
  ]
}
```

- [ ] **Step 7: Remove `assignAssistantMessageId` and `resolveAssistantMessageId` private methods**

These two methods are no longer called. Delete them from the class body:

- Delete `private assignAssistantMessageId(...)` 
- Delete `private resolveAssistantMessageId(...)`

Also delete the `private messageIdCounter` and `private currentAssistantMessageId` fields from wherever they still appear (they're now declared in the new unified block from Step 1).

- [ ] **Step 8: Run the new tests to verify they pass**

```bash
cd apps/desktop && npx vitest run src/main/__tests__/rpc-event-adapter.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All tests in "Real RPC event shapes" pass. All pre-existing tests still pass.

- [ ] **Step 9: Run the full test suite and confirm coverage thresholds hold**

```bash
cd apps/desktop && bun run test 2>&1 | tail -20
```

Expected: all 6 test files pass, coverage thresholds met (lines ≥90%, branches ≥80%, functions ≥90%).

- [ ] **Step 10: Commit**

```bash
cd apps/desktop
git add src/main/rpc-event-adapter.ts
git commit -m "fix(adapter): ID coalescing, role filtering, args cache, thinking events (KAT-2223)"
```

---

## Task 4: Wire thinking events through the chat atom

**Files:**
- Modify: `src/renderer/atoms/chat.ts`

- [ ] **Step 1: Add the three thinking event cases to `applyChatEventAtom`**

Open `src/renderer/atoms/chat.ts`. Find the `switch (event.type)` in `applyChatEventAtom`. After the existing `case 'agent_error':` block and before the `default: return` line, add:

```typescript
case 'thinking_start': {
  set(
    messagesAtom,
    get(messagesAtom).map((message) =>
      message.id === event.messageId
        ? { ...message, isThinking: true }
        : message,
    ),
  )
  return
}

case 'thinking_delta': {
  set(
    messagesAtom,
    get(messagesAtom).map((message) =>
      message.id === event.messageId
        ? { ...message, thinking: (message.thinking ?? '') + event.delta }
        : message,
    ),
  )
  return
}

case 'thinking_end': {
  set(
    messagesAtom,
    get(messagesAtom).map((message) =>
      message.id === event.messageId
        ? {
            ...message,
            thinking: event.content.length > 0 ? event.content : (message.thinking ?? ''),
            isThinking: false,
          }
        : message,
    ),
  )
  return
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero new errors.

- [ ] **Step 3: Commit**

```bash
cd apps/desktop
git add src/renderer/atoms/chat.ts
git commit -m "feat(chat-atom): handle thinking_start/delta/end events"
```

---

## Task 5: Create the ThinkingBlock component

**Files:**
- Create: `src/renderer/components/chat/ThinkingBlock.tsx`

- [ ] **Step 1: Create the component file**

Create `src/renderer/components/chat/ThinkingBlock.tsx` with this content:

```typescript
import { useEffect, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThinkingBlockProps {
  content: string
  isThinking: boolean
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function ThinkingBlock({ content, isThinking }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(isThinking)

  // Auto-collapse when thinking stream completes
  useEffect(() => {
    if (!isThinking) {
      setIsOpen(false)
    }
  }, [isThinking])

  const label = isThinking
    ? 'Thinking…'
    : `Thought for ${wordCount(content)} words`

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'flex h-auto items-center gap-1.5 rounded-md px-2 py-1 text-xs font-normal',
            'text-amber-700 dark:text-amber-400',
            'hover:bg-amber-500/10',
          )}
        >
          <Brain className="h-3 w-3 shrink-0" />
          <span>{label}</span>
          {isOpen
            ? <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            : <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          }
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          className={cn(
            'mt-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2',
            'text-xs italic leading-relaxed text-amber-800/80 dark:text-amber-300/70',
            'max-h-48 overflow-y-auto whitespace-pre-wrap font-mono',
          )}
        >
          {content || (isThinking ? '…' : '')}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

- [ ] **Step 2: Verify the component imports resolve**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | grep -i "thinkingblock\|thinking_block\|ThinkingBlock" | head -10
```

Expected: no errors referencing ThinkingBlock.

- [ ] **Step 3: Commit**

```bash
cd apps/desktop
git add src/renderer/components/chat/ThinkingBlock.tsx
git commit -m "feat(ui): add ThinkingBlock collapsible component"
```

---

## Task 6: Update MessageList to render ThinkingBlock and filter ghost entries

**Files:**
- Modify: `src/renderer/components/chat/MessageList.tsx`

- [ ] **Step 1: Import ThinkingBlock in MessageList**

Open `src/renderer/components/chat/MessageList.tsx`. Add the import:

```typescript
import { ThinkingBlock } from './ThinkingBlock'
```

- [ ] **Step 2: Replace the assistant message rendering section**

Find the existing assistant rendering block:

```typescript
{message.role === 'assistant' ? (
  <StreamingMessage content={message.content} isStreaming={message.streaming} />
) : (
  <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{message.content}</div>
)}
```

Replace it with:

```typescript
{message.role === 'assistant' ? (
  <>
    {(message.thinking !== undefined || message.isThinking) && (
      <ThinkingBlock
        content={message.thinking ?? ''}
        isThinking={message.isThinking}
      />
    )}
    {/* Skip the text bubble entirely for ghost entries: no content, not streaming, no thinking */}
    {(message.content.length > 0 || message.streaming || message.thinking !== undefined || message.isThinking) && (
      <StreamingMessage content={message.content} isStreaming={message.streaming} />
    )}
  </>
) : (
  <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{message.content}</div>
)}
```

- [ ] **Step 3: Add the `thinking` and `isThinking` props to the destructured `ChatMessageView` usage**

The `messages.map((message) => ...)` callback uses `message.thinking` and `message.isThinking`. Since `ChatMessageView` now includes those fields, TypeScript will see them automatically — no explicit destructuring change needed. But verify the component uses the correct field name: `message.thinking` (optional `string`) and `message.isThinking` (required `boolean`).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd apps/desktop
git add src/renderer/components/chat/MessageList.tsx
git commit -m "feat(chat): render ThinkingBlock and filter ghost empty assistant messages"
```

---

## Task 7: Fix empty-string path fallback in FileReadCard

**Files:**
- Modify: `src/renderer/components/chat/FileReadCard.tsx`

- [ ] **Step 1: Update `buildReadViewModel` path resolution**

Open `src/renderer/components/chat/FileReadCard.tsx`. Find this line in `buildReadViewModel`:

```typescript
const filePath = asString(result?.path) ?? asString(args?.path) ?? 'unknown-file'
```

Replace with:

```typescript
// Use || not ?? so empty string ('') falls through to args.path
// The root fix is in the adapter (tool args cache), but this guards against any future regression
const filePath = (asString(result?.path) || asString(args?.path)) ?? 'unknown-file'
```

- [ ] **Step 2: Commit**

```bash
cd apps/desktop
git add src/renderer/components/chat/FileReadCard.tsx
git commit -m "fix(FileReadCard): use || fallback so empty result.path falls through to args.path"
```

---

## Task 8: Full test suite — verify coverage and clean up

- [ ] **Step 1: Run the complete test suite**

```bash
cd apps/desktop && bun run test 2>&1 | tail -25
```

Expected output resembles:

```
 Test Files  6 passed (6)
       Tests  88 passed (88)   ← was 81; now 88 with 7 new tests

% Coverage report from v8
-------------------|---------|----------|---------|---------|
...ent-adapter.ts  |   93+   |   85+    |   100   |  93+    |
```

All thresholds: lines ≥90%, branches ≥80%, functions ≥90%.

- [ ] **Step 2: If coverage drops below threshold, identify which new branches are uncovered**

```bash
cd apps/desktop && bun run test 2>&1 | grep -A5 "rpc-event-adapter"
```

The most likely uncovered branches are: `thinking_delta` with empty string (returns `[]`), `thinking_end` with zero-length `content` (falls back to accumulated), `tool_execution_end` with `null` event.args (vs absent). Add targeted tests for any that are missing.

- [ ] **Step 3: Run TypeScript check one final time**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 4: Final commit**

```bash
cd apps/desktop
git add -A
git commit -m "test(adapter): full suite green, coverage thresholds met (KAT-2223)"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Bug 1: ID mismatch — `resolveAssistantMessageId` returns `currentAssistantMessageId` | Task 3, Steps 2–3 |
| Bug 2: `message_end` role filtering — only `assistant` emits | Task 3, Step 4 |
| Bug 3: Tool args cache — `tool_execution_end` uses cached args | Task 3, Steps 5–6 |
| Bug 4: Multi-start coalescing — `hadContent` flag | Task 3, Step 2 |
| Bug 5: Thinking events emitted | Task 3, Step 3 |
| New `ChatEvent` types | Task 1, Step 1 |
| `ChatMessageView.isThinking` + `thinking` | Task 1, Step 2 |
| Chat atom handles thinking events | Task 4 |
| `ThinkingBlock` component | Task 5 |
| `MessageList` renders ThinkingBlock + filters ghost entries | Task 6 |
| `FileReadCard` `||` fallback | Task 7 |
| Adapter tests with real event shapes | Task 2 |
| Full test suite passes | Task 8 |

All spec requirements covered. No gaps.

**Placeholder scan:** No TBD/TODO/placeholder present. Every step has exact code.

**Type consistency:**
- `ChatMessageView.thinking` → `string | undefined` — used as `message.thinking` in MessageList ✓
- `ChatMessageView.isThinking` → `boolean` — initialized `false` at both creation sites ✓
- `thinking_end.content` → `string` — adapter emits `typeof content === 'string' ? content : ''` ✓
- `ThinkingBlock` props: `content: string`, `isThinking: boolean` — matches atom field types ✓
- `toolArgsCache` key is `toolCallId: string` — same value used in both start and end handlers ✓
