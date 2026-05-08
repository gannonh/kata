import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SessionHistoryLoader } from '../session-history-loader'

async function writeJsonl(filePath: string, lines: Array<Record<string, unknown> | string>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const body = lines
    .map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
    .join('\n')
  await fs.writeFile(filePath, body.length > 0 ? `${body}\n` : '', 'utf8')
}

describe('SessionHistoryLoader', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-session-history-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('loads user/assistant history with thinking and tool calls', async () => {
    const loader = new SessionHistoryLoader()
    const filePath = path.join(tempDir, '2026-04-03_abc123.jsonl')

    await writeJsonl(filePath, [
      {
        type: 'session',
        id: 'session-1',
        cwd: '/repo/project',
        timestamp: '2026-04-03T00:00:00.000Z',
      },
      {
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Show me README' }],
        },
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', text: 'Need to inspect the file first.' },
            {
              type: 'tool_use',
              id: 'tool-read-1',
              name: 'read',
              input: { path: '/repo/project/README.md', offset: 1, limit: 200 },
            },
            { type: 'text', text: 'I loaded README and summarized it below.' },
          ],
        },
      },
      {
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'tool-read-1',
          toolName: 'read',
          content: [{ type: 'text', text: '# README\nhello world' }],
          isError: false,
        },
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done.' }],
        },
      },
    ])

    const result = await loader.load(filePath)

    expect(result.sessionId).toBe('session-1')
    expect(result.warnings).toEqual([])

    expect(result.events.some((event) => event.type === 'history_user_message')).toBe(true)
    expect(result.events.some((event) => event.type === 'thinking_start')).toBe(true)
    expect(result.events.some((event) => event.type === 'thinking_delta')).toBe(true)
    expect(result.events.some((event) => event.type === 'tool_start')).toBe(true)

    const toolStartIndex = result.events.findIndex(
      (event) => event.type === 'tool_start' && event.toolCallId === 'tool-read-1',
    )
    const summaryTextIndex = result.events.findIndex(
      (event) =>
        event.type === 'text_delta' &&
        event.delta.includes('summarized it below'),
    )

    expect(toolStartIndex).toBeGreaterThanOrEqual(0)
    expect(summaryTextIndex).toBeGreaterThan(toolStartIndex)

    const toolEnd = result.events.find(
      (event) => event.type === 'tool_end' && event.toolCallId === 'tool-read-1',
    )

    expect(toolEnd).toBeDefined()
    if (toolEnd && toolEnd.type === 'tool_end' && toolEnd.result && 'path' in toolEnd.result) {
      expect(toolEnd.result.path).toBe('/repo/project/README.md')
    }
  })

  test('continues on corrupted lines and reports warnings', async () => {
    const loader = new SessionHistoryLoader()
    const filePath = path.join(tempDir, '2026-04-03_corrupt.jsonl')

    await writeJsonl(filePath, [
      {
        type: 'session',
        id: 'session-corrupt',
        cwd: '/repo/project',
      },
      '{not valid json',
      {
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'still parse me' }],
        },
      },
      {
        type: 'message',
      },
    ])

    const result = await loader.load(filePath)

    expect(result.sessionId).toBe('session-corrupt')
    expect(result.events.some((event) => event.type === 'history_user_message')).toBe(true)
    expect(result.warnings.length).toBeGreaterThanOrEqual(2)
    expect(result.warnings.join('\n')).toContain('invalid JSON')
    expect(result.warnings.join('\n')).toContain("missing 'message' payload")
  })

  test('returns empty events with warning for empty sessions', async () => {
    const loader = new SessionHistoryLoader()
    const filePath = path.join(tempDir, '2026-04-03_empty.jsonl')

    await writeJsonl(filePath, [])

    const result = await loader.load(filePath)

    expect(result.events).toEqual([])
    expect(result.warnings).toEqual(['Session file is empty'])
    expect(result.sessionId).toBe('2026-04-03_empty')
  })

  test('ignores non-session first-line ids when determining session id', async () => {
    const loader = new SessionHistoryLoader()
    const filePath = path.join(tempDir, '2026-04-03_fallback-from-filename.jsonl')

    await writeJsonl(filePath, [
      {
        type: 'message',
        id: 'not-a-session-header-id',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
        },
      },
    ])

    const result = await loader.load(filePath)

    expect(result.sessionId).toBe('2026-04-03_fallback-from-filename')
  })

  test('maps toolResult without explicit toolCallId to most recent unresolved tool', async () => {
    const loader = new SessionHistoryLoader()
    const filePath = path.join(tempDir, '2026-04-03_ordered.jsonl')

    await writeJsonl(filePath, [
      {
        type: 'session',
        id: 'session-order',
        cwd: '/repo/project',
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-bash-1',
              name: 'bash',
              input: { command: 'echo one' },
            },
          ],
        },
      },
      {
        type: 'message',
        message: {
          role: 'toolResult',
          toolName: 'bash',
          toolResult: 'one\n',
          isError: false,
        },
      },
    ])

    const result = await loader.load(filePath)
    const toolEnd = result.events.find(
      (event) => event.type === 'tool_end' && event.toolCallId === 'tool-bash-1',
    )

    expect(toolEnd).toBeDefined()
  })
})
