import { atom } from 'jotai'
import {
  type BridgeStatusEvent,
  type BridgeLifecycleState,
  type ChatEvent,
  type ToolArgs,
  type ToolResult,
} from '@shared/types'

export interface ToolCallView {
  id: string
  name: string
  args: ToolArgs
  status: 'running' | 'done' | 'error'
  result?: ToolResult
  error?: string
  partialStdout?: string
}

export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming: boolean
  thinking?: string    // accumulated thinking text; undefined until first thinking_delta
  isThinking: boolean  // true while thinking_delta stream is open
}

export interface BridgeStatusView {
  state: BridgeLifecycleState
  pid: number | null
  message?: string
  updatedAt: number
}

export const messagesAtom = atom<ChatMessageView[]>([])
export const toolCallsAtom = atom<ToolCallView[]>([])
export const isStreamingAtom = atom<boolean>(false)
export const errorAtom = atom<string | null>(null)
export const bridgeStatusAtom = atom<BridgeStatusView>({
  state: 'shutdown',
  pid: null,
  updatedAt: Date.now(),
})

export const appendUserMessageAtom = atom(null, (get, set, content: string) => {
  const trimmed = content.trim()
  if (!trimmed) {
    return
  }

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
})

export const resetChatStateAtom = atom(null, (_get, set) => {
  set(messagesAtom, [])
  set(toolCallsAtom, [])
  set(isStreamingAtom, false)
  set(errorAtom, null)
})

export const applyBridgeStatusAtom = atom(null, (_get, set, status: BridgeStatusEvent) => {
  set(bridgeStatusAtom, {
    state: status.state,
    pid: status.pid,
    message: status.message,
    updatedAt: status.updatedAt,
  })

  if (status.state === 'running') {
    set(errorAtom, null)
    // Don't clear tool calls on bridge status change — they're part of chat history.
  }
})

export const applyChatEventAtom = atom(null, (get, set, event: ChatEvent) => {
  switch (event.type) {
    case 'agent_start': {
      // Don't clear tool calls here — they should persist across the conversation.
      // Tool calls are part of the visible chat history.
      set(errorAtom, null)
      return
    }

    case 'message_start': {
      if (event.role !== 'assistant') {
        return
      }

      const existing = get(messagesAtom).some((message) => message.id === event.messageId)
      if (existing) {
        return
      }

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
      set(isStreamingAtom, true)
      set(errorAtom, null)
      return
    }

    case 'text_delta': {
      const messages = get(messagesAtom)
      const index = messages.findIndex((message) => message.id === event.messageId)

      if (index >= 0) {
        const existing = messages[index]
        if (!existing) {
          return
        }

        const updated = [...messages]
        updated[index] = {
          ...existing,
          content: `${existing.content}${event.delta}`,
          streaming: true,
        }
        set(messagesAtom, updated)
      } else {
        set(messagesAtom, [
          ...messages,
          {
            id: event.messageId,
            role: 'assistant',
            content: event.delta,
            streaming: true,
            isThinking: false,
          },
        ])
      }

      set(isStreamingAtom, true)
      return
    }

    case 'message_end': {
      // Only update assistant messages — user messages are added by appendUserMessageAtom
      // and should not be overwritten by RPC message_end events.
      const existing = get(messagesAtom).find((m) => m.id === event.messageId)
      if (!existing || existing.role !== 'assistant') {
        return
      }

      set(
        messagesAtom,
        get(messagesAtom).map((message) =>
          message.id === event.messageId
            ? {
                ...message,
                // Only replace content if event.text has real content.
                // The streamed text_delta content is the source of truth during streaming.
                content: (event.text && event.text.length > 0) ? event.text : message.content,
                streaming: false,
              }
            : message,
        ),
      )
      return
    }

    case 'turn_end':
    case 'agent_end': {
      set(isStreamingAtom, false)
      set(
        messagesAtom,
        get(messagesAtom).map((message) =>
          message.streaming
            ? {
                ...message,
                streaming: false,
              }
            : message,
        ),
      )
      return
    }

    case 'tool_start': {
      const withoutOld = get(toolCallsAtom).filter((tool) => tool.id !== event.toolCallId)
      set(toolCallsAtom, [
        ...withoutOld,
        {
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
          status: 'running',
        },
      ])
      return
    }

    case 'tool_update': {
      set(
        toolCallsAtom,
        get(toolCallsAtom).map((tool) => {
          if (tool.id !== event.toolCallId) {
            return tool
          }

          return {
            ...tool,
            name: event.toolName,
            status: event.status === 'error' ? 'error' : tool.status,
            partialStdout: event.partialStdout
              ? `${tool.partialStdout ?? ''}${event.partialStdout}`
              : tool.partialStdout,
          }
        }),
      )
      return
    }

    case 'tool_end': {
      set(
        toolCallsAtom,
        get(toolCallsAtom).map((tool) =>
          tool.id === event.toolCallId
            ? {
                ...tool,
                name: event.toolName,
                status: event.isError ? 'error' : 'done',
                result: event.result,
                error: event.error,
                partialStdout: undefined,
              }
            : tool,
        ),
      )
      return
    }

    case 'agent_error': {
      set(errorAtom, event.message)
      set(isStreamingAtom, false)
      return
    }

    case 'subprocess_crash': {
      set(errorAtom, event.message)
      set(isStreamingAtom, false)
      return
    }

    default:
      return
  }
})
