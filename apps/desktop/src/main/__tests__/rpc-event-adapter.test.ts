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

  test('maps tool execution events', () => {
    expect(
      adapter.adapt({
        type: 'tool_execution_start',
        toolCallId: 'tool-1',
        toolName: 'bash',
        args: { command: 'ls -la' },
      }),
    ).toEqual([
      {
        type: 'tool_start',
        toolCallId: 'tool-1',
        toolName: 'bash',
        args: { command: 'ls -la' },
      },
    ])

    expect(
      adapter.adapt({
        type: 'tool_execution_update',
        toolCallId: 'tool-1',
        toolName: 'bash',
        status: 'running',
      }),
    ).toEqual([
      {
        type: 'tool_update',
        toolCallId: 'tool-1',
        toolName: 'bash',
        status: 'running',
      },
    ])

    expect(
      adapter.adapt({
        type: 'tool_execution_end',
        toolCallId: 'tool-1',
        toolName: 'bash',
        result: { stdout: 'README.md' },
        isError: false,
      }),
    ).toEqual([
      {
        type: 'tool_end',
        toolCallId: 'tool-1',
        toolName: 'bash',
        result: { stdout: 'README.md' },
        isError: false,
        error: undefined,
      },
    ])
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
