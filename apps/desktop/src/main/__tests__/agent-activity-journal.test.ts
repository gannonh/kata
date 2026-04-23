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

  test('auto-pins error incidents, dismisses them, and re-pins on recurrence', () => {
    const journal = new AgentActivityJournal()
    journal.recordSystemError('Symphony stream dropped.')

    const firstSnapshot = journal.getSnapshot()
    expect(firstSnapshot.pinnedErrors).toHaveLength(1)
    const firstIncidentId = firstSnapshot.pinnedErrors[0]!.incidentId

    journal.dismissPinnedError(firstIncidentId)
    expect(journal.getSnapshot().pinnedErrors).toHaveLength(0)

    journal.recordSystemError('Symphony stream dropped.')
    const secondSnapshot = journal.getSnapshot()
    expect(secondSnapshot.pinnedErrors).toHaveLength(1)
    expect(secondSnapshot.pinnedErrors[0]!.incidentId).not.toBe(firstIncidentId)
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
    expect(snapshot.pinnedErrors).toHaveLength(1)
    expect(snapshot.pinnedErrors[0]?.source).toBe('escalation')
  })
})
