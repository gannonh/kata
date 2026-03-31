import { describe, expect, test } from 'bun:test'
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
})
