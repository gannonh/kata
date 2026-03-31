import { atom } from 'jotai'
import {
  type BridgeStatusEvent,
  type BridgeLifecycleState,
  type ChatEvent,
} from '@shared/types'

export interface ToolCallView {
  id: string
  name: string
  args: unknown
  status: 'running' | 'done' | 'error'
  result?: unknown
  error?: string
}

export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming: boolean
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
    },
  ])
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
    set(toolCallsAtom, [])
  }
})

export const applyChatEventAtom = atom(null, (get, set, event: ChatEvent) => {
  switch (event.type) {
    case 'agent_start': {
      set(toolCallsAtom, [])
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
          },
        ])
      }

      set(isStreamingAtom, true)
      return
    }

    case 'message_end': {
      set(
        messagesAtom,
        get(messagesAtom).map((message) =>
          message.id === event.messageId
            ? {
                ...message,
                content: event.text ?? message.content,
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
        get(toolCallsAtom).map((tool) =>
          tool.id === event.toolCallId
            ? {
                ...tool,
                name: event.toolName,
                status: event.status === 'error' ? 'error' : tool.status,
              }
            : tool,
        ),
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
