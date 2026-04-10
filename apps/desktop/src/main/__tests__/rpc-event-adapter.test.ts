import { beforeEach, describe, expect, test } from 'vitest'
import { RpcEventAdapter } from '../rpc-event-adapter'

describe('RpcEventAdapter', () => {
  const adapter = new RpcEventAdapter()

  test('maps lifecycle events', () => {
    expect(adapter.adapt({ type: 'agent_start' })).toEqual([{ type: 'agent_start' }])
    expect(adapter.adapt({ type: 'turn_start' })).toEqual([{ type: 'turn_start' }])
    expect(adapter.adapt({ type: 'turn_end' })).toEqual([{ type: 'turn_end' }])
    expect(adapter.adapt({ type: 'agent_end' })).toEqual([{ type: 'agent_end' }])
  })

  test('maps message start/update/end into chat events', () => {
    // New behavior: adapter assigns counter IDs; explicit id field is ignored
    const [startEvent] = adapter.adapt({
      type: 'message_start',
      message: { id: 'm1', role: 'assistant' },
    })
    expect(startEvent).toMatchObject({ type: 'message_start', role: 'assistant' })
    const assignedId = (startEvent as { messageId: string }).messageId
    expect(typeof assignedId).toBe('string')
    expect(assignedId.length).toBeGreaterThan(0)

    const [deltaEvent] = adapter.adapt({
      type: 'message_update',
      message: { id: 'm1', role: 'assistant' },
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' },
    })
    expect(deltaEvent).toEqual({ type: 'text_delta', messageId: assignedId, delta: 'Hello ' })

    const [endEvent] = adapter.adapt({
      type: 'message_end',
      message: {
        id: 'm1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    })
    expect(endEvent).toEqual({ type: 'message_end', messageId: assignedId, text: 'Hello world' })
  })

  test('extracts typed edit args and result metadata', () => {
    const [startEvent] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-edit-1',
      toolName: 'edit',
      args: {
        path: 'apps/desktop/src/main/index.ts',
        edits: [
          {
            oldText: 'const a = 1\n',
            newText: 'const a = 2\n',
          },
          {
            oldText: 'const b = 1\n',
            newText: 'const b = 3\n',
          },
        ],
      },
    })

    expect(startEvent).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool-edit-1',
      toolName: 'edit',
      args: {
        path: 'apps/desktop/src/main/index.ts',
        edits: [
          {
            oldText: 'const a = 1\n',
            newText: 'const a = 2\n',
          },
          {
            oldText: 'const b = 1\n',
            newText: 'const b = 3\n',
          },
        ],
      },
    })

    const [endEvent] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-edit-1',
      toolName: 'edit',
      args: {
        path: 'apps/desktop/src/main/index.ts',
      },
      result: {
        path: 'apps/desktop/src/main/index.ts',
        diff: [
          'diff --git a/apps/desktop/src/main/index.ts b/apps/desktop/src/main/index.ts',
          '@@ -1,3 +1,3 @@',
          '-const value = 1',
          '+const value = 2',
          ' export function boot() {}',
        ].join('\n'),
      },
      isError: false,
    })

    expect(endEvent).toMatchObject({
      type: 'tool_end',
      toolCallId: 'tool-edit-1',
      toolName: 'edit',
      isError: false,
      result: {
        path: 'apps/desktop/src/main/index.ts',
        linesAdded: 1,
        linesRemoved: 1,
        linesChanged: 2,
      },
    })
  })

  test('maps bash updates for streaming stdout and end result metadata', () => {
    const [updateEvent] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-1',
      toolName: 'bash',
      status: 'running',
      partialResult: {
        stdout: '\u001b[32mline one\u001b[0m\n',
      },
    })

    expect(updateEvent).toEqual({
      type: 'tool_update',
      toolCallId: 'tool-bash-1',
      toolName: 'bash',
      status: 'running',
      partialStdout: '\u001b[32mline one\u001b[0m\n',
    })

    const [endEvent] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-bash-1',
      toolName: 'bash',
      args: {
        command: 'ls -la --color=always',
      },
      result: {
        stdout: '\u001b[34mapps\u001b[0m\n',
        stderr: '',
        exitCode: 0,
      },
      isError: false,
    })

    expect(endEvent).toEqual({
      type: 'tool_end',
      toolCallId: 'tool-bash-1',
      toolName: 'bash',
      isError: false,
      error: undefined,
      result: {
        command: 'ls -la --color=always',
        stdout: '\u001b[34mapps\u001b[0m\n',
        stderr: '',
        exitCode: 0,
        raw: {
          stdout: '\u001b[34mapps\u001b[0m\n',
          stderr: '',
          exitCode: 0,
        },
      },
    })
  })

  test('extracts read metadata including language and truncation', () => {
    const [endEvent] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-read-1',
      toolName: 'read',
      args: {
        path: 'apps/desktop/package.json',
      },
      result: {
        path: 'apps/desktop/package.json',
        content: '{\n  "name": "@kata/desktop"\n}',
        totalLines: 120,
        truncated: true,
      },
      isError: false,
    })

    expect(endEvent).toEqual({
      type: 'tool_end',
      toolCallId: 'tool-read-1',
      toolName: 'read',
      isError: false,
      error: undefined,
      result: {
        path: 'apps/desktop/package.json',
        content: '{\n  "name": "@kata/desktop"\n}',
        language: 'json',
        totalLines: 120,
        truncated: true,
        raw: {
          path: 'apps/desktop/package.json',
          content: '{\n  "name": "@kata/desktop"\n}',
          totalLines: 120,
          truncated: true,
        },
      },
    })
  })

  test('counts blank lines when edit result is reconstructed from edits array', () => {
    const [endEvent] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-edit-blank-lines',
      toolName: 'edit',
      args: {
        path: 'apps/desktop/src/main/index.ts',
        edits: [
          {
            oldText: 'const value = 1\n',
            newText: 'const value = 2\n\n',
          },
        ],
      },
      result: {
        path: 'apps/desktop/src/main/index.ts',
      },
      isError: false,
    })

    expect(endEvent).toMatchObject({
      type: 'tool_end',
      toolCallId: 'tool-edit-blank-lines',
      toolName: 'edit',
      isError: false,
      result: {
        path: 'apps/desktop/src/main/index.ts',
        linesAdded: 2,
        linesRemoved: 1,
        linesChanged: 3,
      },
    })
  })

  test('extracts write metadata and computes bytesWritten when omitted', () => {
    const [endEvent] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-write-1',
      toolName: 'write',
      args: {
        path: 'apps/desktop/tmp/test.txt',
        content: 'hello\nworld',
      },
      result: {
        path: 'apps/desktop/tmp/test.txt',
      },
      isError: false,
    })

    expect(endEvent).toEqual({
      type: 'tool_end',
      toolCallId: 'tool-write-1',
      toolName: 'write',
      isError: false,
      error: undefined,
      result: {
        path: 'apps/desktop/tmp/test.txt',
        content: 'hello\nworld',
        bytesWritten: 11,
        raw: {
          path: 'apps/desktop/tmp/test.txt',
        },
      },
    })
  })

  test('passes unknown tools through as raw args and result', () => {
    const [startEvent] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-unknown-1',
      toolName: 'browser_assert',
      args: { checks: [{ kind: 'url_contains', value: 'localhost' }] },
    })

    expect(startEvent).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool-unknown-1',
      toolName: 'browser_assert',
      args: {
        raw: { checks: [{ kind: 'url_contains', value: 'localhost' }] },
      },
    })

    const [endEvent] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-unknown-1',
      toolName: 'browser_assert',
      result: { ok: true },
      isError: false,
    })

    expect(endEvent).toEqual({
      type: 'tool_end',
      toolCallId: 'tool-unknown-1',
      toolName: 'browser_assert',
      isError: false,
      error: undefined,
      result: {
        raw: { ok: true },
      },
    })
  })

  test('maps extension errors and malformed payloads to agent_error', () => {
    expect(
      adapter.adapt({
        type: 'extension_error',
        error: 'extension exploded',
      }),
    ).toEqual([
      {
        type: 'agent_error',
        message: 'extension exploded',
      },
    ])

    expect(adapter.adapt('not-an-object')).toEqual([
      {
        type: 'agent_error',
        message: 'Malformed RPC event payload',
      },
    ])
  })

  test('ignores unknown event types', () => {
    expect(adapter.adapt({ type: 'totally_unknown' })).toEqual([])
  })

  test('handles message edge cases for roles, updates, and empty content', () => {
    expect(
      adapter.adapt({
        type: 'message_start',
        message: { id: 'm-invalid', role: 'system' },
      }),
    ).toEqual([])

    // tool_use and other non-handled ame types emit nothing (new behavior)
    expect(
      adapter.adapt({
        type: 'message_update',
        message: { id: 'm2' },
        assistantMessageEvent: { type: 'tool_use', text: 'fallback text' },
      }),
    ).toEqual([])

    // When assistantMessageEvent is not a text_delta (e.g. tool_result), no text delta
    // should be produced — falling back to message.text would inject stale/user content
    expect(
      adapter.adapt({
        type: 'message_update',
        message: { id: 'm3', text: 'from message text' },
        assistantMessageEvent: { type: 'tool_result' },
      }),
    ).toEqual([])

    expect(
      adapter.adapt({
        type: 'message_update',
        message: { id: 'm4', content: [{ type: 'image', url: 'x' }] },
        assistantMessageEvent: { type: 'tool_result' },
      }),
    ).toEqual([])

    // message_end with assistant role emits message_end
    // First set up an assistant message so we have an ID
    const [startForM5] = adapter.adapt({
      type: 'message_start',
      message: { role: 'assistant' },
    })
    const idForM5 = (startForM5 as { messageId: string }).messageId

    expect(
      adapter.adapt({
        type: 'message_end',
        message: { id: 'm5', role: 'assistant', content: [] },
      }),
    ).toEqual([
      {
        type: 'message_end',
        messageId: idForM5,
        text: undefined,
      },
    ])

    // message_end with no role emits nothing (new behavior: role filtering)
    expect(
      adapter.adapt({
        type: 'message_end',
        message: { id: 'm6', content: [{ type: 'tool_use' }, null] },
      }),
    ).toEqual([])

    // message_end with no message object: role is undefined, emits nothing
    const endEvents = adapter.adapt({ type: 'message_end' })
    expect(endEvents).toEqual([])
  })

  test('maps tool_execution_start for bash/read/write/search tools with null-safe args', () => {
    const [bashStart] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-bash-start',
      toolName: 'bash',
      args: { command: null, timeout: 'oops' },
    })

    expect(bashStart).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool-bash-start',
      toolName: 'bash',
      args: {
        command: '',
        timeout: undefined,
      },
    })

    const [readStart] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-read-start',
      toolName: 'read',
      args: { path: undefined, offset: 10, limit: Number.NaN },
    })

    expect(readStart).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool-read-start',
      toolName: 'read',
      args: {
        path: '',
        offset: 10,
        limit: undefined,
      },
    })

    const [writeStart] = adapter.adapt({
      type: 'tool_execution_start',
      message: {
        toolCallId: 'tool-write-from-message',
        toolName: 'write',
      },
      args: { path: null, content: null },
    })

    expect(writeStart).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool-write-from-message',
      toolName: 'write',
      args: {
        path: '',
        content: '',
      },
    })

    const [searchStart] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-search-start',
      toolName: 'search-the-web',
      args: { query: 'kata desktop', count: 3 },
    })

    expect(searchStart).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool-search-start',
      toolName: 'search-the-web',
      args: {
        raw: { query: 'kata desktop', count: 3 },
      },
    })
  })

  test('handles tool_execution_update for non-bash and all bash partial stdout fallbacks', () => {
    const [nonBashUpdate] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-read-update',
      toolName: 'read',
      stdout: 'should be ignored',
      status: 123,
    })

    expect(nonBashUpdate).toEqual({
      type: 'tool_update',
      toolCallId: 'tool-read-update',
      toolName: 'read',
      status: undefined,
      partialStdout: undefined,
    })

    const [fromTopLevelArray] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-update-top-level-array',
      toolName: 'bash',
      stdout: ['line1', 2],
    })
    expect(fromTopLevelArray).toMatchObject({ partialStdout: 'line1\n2' })

    const circular: { self?: unknown } = {}
    circular.self = circular
    const [fromTopLevelCircular] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-update-top-level-circular',
      toolName: 'bash',
      stdout: circular,
    })
    expect(fromTopLevelCircular).toMatchObject({ partialStdout: '[object Object]' })

    const [fromResult] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-update-result',
      toolName: 'bash',
      result: { stdout: 'from result' },
    })
    expect(fromResult).toMatchObject({ partialStdout: 'from result' })

    const [fromResultPartial] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-update-result-partial',
      toolName: 'bash',
      result: { partialResult: { output: 'from result partial' } },
    })
    expect(fromResultPartial).toMatchObject({ partialStdout: 'from result partial' })

    const [fromMessage] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-update-message',
      toolName: 'bash',
      message: { output: { level: 'info' } },
    })
    expect(fromMessage).toMatchObject({ partialStdout: '{\n  "level": "info"\n}' })

    const [fromMessagePartial] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-update-message-partial',
      toolName: 'bash',
      message: { partialResult: { stdout: 'from message partial' } },
    })
    expect(fromMessagePartial).toMatchObject({ partialStdout: 'from message partial' })

    const [noStdout] = adapter.adapt({
      type: 'tool_execution_update',
      toolCallId: 'tool-bash-update-none',
      toolName: 'bash',
    })
    expect(noStdout).toMatchObject({ partialStdout: undefined })
  })

  test('marks tool_execution_end as error for each tool type and supports message-level error/result', () => {
    const [bashEnd] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-bash-error',
      toolName: 'bash',
      args: { command: undefined },
      result: { command: 'echo hi', output: ['a', 'b'] },
      isError: true,
      error: 'bash failed',
    })
    expect(bashEnd).toMatchObject({
      type: 'tool_end',
      toolCallId: 'tool-bash-error',
      toolName: 'bash',
      isError: true,
      error: 'bash failed',
      result: {
        command: '',
        stdout: 'a\nb',
      },
    })

    const [readEnd] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-read-error',
      toolName: 'read',
      args: { path: 'script.TSX' },
      result: { text: 'first\nsecond', numLines: 5 },
      isError: true,
      error: 'read failed',
    })
    expect(readEnd).toMatchObject({
      type: 'tool_end',
      toolCallId: 'tool-read-error',
      toolName: 'read',
      isError: true,
      error: 'read failed',
      result: {
        path: 'script.TSX',
        language: 'typescript',
        totalLines: 5,
        truncated: true,
      },
    })

    const [writeEndFromMessage] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-write-error',
      toolName: 'write',
      message: {
        result: { path: 'out.txt', content: 'done', bytesWritten: 4 },
        error: 'write failed from message',
      },
      isError: false,
    })
    expect(writeEndFromMessage).toMatchObject({
      type: 'tool_end',
      toolCallId: 'tool-write-error',
      toolName: 'write',
      isError: true,
      error: 'write failed from message',
      result: {
        path: 'out.txt',
        content: 'done',
        bytesWritten: 4,
      },
    })

    const [searchEnd] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-search-error',
      toolName: 'search-the-web',
      result: { query: 'latest kata', results: [{ title: 'Kata' }] },
      isError: true,
      error: 'search failed',
    })
    expect(searchEnd).toEqual({
      type: 'tool_end',
      toolCallId: 'tool-search-error',
      toolName: 'search-the-web',
      result: {
        raw: { query: 'latest kata', results: [{ title: 'Kata' }] },
      },
      isError: true,
      error: 'search failed',
    })
  })

  test('reconstructs edit result from multiple edits when diff is missing and keeps parseError', () => {
    const [startEvent] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-edit-multi',
      toolName: 'edit',
      args: {
        path: 'apps/desktop/src/main/rpc-event-adapter.ts',
        oldText: 7,
        newText: null,
        edits: [{}, { oldText: 'x', newText: 'y' }],
      },
    })

    expect(startEvent).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool-edit-multi',
      toolName: 'edit',
      args: {
        path: 'apps/desktop/src/main/rpc-event-adapter.ts',
        edits: [{ oldText: 'x', newText: 'y' }],
      },
    })

    const [endEvent] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-edit-multi',
      toolName: 'edit',
      args: {
        path: 'apps/desktop/src/main/rpc-event-adapter.ts',
        edits: [
          { oldText: 'a\r\nb\r\n', newText: 'a\r\nb\r\nc\r\n' },
          { oldText: 'x', newText: '' },
          {},
        ],
      },
      result: {},
      isError: true,
      error: 'edit failed',
    })

    expect(endEvent).toMatchObject({
      type: 'tool_end',
      toolCallId: 'tool-edit-multi',
      toolName: 'edit',
      isError: true,
      error: 'edit failed',
      result: {
        path: 'apps/desktop/src/main/rpc-event-adapter.ts',
        diff: '',
        linesAdded: 3,
        linesRemoved: 3,
        linesChanged: 6,
        parseError: 'No diff returned by edit tool result',
      },
    })
  })

  test('covers read fallbacks and language detection for mixed extensions', () => {
    const [readFromFile] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-read-from-file',
      toolName: 'read',
      args: { path: 'docs/README.MD' },
      result: {
        file: {
          content: 'line one\nline two',
          totalLines: 2,
          truncated: false,
        },
      },
      isError: false,
    })

    expect(readFromFile).toMatchObject({
      result: {
        path: 'docs/README.MD',
        content: 'line one\nline two',
        language: 'markdown',
        totalLines: 2,
        truncated: false,
      },
    })

    const [readFromPrimitive] = adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-read-primitive',
      toolName: 'read',
      args: { path: 'LICENSE' },
      result: 123,
      isError: false,
    })

    expect(readFromPrimitive).toMatchObject({
      result: {
        path: 'LICENSE',
        content: '123',
        language: 'text',
        totalLines: 1,
        truncated: false,
      },
    })
  })

  test('uses fallback tool metadata and extension error defaults', () => {
    const [fallbackToolStart] = adapter.adapt({
      type: 'tool_execution_start',
      args: null,
    })

    expect(fallbackToolStart).toMatchObject({
      type: 'tool_start',
      toolCallId: 'tool:unknown',
      toolName: 'unknown_tool',
      args: {
        raw: null,
      },
    })

    expect(
      adapter.adapt({
        type: 'extension_error',
        message: { error: 'message-level extension error' },
      }),
    ).toEqual([
      {
        type: 'agent_error',
        message: 'message-level extension error',
      },
    ])

    expect(adapter.adapt({ type: 'extension_error' })).toEqual([
      {
        type: 'agent_error',
        message: 'Unknown extension error',
      },
    ])
  })
})

describe('Real RPC event shapes', () => {
  // Fresh adapter per test — isolates counter state
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

  test('tool-only turn followed by text turn: second turn gets a new message ID', () => {
    // Turn 1: assistant message with only a tool call (no text_delta, no thinking_delta)
    const [start1] = adapter.adapt({
      type: 'message_start',
      message: { role: 'assistant', content: [] },
    })
    const id1 = (start1 as { messageId: string }).messageId

    // Tool executes — no text content emitted
    adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-only-1',
      toolName: 'bash',
      args: { command: 'ls' },
    })
    adapter.adapt({
      type: 'tool_execution_end',
      toolCallId: 'tool-only-1',
      toolName: 'bash',
      result: { stdout: 'file.txt', stderr: '', exitCode: 0 },
      isError: false,
    })

    // message_end for the tool-only assistant turn
    adapter.adapt({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [],
        stopReason: 'toolUse',
      },
    })

    // Turn 2: new assistant message with text
    const [start2] = adapter.adapt({
      type: 'message_start',
      message: { role: 'assistant', content: [] },
    })
    const id2 = (start2 as { messageId: string }).messageId

    // Must get a NEW ID — not the same as id1
    expect(id2).not.toEqual(id1)

    // Text delta uses the new ID
    const [delta] = adapter.adapt({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Done!' },
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

  // ── Subagent extraction tests ───────────────────────────────────────────────

  describe('subagent arg extraction', () => {
    test('single-mode args → SubagentArgs with agent + task + mode', () => {
      const [event] = adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-1',
        toolName: 'subagent',
        args: {
          agent: 'scout',
          task: 'Find the auth module',
        },
      })

      expect(event).toMatchObject({
        type: 'tool_start',
        toolCallId: 'tool-sub-1',
        toolName: 'subagent',
        args: {
          agent: 'scout',
          task: 'Find the auth module',
          mode: 'single',
        },
      })
      // Should not have tasks/chain fields
      const args = (event as unknown as { args: Record<string, unknown> }).args
      expect(args).not.toHaveProperty('tasks')
      expect(args).not.toHaveProperty('chain')
    })

    test('parallel-mode args with tasks[] → correct extraction', () => {
      const [event] = adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-2',
        toolName: 'subagent',
        args: {
          tasks: [
            { agent: 'scout', task: 'Find auth module' },
            { agent: 'worker', task: 'Fix the bug in login.ts' },
          ],
        },
      })

      expect(event).toMatchObject({
        type: 'tool_start',
        toolName: 'subagent',
        args: {
          mode: 'parallel',
          tasks: [
            { agent: 'scout', task: 'Find auth module' },
            { agent: 'worker', task: 'Fix the bug in login.ts' },
          ],
        },
      })
    })

    test('chain-mode args → correct extraction with mode chain', () => {
      const [event] = adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-3',
        toolName: 'subagent',
        args: {
          chain: [
            { agent: 'scout', task: 'Find context for auth' },
            { agent: 'worker', task: 'Implement the fix based on {previous}' },
          ],
        },
      })

      expect(event).toMatchObject({
        type: 'tool_start',
        toolName: 'subagent',
        args: {
          mode: 'chain',
          chain: [
            { agent: 'scout', task: 'Find context for auth' },
            { agent: 'worker', task: 'Implement the fix based on {previous}' },
          ],
        },
      })
    })

    test('chain takes priority over tasks when both present', () => {
      const [event] = adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-4',
        toolName: 'subagent',
        args: {
          tasks: [{ agent: 'scout', task: 'parallel task' }],
          chain: [{ agent: 'worker', task: 'chain task' }],
        },
      })

      const args = (event as unknown as { args: Record<string, unknown> }).args
      expect(args).toMatchObject({ mode: 'chain' })
    })

    test('missing/null args → single mode with no agent or task', () => {
      const [event] = adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-5',
        toolName: 'subagent',
        args: null,
      })

      expect(event).toMatchObject({
        type: 'tool_start',
        toolName: 'subagent',
        args: { mode: 'single' },
      })
    })
  })

  describe('subagent result extraction', () => {
    test('result with exitCode 0 → done SubagentResult', () => {
      // Start event to populate cache
      adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-res-1',
        toolName: 'subagent',
        args: { agent: 'scout', task: 'Find files' },
      })

      const [event] = adapter.adapt({
        type: 'tool_execution_end',
        toolCallId: 'tool-sub-res-1',
        toolName: 'subagent',
        result: {
          details: {
            mode: 'single',
            results: [
              { agent: 'scout', task: 'Find files', exitCode: 0, model: 'claude-sonnet-4-5' },
            ],
          },
        },
        isError: false,
      })

      expect(event).toMatchObject({
        type: 'tool_end',
        toolName: 'subagent',
        isError: false,
        result: {
          mode: 'single',
          results: [
            { agent: 'scout', task: 'Find files', exitCode: 0, model: 'claude-sonnet-4-5' },
          ],
        },
      })
    })

    test('result with exitCode non-zero → error with message', () => {
      adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-res-2',
        toolName: 'subagent',
        args: { agent: 'worker', task: 'Deploy the app' },
      })

      const [event] = adapter.adapt({
        type: 'tool_execution_end',
        toolCallId: 'tool-sub-res-2',
        toolName: 'subagent',
        result: {
          details: {
            mode: 'single',
            results: [
              {
                agent: 'worker',
                task: 'Deploy the app',
                exitCode: 1,
                errorMessage: 'Permission denied',
              },
            ],
          },
        },
        isError: true,
      })

      expect(event).toMatchObject({
        type: 'tool_end',
        toolName: 'subagent',
        isError: true,
        result: {
          mode: 'single',
          results: [
            {
              agent: 'worker',
              task: 'Deploy the app',
              exitCode: 1,
              errorMessage: 'Permission denied',
            },
          ],
        },
      })
    })

    test('parallel result with mixed exit codes', () => {
      adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-res-3',
        toolName: 'subagent',
        args: {
          tasks: [
            { agent: 'scout', task: 'Find files' },
            { agent: 'worker', task: 'Fix bug' },
          ],
        },
      })

      const [event] = adapter.adapt({
        type: 'tool_execution_end',
        toolCallId: 'tool-sub-res-3',
        toolName: 'subagent',
        result: {
          details: {
            mode: 'parallel',
            results: [
              { agent: 'scout', task: 'Find files', exitCode: 0 },
              { agent: 'worker', task: 'Fix bug', exitCode: 1, errorMessage: 'Build failed' },
            ],
          },
        },
        isError: false,
      })

      const result = (event as unknown as { result: { mode: string; results: Array<Record<string, unknown>> } }).result
      expect(result.mode).toBe('parallel')
      expect(result.results).toHaveLength(2)
      expect(result.results[0]).toMatchObject({ agent: 'scout', exitCode: 0 })
      expect(result.results[1]).toMatchObject({ agent: 'worker', exitCode: 1, errorMessage: 'Build failed' })
    })

    test('update event → partial SubagentResult extracted', () => {
      adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-upd-1',
        toolName: 'subagent',
        args: {
          tasks: [
            { agent: 'scout', task: 'Find files' },
            { agent: 'worker', task: 'Fix bug' },
          ],
        },
      })

      const [event] = adapter.adapt({
        type: 'tool_execution_update',
        toolCallId: 'tool-sub-upd-1',
        toolName: 'subagent',
        result: {
          mode: 'parallel',
          results: [
            { agent: 'scout', task: 'Find files', exitCode: 0 },
          ],
        },
      })

      expect(event).toMatchObject({
        type: 'tool_update',
        toolName: 'subagent',
        partialResult: {
          mode: 'parallel',
          results: [
            { agent: 'scout', task: 'Find files', exitCode: 0 },
          ],
        },
      })
    })

    test('result without details wrapper → extracts from top level', () => {
      adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-sub-res-4',
        toolName: 'subagent',
        args: { agent: 'scout', task: 'Find files' },
      })

      const [event] = adapter.adapt({
        type: 'tool_execution_end',
        toolCallId: 'tool-sub-res-4',
        toolName: 'subagent',
        result: {
          mode: 'single',
          results: [
            { agent: 'scout', task: 'Find files', exitCode: 0 },
          ],
        },
        isError: false,
      })

      expect(event).toMatchObject({
        type: 'tool_end',
        result: {
          mode: 'single',
          results: [{ agent: 'scout', exitCode: 0 }],
        },
      })
    })
  })
})
