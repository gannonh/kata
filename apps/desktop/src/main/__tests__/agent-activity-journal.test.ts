import { describe, expect, test } from 'vitest'
import type {
  SymphonyEscalationResponseCommandResult,
  SymphonyOperatorSnapshot,
  SymphonyOperatorWorkerRow,
  SymphonyRuntimeStatus,
} from '@shared/types'
import { AgentActivityJournal } from '../agent-activity-journal'

function buildRuntimeStatus(
  phase: SymphonyRuntimeStatus['phase'],
  overrides: Partial<SymphonyRuntimeStatus> = {},
): SymphonyRuntimeStatus {
  return {
    phase,
    managedProcessRunning: phase === 'ready' || phase === 'starting' || phase === 'restarting',
    pid: phase === 'ready' ? 1234 : null,
    url: 'http://127.0.0.1:8080',
    diagnostics: { stdout: [], stderr: [] },
    updatedAt: new Date().toISOString(),
    restartCount: 0,
    ...overrides,
  }
}

function buildSnapshot(
  workers: SymphonyOperatorWorkerRow[],
  overrides: Partial<SymphonyOperatorSnapshot> = {},
): SymphonyOperatorSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    queueCount: 0,
    completedCount: 0,
    workers,
    escalations: [],
    connection: {
      state: 'connected',
      updatedAt: new Date().toISOString(),
    },
    freshness: {
      status: 'fresh',
    },
    response: {},
    ...overrides,
  }
}

describe('AgentActivityJournal', () => {
  test('records runtime phase transitions into events and verbose streams', () => {
    const journal = new AgentActivityJournal()
    journal.ingestRuntimeStatus(buildRuntimeStatus('starting'))
    journal.ingestRuntimeStatus(buildRuntimeStatus('ready'))

    const snapshot = journal.getSnapshot()
    expect(snapshot.events.some((event) => event.kind === 'runtime.phase_changed')).toBe(true)
    expect(snapshot.events.some((event) => event.message.includes('ready'))).toBe(true)
    expect(snapshot.verbose.some((event) => event.kind === 'runtime.phase_changed')).toBe(true)
  })

  test('records worker state/tool changes from operator snapshots', () => {
    const journal = new AgentActivityJournal()

    const baseWorker: SymphonyOperatorWorkerRow = {
      issueId: 'slice-1',
      identifier: 'KAT-1',
      issueTitle: 'Slice 1',
      state: 'in_progress',
      toolName: 'edit',
      model: 'gpt',
      lastActivityAt: new Date().toISOString(),
    }

    journal.ingestOperatorSnapshot(buildSnapshot([baseWorker]))
    journal.ingestOperatorSnapshot(
      buildSnapshot([
        {
          ...baseWorker,
          state: 'agent_review',
          toolName: 'bash',
        },
      ]),
    )

    const events = journal.getSnapshot().events
    expect(events.some((event) => event.kind === 'worker.state_changed')).toBe(true)
    expect(events.some((event) => event.kind === 'worker.tool_changed')).toBe(true)
  })

  test('auto-pins errors and allows manual unpin/pin by event id', () => {
    const journal = new AgentActivityJournal()
    journal.recordSystemError('Symphony stream dropped.')

    const firstSnapshot = journal.getSnapshot()
    expect(firstSnapshot.pinnedEvents).toHaveLength(1)
    const firstEventId = firstSnapshot.pinnedEvents[0]!.eventId

    journal.setPinnedEvent(firstEventId, false)
    expect(journal.getSnapshot().pinnedEvents).toHaveLength(0)

    journal.setPinnedEvent(firstEventId, true)
    const repinnedSnapshot = journal.getSnapshot()
    expect(repinnedSnapshot.pinnedEvents).toHaveLength(1)
    expect(repinnedSnapshot.pinnedEvents[0]!.eventId).toBe(firstEventId)
    expect(repinnedSnapshot.pinnedEvents[0]!.automatic).toBe(false)
  })

  test('enforces ring buffer truncation caps', () => {
    const journal = new AgentActivityJournal({ eventCap: 2, verboseCap: 3 })
    journal.recordSystemError('error-a')
    journal.recordSystemError('error-b')
    journal.recordSystemError('error-c')

    const snapshot = journal.getSnapshot()
    expect(snapshot.events).toHaveLength(2)
    expect(snapshot.events.map((event) => event.message)).toEqual(['error-b', 'error-c'])
    expect(snapshot.verbose).toHaveLength(3)
  })

  test('records escalation response failures as pinned escalation errors', () => {
    const journal = new AgentActivityJournal()
    const response: SymphonyEscalationResponseCommandResult = {
      success: false,
      snapshot: buildSnapshot([]),
      result: {
        requestId: 'req-1',
        ok: false,
        status: 500,
        message: 'Escalation response failed (500).',
        submittedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    }

    journal.ingestEscalationResponse(response)

    const snapshot = journal.getSnapshot()
    expect(snapshot.events.some((event) => event.kind === 'escalation.response')).toBe(true)
    expect(snapshot.pinnedEvents).toHaveLength(1)
    expect(snapshot.pinnedEvents[0]?.source).toBe('escalation')
  })

  test('records CLI tool lifecycle and pins tool failures', () => {
    const journal = new AgentActivityJournal()

    journal.ingestCliChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'echo hello' },
    })
    journal.ingestCliChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-1',
      toolName: 'bash',
      isError: true,
      error: 'Command failed with exit code 1.',
    })

    const snapshot = journal.getSnapshot()
    expect(snapshot.events.some((event) => event.kind === 'cli.tool_start')).toBe(true)
    expect(snapshot.events.some((event) => event.kind === 'cli.tool_error')).toBe(true)
    expect(snapshot.pinnedEvents).toHaveLength(1)
    expect(snapshot.pinnedEvents[0]?.kind).toBe('cli.tool_error')
  })

  test('records CLI lifecycle and verbose-only message/thinking events', () => {
    const journal = new AgentActivityJournal()

    journal.ingestCliChatEvent({ type: 'agent_start' })
    journal.ingestCliChatEvent({ type: 'agent_end' })
    journal.ingestCliChatEvent({ type: 'turn_start' })
    journal.ingestCliChatEvent({ type: 'turn_end' })
    journal.ingestCliChatEvent({
      type: 'tool_update',
      toolCallId: 'tool-2',
      toolName: 'bash',
      status: 'failed',
      partialStdout: 'stderr',
    })
    journal.ingestCliChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-2',
      toolName: 'bash',
      isError: false,
      result: { command: 'echo ok', stdout: 'ok', stderr: '' },
    })
    journal.ingestCliChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-3',
      toolName: 'bash',
      isError: true,
    })
    journal.ingestCliChatEvent({ type: 'agent_error', message: 'agent exploded' })
    journal.ingestCliChatEvent({
      type: 'subprocess_crash',
      message: 'process crashed',
      exitCode: 137,
      signal: 'SIGKILL',
      stderrLines: ['line-1'],
    })
    journal.ingestCliChatEvent({ type: 'thinking_start', messageId: 'm1' })
    journal.ingestCliChatEvent({ type: 'thinking_delta', messageId: 'm1', delta: '...' })
    journal.ingestCliChatEvent({ type: 'thinking_end', messageId: 'm1', content: 'done' })
    journal.ingestCliChatEvent({ type: 'message_start', messageId: 'm1', role: 'assistant' })
    journal.ingestCliChatEvent({ type: 'text_delta', messageId: 'm1', delta: 'hello' })
    journal.ingestCliChatEvent({ type: 'message_end', messageId: 'm1', text: 'hello' })
    journal.ingestCliChatEvent({ type: 'history_user_message', messageId: 'u1', text: 'hi' })
    journal.ingestCliChatEvent({ type: 'tool_update', toolCallId: 'tool-4', toolName: 'read' })
    journal.ingestCliChatEvent({ type: 'unknown_case' } as any)

    const snapshot = journal.getSnapshot()
    const eventKinds = new Set(snapshot.events.map((event) => event.kind))
    const verboseKinds = new Set(snapshot.verbose.map((event) => event.kind))

    expect(eventKinds.has('cli.agent_start')).toBe(true)
    expect(eventKinds.has('cli.agent_end')).toBe(true)
    expect(eventKinds.has('cli.turn_start')).toBe(true)
    expect(eventKinds.has('cli.turn_end')).toBe(true)
    expect(eventKinds.has('cli.tool_end')).toBe(true)
    expect(eventKinds.has('cli.agent_error')).toBe(true)
    expect(eventKinds.has('cli.subprocess_crash')).toBe(true)
    expect(eventKinds.has('cli.tool_error')).toBe(true)

    expect(snapshot.events.some((event) => event.kind === 'cli.tool_update')).toBe(false)
    expect(verboseKinds.has('cli.tool_update')).toBe(true)
    expect(verboseKinds.has('cli.message_start')).toBe(true)
    expect(verboseKinds.has('cli.text_delta')).toBe(true)
    expect(verboseKinds.has('cli.message_end')).toBe(true)
    expect(verboseKinds.has('cli.thinking_start')).toBe(true)
    expect(verboseKinds.has('cli.thinking_delta')).toBe(true)
    expect(verboseKinds.has('cli.thinking_end')).toBe(true)
    expect(verboseKinds.has('cli.history_user_message')).toBe(true)

    expect(
      snapshot.verbose.some((event) => event.kind === 'cli.tool_update' && event.severity === 'warning'),
    ).toBe(true)
    expect(
      snapshot.verbose.some(
        (event) => event.kind === 'cli.tool_update' && event.details?.status === null && event.severity === 'info',
      ),
    ).toBe(true)
    expect(snapshot.events.some((event) => event.message === 'Tool failed: bash.')).toBe(true)
  })
})
