import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ChatEvent } from '../shared/types'
import { RpcEventAdapter } from './rpc-event-adapter'

export interface SessionHistoryLoadResult {
  sessionId: string | null
  events: ChatEvent[]
  warnings: string[]
}

interface ToolMeta {
  name: string
  args?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function extractSessionIdFromFilename(filePath: string): string | null {
  const base = path.basename(filePath, '.jsonl')
  if (!base) {
    return null
  }

  const match = base.match(/_([0-9a-fA-F-]{32,36})$/)
  return match?.[1] ?? base
}

function extractTextFromContent(content: unknown): string | null {
  if (typeof content === 'string' && content.length > 0) {
    return content
  }

  if (!Array.isArray(content)) {
    return null
  }

  const parts: string[] = []
  for (const item of content) {
    const block = asRecord(item)
    if (!block) {
      continue
    }

    const text = asString(block.text)
    if (text) {
      parts.push(text)
      continue
    }

    const thinking = asString(block.thinking)
    if (thinking) {
      parts.push(thinking)
    }
  }

  if (parts.length === 0) {
    return null
  }

  return parts.join('')
}

function normalizeToolResultPayload(toolName: string, raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    return raw
  }

  const rawText = typeof raw === 'string' ? raw : String(raw ?? '')

  try {
    return JSON.parse(rawText)
  } catch {
    // keep plain text fallbacks below
  }

  switch (toolName) {
    case 'bash':
      return {
        stdout: rawText,
        stderr: '',
      }
    case 'read':
      return {
        content: [{ type: 'text', text: rawText }],
      }
    case 'edit':
      return {
        diff: rawText,
      }
    case 'write':
      return {
        content: rawText,
      }
    default:
      return {
        raw: rawText,
      }
  }
}

function extractToolResultFromMessage(message: Record<string, unknown>, toolName: string): unknown {
  if (message.result !== undefined) {
    return normalizeToolResultPayload(toolName, message.result)
  }

  if (message.toolResult !== undefined) {
    return normalizeToolResultPayload(toolName, message.toolResult)
  }

  const content = extractTextFromContent(message.content)
  if (content !== null) {
    return normalizeToolResultPayload(toolName, content)
  }

  return normalizeToolResultPayload(toolName, '')
}

type AssistantContentBlock =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'thinking'
      text: string
    }
  | {
      type: 'tool_use'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
    }

interface AssistantContentParseResult {
  blocks: AssistantContentBlock[]
}

function parseAssistantContent(content: unknown, fallbackLine: number): AssistantContentParseResult {
  if (typeof content === 'string') {
    return {
      blocks: [{ type: 'text', text: content }],
    }
  }

  if (!Array.isArray(content)) {
    return {
      blocks: [],
    }
  }

  const blocks: AssistantContentBlock[] = []

  for (let index = 0; index < content.length; index += 1) {
    const block = asRecord(content[index])
    if (!block) {
      continue
    }

    const blockType = asString(block.type)

    // Tool blocks: Anthropic uses 'tool_use', OpenAI/codex uses 'toolCall'
    if (blockType === 'tool_use' || blockType === 'toolCall') {
      const toolCallId =
        asString(block.id) ??
        asString(block.toolCallId) ??
        asString(block.toolUseId) ??
        `tool:${fallbackLine}:${index}`
      const toolName = asString(block.name) ?? asString(block.toolName) ?? 'unknown_tool'
      const args =
        asRecord(block.input) ??
        asRecord(block.args) ??
        asRecord(block.arguments) ??
        {}

      blocks.push({
        type: 'tool_use',
        toolCallId,
        toolName,
        args,
      })
      continue
    }

    // Text content
    const text = asString(block.text)
    if (text) {
      if (blockType === 'thinking' || blockType === 'reasoning') {
        blocks.push({ type: 'thinking', text })
      } else {
        blocks.push({ type: 'text', text })
      }
      continue
    }

    // Thinking content: may use 'thinking' field (OpenAI) instead of 'text'
    const thinking = asString(block.thinking)
    if (thinking) {
      blocks.push({ type: 'thinking', text: thinking })
      continue
    }

    // Thinking block with empty/encrypted content — still emit so the
    // message isn't treated as a ghost (it had thinking activity).
    if (blockType === 'thinking' || blockType === 'reasoning') {
      blocks.push({ type: 'thinking', text: '' })
    }
  }

  return {
    blocks,
  }
}

export class SessionHistoryLoader {
  public async load(sessionFilePath: string): Promise<SessionHistoryLoadResult> {
    const raw = await fs.readFile(sessionFilePath, 'utf8')
    const lines = raw.split(/\r?\n/)

    const warnings: string[] = []
    if (lines.every((line) => line.trim().length === 0)) {
      warnings.push('Session file is empty')
      return {
        sessionId: extractSessionIdFromFilename(sessionFilePath),
        events: [],
        warnings,
      }
    }

    const adapter = new RpcEventAdapter('history')
    const events: ChatEvent[] = []
    const toolMetaByCallId = new Map<string, ToolMeta>()
    const unresolvedToolOrder: string[] = []

    let sessionId: string | null = null
    let userMessageCounter = 0

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trim()
      if (!line) {
        continue
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch (error) {
        warnings.push(`Line ${index + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)})`)
        continue
      }

      const entry = asRecord(parsed)
      if (!entry) {
        warnings.push(`Line ${index + 1}: expected object entry`)
        continue
      }

      if (index === 0 && asString(entry.type) === 'session') {
        sessionId = asString(entry.id)
      }

      // custom_message entries are slash-command prompts (e.g. /kata plan).
      // Treat them as user messages so the prompt appears in history.
      if (asString(entry.type) === 'custom_message') {
        const content = asString(entry.content)
        const display = entry.display
        // Only show custom messages that have displayable content.
        // display:false means it was a hidden system prompt — but we still
        // show a short label so the user sees something in the chat.
        if (content) {
          userMessageCounter += 1
          const customType = asString(entry.customType)
          const label = customType
            ? customType.replace(/^kata-/, '/kata ').replace(/-/g, ' ')
            : content.slice(0, 100)
          events.push({
            type: 'history_user_message',
            messageId: `history:user:${userMessageCounter}`,
            text: display === false ? label : content.slice(0, 500),
          })
        }
        continue
      }

      if (asString(entry.type) !== 'message') {
        continue
      }

      const message = asRecord(entry.message)
      if (!message) {
        warnings.push(`Line ${index + 1}: message entry missing 'message' payload`)
        continue
      }

      const role = asString(message.role)
      if (!role) {
        continue
      }

      if (role === 'user') {
        const text = extractTextFromContent(message.content)
        if (!text) {
          continue
        }

        userMessageCounter += 1
        events.push({
          type: 'history_user_message',
          messageId: `history:user:${userMessageCounter}`,
          text,
        })
        continue
      }

      if (role === 'assistant') {
        events.push(...adapter.adapt({
          type: 'message_start',
          message: { role: 'assistant' },
        }))

        const parsedContent = parseAssistantContent(message.content, index + 1)

        for (const block of parsedContent.blocks) {
          if (block.type === 'thinking') {
            events.push(...adapter.adapt({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'thinking_start',
              },
            }))
            events.push(...adapter.adapt({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'thinking_delta',
                delta: block.text,
              },
            }))
            events.push(...adapter.adapt({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'thinking_end',
                content: block.text,
              },
            }))
            continue
          }

          if (block.type === 'text') {
            events.push(...adapter.adapt({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'text_delta',
                delta: block.text,
              },
            }))
            continue
          }

          toolMetaByCallId.set(block.toolCallId, {
            name: block.toolName,
            args: block.args,
          })
          unresolvedToolOrder.push(block.toolCallId)

          events.push(...adapter.adapt({
            type: 'tool_execution_start',
            toolCallId: block.toolCallId,
            toolName: block.toolName,
            args: block.args,
          }))
        }

        events.push(...adapter.adapt({
          type: 'message_end',
          message,
        }))
        continue
      }

      if (role === 'toolResult') {
        const explicitToolCallId =
          asString(message.toolCallId) ??
          asString(message.toolUseId)

        const toolCallId = explicitToolCallId ?? unresolvedToolOrder.shift() ?? `tool:result:${index + 1}`

        if (explicitToolCallId) {
          const pendingIndex = unresolvedToolOrder.indexOf(explicitToolCallId)
          if (pendingIndex >= 0) {
            unresolvedToolOrder.splice(pendingIndex, 1)
          }
        }

        const knownMeta = toolMetaByCallId.get(toolCallId)
        const toolName = asString(message.toolName) ?? knownMeta?.name ?? 'unknown_tool'
        const resultPayload = extractToolResultFromMessage(message, toolName)
        const error = asString(message.error)

        events.push(...adapter.adapt({
          type: 'tool_execution_end',
          toolCallId,
          toolName,
          args: knownMeta?.args,
          result: resultPayload,
          isError: Boolean(message.isError || error),
          error: error ?? undefined,
        }))
      }
    }

    return {
      sessionId: sessionId ?? extractSessionIdFromFilename(sessionFilePath),
      events,
      warnings,
    }
  }
}
