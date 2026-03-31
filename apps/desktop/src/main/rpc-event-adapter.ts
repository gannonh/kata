import { type ChatEvent } from '../shared/types'

interface AssistantMessageEvent {
  type?: string
  delta?: string
  text?: string
}

interface RpcEvent {
  type?: string
  message?: Record<string, unknown>
  assistantMessageEvent?: AssistantMessageEvent
  toolCallId?: string
  toolName?: string
  args?: unknown
  result?: unknown
  isError?: boolean
  error?: string
  status?: string
}

export class RpcEventAdapter {
  public adapt(input: unknown): ChatEvent[] {
    if (!input || typeof input !== 'object') {
      return [
        {
          type: 'agent_error',
          message: 'Malformed RPC event payload',
        },
      ]
    }

    const event = input as RpcEvent
    const type = event.type

    switch (type) {
      case 'agent_start':
        return [{ type: 'agent_start' }]

      case 'agent_end':
        return [{ type: 'agent_end' }]

      case 'turn_start':
        return [{ type: 'turn_start' }]

      case 'turn_end':
        return [{ type: 'turn_end' }]

      case 'message_start': {
        const role = this.extractRole(event.message)
        if (role !== 'assistant' && role !== 'user') {
          return []
        }

        return [
          {
            type: 'message_start',
            role,
            messageId: this.extractMessageId(event.message),
          },
        ]
      }

      case 'message_update': {
        const delta = this.extractTextDelta(event)
        if (!delta) {
          return []
        }

        return [
          {
            type: 'text_delta',
            messageId: this.extractMessageId(event.message),
            delta,
          },
        ]
      }

      case 'message_end':
        return [
          {
            type: 'message_end',
            messageId: this.extractMessageId(event.message),
            text: this.extractText(event.message),
          },
        ]

      case 'tool_execution_start':
        return [
          {
            type: 'tool_start',
            toolCallId: this.extractToolCallId(event),
            toolName: this.extractToolName(event),
            args: event.args ?? {},
          },
        ]

      case 'tool_execution_update':
        return [
          {
            type: 'tool_update',
            toolCallId: this.extractToolCallId(event),
            toolName: this.extractToolName(event),
            status: typeof event.status === 'string' ? event.status : undefined,
          },
        ]

      case 'tool_execution_end': {
        const result = event.result ?? event.message?.result
        const error = typeof event.error === 'string' ? event.error : this.extractToolError(event.message)

        return [
          {
            type: 'tool_end',
            toolCallId: this.extractToolCallId(event),
            toolName: this.extractToolName(event),
            result,
            isError: Boolean(event.isError || error),
            error: error ?? undefined,
          },
        ]
      }

      case 'extension_error':
        return [
          {
            type: 'agent_error',
            message: this.extractErrorMessage(event),
          },
        ]

      default:
        return []
    }
  }

  private extractTextDelta(event: RpcEvent): string {
    const assistantMessageEvent = event.assistantMessageEvent
    if (
      assistantMessageEvent &&
      assistantMessageEvent.type === 'text_delta' &&
      typeof assistantMessageEvent.delta === 'string'
    ) {
      return assistantMessageEvent.delta
    }

    if (assistantMessageEvent && typeof assistantMessageEvent.text === 'string') {
      return assistantMessageEvent.text
    }

    const fromMessage = this.extractText(event.message)
    return fromMessage ?? ''
  }

  private extractText(message?: Record<string, unknown>): string | undefined {
    if (!message) {
      return undefined
    }

    const directText = message.text
    if (typeof directText === 'string') {
      return directText
    }

    const content = message.content
    if (!Array.isArray(content)) {
      return undefined
    }

    const textChunks = content
      .map((chunk) => {
        if (!chunk || typeof chunk !== 'object') {
          return ''
        }

        const typedChunk = chunk as Record<string, unknown>
        if (typedChunk.type === 'text' && typeof typedChunk.text === 'string') {
          return typedChunk.text
        }

        return ''
      })
      .filter(Boolean)

    if (textChunks.length === 0) {
      return undefined
    }

    return textChunks.join('')
  }

  private extractRole(message?: Record<string, unknown>): 'assistant' | 'user' | undefined {
    if (!message) {
      return undefined
    }

    const role = message.role
    if (role === 'assistant' || role === 'user') {
      return role
    }

    return undefined
  }

  private extractMessageId(message?: Record<string, unknown>): string {
    if (!message) {
      return 'message:unknown'
    }

    const id = message.id
    if (typeof id === 'string' && id.length > 0) {
      return id
    }

    return 'message:unknown'
  }

  private extractToolCallId(event: RpcEvent): string {
    if (typeof event.toolCallId === 'string' && event.toolCallId.length > 0) {
      return event.toolCallId
    }

    const message = event.message
    if (message && typeof message.toolCallId === 'string' && message.toolCallId.length > 0) {
      return message.toolCallId
    }

    return 'tool:unknown'
  }

  private extractToolName(event: RpcEvent): string {
    if (typeof event.toolName === 'string' && event.toolName.length > 0) {
      return event.toolName
    }

    const message = event.message
    if (message && typeof message.toolName === 'string' && message.toolName.length > 0) {
      return message.toolName
    }

    return 'unknown_tool'
  }

  private extractToolError(message?: Record<string, unknown>): string | undefined {
    if (!message) {
      return undefined
    }

    const value = message.error
    if (typeof value === 'string' && value.length > 0) {
      return value
    }

    return undefined
  }

  private extractErrorMessage(event: RpcEvent): string {
    if (typeof event.error === 'string' && event.error.length > 0) {
      return event.error
    }

    const message = event.message
    if (message && typeof message.error === 'string' && message.error.length > 0) {
      return message.error
    }

    return 'Unknown extension error'
  }
}
