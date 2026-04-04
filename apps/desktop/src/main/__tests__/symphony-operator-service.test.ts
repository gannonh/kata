import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { SymphonyRuntimeStatus } from '@shared/types'
import { SymphonyOperatorService } from '../symphony-operator-service'

class FakeWebSocket {
  public onopen: ((event: unknown) => void) | null = null
  public onmessage: ((event: { data?: unknown }) => void) | null = null
  public onerror: ((event: unknown) => void) | null = null
  public onclose: ((event: { code?: number; reason?: string }) => void) | null = null

  close = vi.fn(() => {
    this.onclose?.({ code: 1000, reason: 'closed' })
  })

  emitOpen() {
    this.onopen?.({})
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

const READY_STATUS: SymphonyRuntimeStatus = {
  phase: 'ready',
  managedProcessRunning: true,
  pid: 1,
  url: 'http://127.0.0.1:8080',
  diagnostics: { stdout: [], stderr: [] },
  updatedAt: new Date().toISOString(),
  restartCount: 0,
}

describe('SymphonyOperatorService', () => {
  let fakeSocket: FakeWebSocket

  beforeEach(() => {
    fakeSocket = new FakeWebSocket()
  })

  test('normalizes baseline snapshot from state and escalation endpoints', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({
            running: {
              '1': {
                issue_id: '1',
                issue_identifier: 'KAT-2338',
                issue_title: 'Dashboard work',
                status: 'in_progress',
                model: 'claude-sonnet-4-6',
              },
            },
            retry_queue: [{ id: 'r1' }],
            completed: [{ id: 'c1' }, { id: 'c2' }],
            pending_escalations: [],
            running_session_info: {
              '1': {
                current_tool_name: 'edit',
                last_activity_ms: Date.now(),
              },
            },
          }),
        } as Response
      }

      return {
        ok: true,
        json: async () => ({
          pending: [
            {
              request_id: 'req-1',
              issue_id: '1',
              issue_identifier: 'KAT-2338',
              preview: 'Need operator input',
              created_at: new Date().toISOString(),
              timeout_ms: 300000,
            },
          ],
        }),
      } as Response
    })

    const service = new SymphonyOperatorService({
      fetchImpl,
      createWebSocket: () => fakeSocket,
    })

    await service.syncRuntimeStatus(READY_STATUS)

    const snapshot = service.getSnapshot()
    expect(snapshot.queueCount).toBe(1)
    expect(snapshot.completedCount).toBe(2)
    expect(snapshot.workers).toHaveLength(1)
    expect(snapshot.workers[0]?.toolName).toBe('edit')
    expect(snapshot.escalations).toHaveLength(1)
    expect(snapshot.connection.state).toBe('connected')
    expect(snapshot.connection.lastBaselineRefreshAt).toBeTruthy()
  })

  test('applies escalation stream events incrementally', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({
            running: {},
            retry_queue: [],
            completed: [],
            pending_escalations: [],
            running_session_info: {},
          }),
        } as Response
      }

      return {
        ok: true,
        json: async () => ({ pending: [] }),
      } as Response
    })

    const service = new SymphonyOperatorService({
      fetchImpl,
      createWebSocket: () => fakeSocket,
    })

    await service.syncRuntimeStatus(READY_STATUS)
    fakeSocket.emitOpen()

    fakeSocket.emitMessage({
      sequence: 4,
      event: 'escalation_created',
      payload: {
        request_id: 'req-5',
        issue_id: '1',
        issue_identifier: 'KAT-2338',
        preview: 'Please decide on retry policy',
        created_at: new Date().toISOString(),
        timeout_ms: 300000,
      },
    })

    expect(service.getSnapshot().escalations).toHaveLength(1)
    expect(service.getSnapshot().connection.lastEventSequence).toBe(4)

    fakeSocket.emitMessage({
      sequence: 5,
      event: 'escalation_responded',
      payload: {
        request_id: 'req-5',
      },
    })

    expect(service.getSnapshot().escalations).toHaveLength(0)
  })

  test('forces baseline refresh after successful escalation response', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/respond')) {
        return {
          ok: true,
          status: 200,
        } as Response
      }

      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({
            running: {},
            retry_queue: [],
            completed: [{ id: 'done' }],
            pending_escalations: [],
            running_session_info: {},
          }),
        } as Response
      }

      return {
        ok: true,
        json: async () => ({ pending: [] }),
      } as Response
    })

    const service = new SymphonyOperatorService({
      fetchImpl,
      createWebSocket: () => fakeSocket,
    })

    await service.syncRuntimeStatus(READY_STATUS)

    const result = await service.respondToEscalation('req-1', 'Proceed with retry')
    expect(result.success).toBe(true)
    expect(result.result?.ok).toBe(true)

    const stateFetchCount = fetchImpl.mock.calls.filter((call) => String(call[0]).endsWith('/api/v1/state')).length
    expect(stateFetchCount).toBeGreaterThanOrEqual(2)
  })
})
