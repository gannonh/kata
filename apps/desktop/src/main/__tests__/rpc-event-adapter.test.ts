import { describe, expect, test } from 'vitest'
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
    expect(
      adapter.adapt({
        type: 'message_start',
        message: { id: 'm1', role: 'assistant' },
      }),
    ).toEqual([
      {
        type: 'message_start',
        messageId: 'm1',
        role: 'assistant',
      },
    ])

    expect(
      adapter.adapt({
        type: 'message_update',
        message: { id: 'm1', role: 'assistant' },
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' },
      }),
    ).toEqual([
      {
        type: 'text_delta',
        messageId: 'm1',
        delta: 'Hello ',
      },
    ])

    expect(
      adapter.adapt({
        type: 'message_end',
        message: {
          id: 'm1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      }),
    ).toEqual([
      {
        type: 'message_end',
        messageId: 'm1',
        text: 'Hello world',
      },
    ])
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

    expect(startEvent).toEqual({
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

    expect(startEvent).toEqual({
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

    expect(
      adapter.adapt({
        type: 'message_update',
        message: { id: 'm2' },
        assistantMessageEvent: { type: 'tool_use', text: 'fallback text' },
      }),
    ).toEqual([
      {
        type: 'text_delta',
        messageId: 'm2',
        delta: 'fallback text',
      },
    ])

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

    expect(
      adapter.adapt({
        type: 'message_end',
        message: { id: 'm5', content: [] },
      }),
    ).toEqual([
      {
        type: 'message_end',
        messageId: 'm5',
        text: undefined,
      },
    ])

    expect(
      adapter.adapt({
        type: 'message_end',
        message: { id: 'm6', content: [{ type: 'tool_use' }, null] },
      }),
    ).toEqual([
      {
        type: 'message_end',
        messageId: 'm6',
        text: undefined,
      },
    ])

    // message_end with no message object generates a unique ID
    const endEvents = adapter.adapt({ type: 'message_end' })
    expect(endEvents).toHaveLength(1)
    expect(endEvents[0]).toMatchObject({
      type: 'message_end',
      text: undefined,
    })
    expect(typeof (endEvents[0] as Record<string, unknown>).messageId).toBe('string')
  })

  test('maps tool_execution_start for bash/read/write/search tools with null-safe args', () => {
    const [bashStart] = adapter.adapt({
      type: 'tool_execution_start',
      toolCallId: 'tool-bash-start',
      toolName: 'bash',
      args: { command: null, timeout: 'oops' },
    })

    expect(bashStart).toEqual({
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

    expect(readStart).toEqual({
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

    expect(writeStart).toEqual({
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

    expect(searchStart).toEqual({
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

    expect(startEvent).toEqual({
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

    expect(fallbackToolStart).toEqual({
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
