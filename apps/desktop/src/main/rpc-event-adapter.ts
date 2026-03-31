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
          path: asString(argRecord?.path) ?? 'unknown-file',
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
          path: asString(argRecord?.path) ?? 'unknown-file',
          offset: asNumber(argRecord?.offset),
          limit: asNumber(argRecord?.limit),
        } satisfies ReadArgs

      case 'write':
        return {
          path: asString(argRecord?.path) ?? 'unknown-file',
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

    const path = asString(resultRecord?.path) ?? asString(argRecord?.path) ?? 'unknown-file'
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

    const path = asString(resultRecord?.path) ?? asString(argRecord?.path) ?? 'unknown-file'
    const content =
      asString(resultRecord?.content) ??
      asString(resultRecord?.text) ??
      asString(asRecord(resultRecord?.file)?.content) ??
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
      language: detectLanguage(path),
      totalLines,
      truncated,
      raw: result,
    }
  }

  private extractWriteResult(args: ToolArgs, result: unknown): WriteResult {
    const argRecord = asRecord(args)
    const resultRecord = asRecord(result)

    const path = asString(resultRecord?.path) ?? asString(argRecord?.path) ?? 'unknown-file'
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

    const resultRecord = asRecord(event.result)
    const fromResult = stringifyField(resultRecord?.stdout)
    if (fromResult) {
      return fromResult
    }

    const messageRecord = event.message
    const fromMessage = stringifyField(messageRecord?.stdout)
    if (fromMessage) {
      return fromMessage
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
      totals.additions += edit.newText.split('\n').filter(Boolean).length
      totals.deletions += edit.oldText.split('\n').filter(Boolean).length
      return totals
    },
    {
      additions: 0,
      deletions: 0,
    },
  )
}

function detectLanguage(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text'
}

function byteLength(input: string): number {
  return new TextEncoder().encode(input).byteLength
}
