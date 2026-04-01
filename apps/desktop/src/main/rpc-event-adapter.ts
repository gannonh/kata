import {
  type BashArgs,
  type BashResult,
  type ChatEvent,
  type EditArgs,
  type EditResult,
  type ReadArgs,
  type ReadResult,
  type ToolArgs,
  type ToolResult,
  type WriteArgs,
  type WriteResult,
} from '../shared/types'

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
  stdout?: unknown
  partialResult?: unknown
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  css: 'css',
  scss: 'scss',
  html: 'html',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  toml: 'toml',
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

        // For assistant messages, assign and track a unique ID so that
        // subsequent text_delta and message_end events can resolve to it
        // even when the RPC events don't carry an explicit message ID.
        const messageId = role === 'assistant'
          ? this.assignAssistantMessageId(event.message as Record<string, unknown>)
          : this.extractMessageId(event.message)

        return [
          {
            type: 'message_start',
            role,
            messageId,
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
            messageId: this.resolveAssistantMessageId(event.message as Record<string, unknown>),
            delta,
          },
        ]
      }

      case 'message_end': {
        const message = event.message as Record<string, unknown> | undefined
        const text = this.extractText(message)
        const errorMessage = typeof message?.errorMessage === 'string' ? message.errorMessage : undefined
        const stopReason = typeof message?.stopReason === 'string' ? message.stopReason : undefined

        // If the API returned an error (stopReason: "error"), surface it
        if (stopReason === 'error' && errorMessage) {
          return [
            {
              type: 'message_end',
              messageId: this.resolveAssistantMessageId(message),
              text: text || undefined,
            },
            {
              type: 'agent_error',
              message: errorMessage,
            },
          ]
        }

        return [
          {
            type: 'message_end',
            messageId: this.resolveAssistantMessageId(message),
            text: text || undefined,
          },
        ]
      }

      case 'tool_execution_start': {
        const toolName = this.extractToolName(event)
        return [
          {
            type: 'tool_start',
            toolCallId: this.extractToolCallId(event),
            toolName,
            args: this.extractToolArgs(toolName, event.args),
          },
        ]
      }

      case 'tool_execution_update': {
        const toolName = this.extractToolName(event)

        return [
          {
            type: 'tool_update',
            toolCallId: this.extractToolCallId(event),
            toolName,
            status: typeof event.status === 'string' ? event.status : undefined,
            partialStdout: toolName === 'bash' ? this.extractPartialStdout(event) : undefined,
          },
        ]
      }

      case 'tool_execution_end': {
        const toolName = this.extractToolName(event)
        const args = this.extractToolArgs(toolName, event.args)
        const rawResult = event.result ?? event.message?.result
        const result = this.extractToolResult(toolName, args, rawResult)
        const error = typeof event.error === 'string' ? event.error : this.extractToolError(event.message)

        return [
          {
            type: 'tool_end',
            toolCallId: this.extractToolCallId(event),
            toolName,
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

  private extractToolArgs(toolName: string, args: unknown): ToolArgs {
    const argRecord = asRecord(args)

    switch (toolName) {
      case 'edit': {
        const typed: EditArgs = {
          path: asString(argRecord?.path) ?? '',
        }

        if (typeof argRecord?.oldText === 'string') {
          typed.oldText = argRecord.oldText
        }

        if (typeof argRecord?.newText === 'string') {
          typed.newText = argRecord.newText
        }

        const edits = toEditsArray(argRecord?.edits)
        if (edits.length > 0) {
          typed.edits = edits
        }

        return typed
      }

      case 'bash':
        return {
          command: asString(argRecord?.command) ?? '',
          timeout: asNumber(argRecord?.timeout),
        } satisfies BashArgs

      case 'read':
        return {
          path: asString(argRecord?.path) ?? asString(argRecord?.file_path) ?? asString(argRecord?.filePath) ?? (typeof args === 'string' ? args : ''),
          offset: asNumber(argRecord?.offset),
          limit: asNumber(argRecord?.limit),
        } satisfies ReadArgs

      case 'write':
        return {
          path: asString(argRecord?.path) ?? asString(argRecord?.file_path) ?? asString(argRecord?.filePath) ?? (typeof args === 'string' ? args : ''),
          content: asString(argRecord?.content) ?? '',
        } satisfies WriteArgs

      default:
        return {
          raw: args,
        }
    }
  }

  private extractToolResult(toolName: string, args: ToolArgs, result: unknown): ToolResult {
    switch (toolName) {
      case 'edit':
        return this.extractEditResult(args, result)
      case 'bash':
        return this.extractBashResult(args, result)
      case 'read':
        return this.extractReadResult(args, result)
      case 'write':
        return this.extractWriteResult(args, result)
      default:
        return {
          raw: result,
        }
    }
  }

  private extractEditResult(args: ToolArgs, result: unknown): EditResult {
    const argRecord = asRecord(args)
    const resultRecord = asRecord(result)

    const path = asString(resultRecord?.path) ?? asString(argRecord?.path)
    const diff = asString(resultRecord?.diff) ?? asString(resultRecord?.content) ?? ''

    const { additions, deletions } = diff ? countDiffLines(diff) : countFromEdits(toEditsArray(argRecord?.edits))

    const linesAdded = asNumber(resultRecord?.linesAdded) ?? additions
    const linesRemoved = asNumber(resultRecord?.linesRemoved) ?? deletions

    const parsed: EditResult = {
      path,
      diff,
      linesAdded,
      linesRemoved,
      linesChanged: linesAdded + linesRemoved,
      original: asString(resultRecord?.original),
      modified: asString(resultRecord?.modified),
      raw: result,
    }

    if (!diff) {
      parsed.parseError = 'No diff returned by edit tool result'
    }

    return parsed
  }

  private extractBashResult(args: ToolArgs, result: unknown): BashResult {
    const argRecord = asRecord(args)
    const resultRecord = asRecord(result)

    const stdout = stringifyField(resultRecord?.stdout) ?? stringifyField(resultRecord?.output) ?? ''
    const stderr = stringifyField(resultRecord?.stderr) ?? ''

    return {
      command: asString(argRecord?.command) ?? asString(resultRecord?.command) ?? 'bash',
      stdout,
      stderr,
      exitCode: asNumber(resultRecord?.exitCode),
      raw: result,
    }
  }

  private extractReadResult(args: ToolArgs, result: unknown): ReadResult {
    const argRecord = asRecord(args)
    const resultRecord = asRecord(result)

    const path = asString(resultRecord?.path) ?? asString(argRecord?.path)
    const content =
      asString(resultRecord?.content) ??
      asString(resultRecord?.text) ??
      asString(asRecord(resultRecord?.file)?.content) ??
      // Handle CLI's content array format: {content: [{type: "text", text: "..."}]}
      extractTextFromContentArray(resultRecord?.content) ??
      stringifyField(result) ??
      ''

    const contentLines = content.length > 0 ? content.split('\n').length : 0
    const totalLines =
      asNumber(resultRecord?.totalLines) ??
      asNumber(asRecord(resultRecord?.file)?.totalLines) ??
      asNumber(resultRecord?.numLines) ??
      contentLines

    const truncated =
      asBoolean(resultRecord?.truncated) ??
      asBoolean(asRecord(resultRecord?.file)?.truncated) ??
      (totalLines > contentLines && contentLines > 0)

    return {
      path,
      content,
      language: path ? detectLanguage(path) : 'text',
      totalLines,
      truncated,
      raw: result,
    }
  }

  private extractWriteResult(args: ToolArgs, result: unknown): WriteResult {
    const argRecord = asRecord(args)
    const resultRecord = asRecord(result)

    const path = asString(resultRecord?.path) ?? asString(argRecord?.path)
    const content = asString(resultRecord?.content) ?? asString(argRecord?.content) ?? ''

    return {
      path,
      content,
      bytesWritten: asNumber(resultRecord?.bytesWritten) ?? byteLength(content),
      raw: result,
    }
  }

  private extractPartialStdout(event: RpcEvent): string | undefined {
    const fromTopLevel = stringifyField(event.stdout)
    if (fromTopLevel) {
      return fromTopLevel
    }

    const topLevelPartialRecord = asRecord(event.partialResult)
    const fromTopLevelPartial =
      stringifyField(topLevelPartialRecord?.stdout) ?? stringifyField(topLevelPartialRecord?.output)
    if (fromTopLevelPartial) {
      return fromTopLevelPartial
    }

    const resultRecord = asRecord(event.result)
    const fromResult = stringifyField(resultRecord?.stdout) ?? stringifyField(resultRecord?.output)
    if (fromResult) {
      return fromResult
    }

    const resultPartialRecord = asRecord(resultRecord?.partialResult)
    const fromResultPartial =
      stringifyField(resultPartialRecord?.stdout) ?? stringifyField(resultPartialRecord?.output)
    if (fromResultPartial) {
      return fromResultPartial
    }

    const messageRecord = event.message
    const fromMessage = stringifyField(messageRecord?.stdout) ?? stringifyField(messageRecord?.output)
    if (fromMessage) {
      return fromMessage
    }

    const messagePartialRecord = asRecord(messageRecord?.partialResult)
    const fromMessagePartial =
      stringifyField(messagePartialRecord?.stdout) ?? stringifyField(messagePartialRecord?.output)
    if (fromMessagePartial) {
      return fromMessagePartial
    }

    return undefined
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

    // Don't fall back to extracting full message text — that would inject user message
    // content or stale assistant content as a text_delta, corrupting the chat stream.
    // Only actual text_delta events produce deltas.
    return ''
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

  private messageIdCounter = 0
  private currentAssistantMessageId: string | null = null

  private extractMessageId(message?: Record<string, unknown>): string {
    if (!message) {
      return `message:${++this.messageIdCounter}`
    }

    // Try explicit id field
    const id = message.id
    if (typeof id === 'string' && id.length > 0) {
      return id
    }

    // Try responseId (set by Anthropic/OpenAI on message_update events)
    const responseId = message.responseId
    if (typeof responseId === 'string' && responseId.length > 0) {
      return responseId
    }

    // Generate unique ID — critical to prevent messages from different turns
    // sharing the same ID and overwriting each other's content
    return `message:${++this.messageIdCounter}`
  }

  /**
   * Get the message ID for a message_start event, generating a unique one
   * and tracking it as the current streaming assistant message.
   */
  private assignAssistantMessageId(message?: Record<string, unknown>): string {
    const extracted = this.extractMessageId(message)
    this.currentAssistantMessageId = extracted
    return extracted
  }

  /**
   * Get the message ID for text_delta/message_end events.
   * Falls back to the current streaming assistant message ID when the
   * event's message doesn't have an ID (common with Anthropic API).
   */
  private resolveAssistantMessageId(message?: Record<string, unknown>): string {
    if (message) {
      const id = message.id
      if (typeof id === 'string' && id.length > 0) return id
      const responseId = message.responseId
      if (typeof responseId === 'string' && responseId.length > 0) return responseId
    }
    // Fall back to the last assigned assistant message ID
    return this.currentAssistantMessageId ?? `message:${++this.messageIdCounter}`
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

/**
 * Extract text from a Claude-style content array: [{type: "text", text: "..."}]
 * The CLI wraps tool results in this format.
 */
function extractTextFromContentArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const texts: string[] = []
  for (const item of value) {
    if (item && typeof item === 'object') {
      const block = item as Record<string, unknown>
      if (block.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text)
      }
    }
  }

  return texts.length > 0 ? texts.join('\n') : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringifyField(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stringifyField(entry) ?? '').join('\n')
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  if (value === undefined || value === null) {
    return undefined
  }

  return String(value)
}

function toEditsArray(value: unknown): Array<{ oldText: string; newText: string }> {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const record = asRecord(item)
      const oldText = asString(record?.oldText)
      const newText = asString(record?.newText)

      if (!oldText && !newText) {
        return null
      }

      return {
        oldText: oldText ?? '',
        newText: newText ?? '',
      }
    })
    .filter((item): item is { oldText: string; newText: string } => item !== null)
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  const lines = diff.split('\n')
  let additions = 0
  let deletions = 0

  for (const line of lines) {
    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('diff --git')) {
      continue
    }

    if (line.startsWith('+')) {
      additions += 1
    } else if (line.startsWith('-')) {
      deletions += 1
    }
  }

  return { additions, deletions }
}

function countFromEdits(edits: Array<{ oldText: string; newText: string }>): {
  additions: number
  deletions: number
} {
  return edits.reduce(
    (totals, edit) => {
      totals.additions += countTextLines(edit.newText)
      totals.deletions += countTextLines(edit.oldText)
      return totals
    },
    {
      additions: 0,
      deletions: 0,
    },
  )
}

function countTextLines(value: string): number {
  if (value.length === 0) {
    return 0
  }

  const normalized = value.replace(/\r\n/g, '\n')
  const lineCount = normalized.split('\n').length

  return normalized.endsWith('\n') ? Math.max(0, lineCount - 1) : lineCount
}

function detectLanguage(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text'
}

function byteLength(input: string): number {
  return new TextEncoder().encode(input).byteLength
}
