import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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

  emitError() {
    this.onerror?.({})
  }

  emitClose() {
    this.onclose?.({ code: 1006, reason: 'network' })
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

const DISCONNECTED_STATUS: SymphonyRuntimeStatus = {
  ...READY_STATUS,
  phase: 'failed',
  managedProcessRunning: false,
  url: null,
  lastError: {
    code: 'PROCESS_EXITED',
    phase: 'process',
    message: 'Runtime exited.',
  },
}

describe('SymphonyOperatorService', () => {
  let fakeSocket: FakeWebSocket

  beforeEach(() => {
    fakeSocket = new FakeWebSocket()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  test('applies escalation stream events incrementally and removes responded entries', async () => {
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

    fakeSocket.emitMessage({ sequence: 5, event: 'escalation_responded', payload: { request_id: 'req-5' } })
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

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })

    await service.syncRuntimeStatus(READY_STATUS)

    const result = await service.respondToEscalation('req-1', 'Proceed with retry')
    expect(result.success).toBe(true)
    expect(result.result?.ok).toBe(true)

    const stateFetchCount = fetchImpl.mock.calls.filter((call) => String(call[0]).endsWith('/api/v1/state')).length
    expect(stateFetchCount).toBeGreaterThanOrEqual(2)
  })

  test('marks disconnected when no URL is available for refresh/respond', async () => {
    const service = new SymphonyOperatorService({
      fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
      createWebSocket: () => fakeSocket,
    })

    const snapshot = await service.refreshBaseline()
    expect(snapshot.connection.state).toBe('disconnected')

    const response = await service.respondToEscalation('req-missing', 'Ack')
    expect(response.success).toBe(false)
    expect(response.result?.message).toContain('URL is unavailable')
  })

  test('supports mocked dashboard baselines and mocked response failure/success branches', async () => {
    const reconnectingService = new SymphonyOperatorService({
      env: { KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK: 'reconnecting' },
      createWebSocket: () => fakeSocket,
    })

    await reconnectingService.syncRuntimeStatus(READY_STATUS)
    expect(reconnectingService.getSnapshot().connection.state).toBe('reconnecting')
    expect(reconnectingService.getSnapshot().queueCount).toBe(2)

    const failingService = new SymphonyOperatorService({
      env: { KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK: 'response_failure' },
      createWebSocket: () => fakeSocket,
    })

    await failingService.syncRuntimeStatus(READY_STATUS)
    const failed = await failingService.respondToEscalation('req-123', 'Nope')
    expect(failed.success).toBe(false)
    expect(failed.result?.status).toBe(422)

    const mockedSuccessService = new SymphonyOperatorService({
      env: { KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK: 'ready' },
      createWebSocket: () => fakeSocket,
    })

    await mockedSuccessService.syncRuntimeStatus(READY_STATUS)
    const success = await mockedSuccessService.respondToEscalation('req-123', 'Approved')
    expect(success.success).toBe(true)
    expect(success.snapshot.escalations).toHaveLength(0)
  })

  test('handles runtime phase transitions and stream reconnect path', async () => {
    vi.useFakeTimers()

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return {
        ok: true,
        json: async () => ({ pending: [] }),
      } as Response
    })

    const socketFactory = vi.fn(() => fakeSocket)
    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: socketFactory })

    await service.syncRuntimeStatus({ ...READY_STATUS, phase: 'starting' })
    expect(service.getSnapshot().connection.state).toBe('reconnecting')

    await service.syncRuntimeStatus(READY_STATUS)
    expect(socketFactory).toHaveBeenCalledTimes(1)

    fakeSocket.emitError()
    expect(service.getSnapshot().connection.state).toBe('reconnecting')

    fakeSocket.emitClose()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(fetchImpl.mock.calls.filter((call) => String(call[0]).endsWith('/api/v1/state')).length).toBeGreaterThanOrEqual(2)
  })

  test('handles failed state refresh and supervisor disconnect status', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('network down')
    })

    const service = new SymphonyOperatorService({ fetchImpl: failingFetch, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    expect(service.getSnapshot().connection.lastError).toContain('network down')

    await service.syncRuntimeStatus(DISCONNECTED_STATUS)
    expect(service.getSnapshot().connection.state).toBe('disconnected')
    expect(service.getSnapshot().connection.lastError).toContain('Runtime exited')
  })

  test('returns failed response result when escalation POST throws transport error', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/respond')) {
        throw new Error('transport down')
      }

      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    const result = await service.respondToEscalation('req-throw', 'Retry later')
    expect(result.success).toBe(false)
    expect(result.result?.message).toContain('transport down')
  })

  test('returns failed response result when escalation POST returns non-OK', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/respond')) {
        return { ok: false, status: 500 } as Response
      }

      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    const result = await service.respondToEscalation('req-9', 'Retry later')
    expect(result.success).toBe(false)
    expect(result.result?.message).toContain('failed (500)')
  })

  test('handles snapshot stream payload and duplicate escalation creation safely', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    fakeSocket.emitMessage({
      sequence: 8,
      kind: 'snapshot',
      payload: {
        running: {
          '1': {
            issue_id: '1',
            issue_identifier: 'KAT-2338',
            issue_title: 'Snapshot from stream',
            status: 'started',
            model: 'gpt-5',
          },
        },
        retry_queue: [{ id: 'a' }, { id: 'b' }],
        completed: [{ id: 'done' }],
        pending_escalations: [
          {
            request_id: 'req-stream',
            issue_id: '1',
            issue_identifier: 'KAT-2338',
            preview: 'Need stream answer',
            created_at: new Date().toISOString(),
            timeout_ms: 300000,
          },
        ],
      },
    })

    expect(service.getSnapshot().workers).toHaveLength(1)
    expect(service.getSnapshot().queueCount).toBe(2)

    fakeSocket.emitMessage({
      event: 'escalation_created',
      payload: {
        request_id: 'req-stream',
        issue_id: '1',
        issue_identifier: 'KAT-2338',
        preview: 'duplicate',
        created_at: new Date().toISOString(),
        timeout_ms: 300000,
      },
    })

    expect(service.getSnapshot().escalations).toHaveLength(1)
  })

  test('drops invalid worker/escalation entries from baseline payload', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({
            running: {
              invalid: { issue_identifier: 'MISSING_ID' },
            },
            retry_queue: [],
            completed: [],
            pending_escalations: [],
            running_session_info: {},
          }),
        } as Response
      }

      return {
        ok: true,
        json: async () => ({
          pending: [{ issue_id: '1', issue_identifier: 'KAT-1' }],
        }),
      } as Response
    })

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    expect(service.getSnapshot().workers).toHaveLength(0)
    expect(service.getSnapshot().escalations).toHaveLength(0)
  })

  test('uses websocket URL conversion for https and ws URLs', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const openedUrls: string[] = []

    const createWebSocket = (url: string) => {
      openedUrls.push(url)
      return new FakeWebSocket()
    }

    const httpsService = new SymphonyOperatorService({ fetchImpl, createWebSocket })
    await httpsService.syncRuntimeStatus({ ...READY_STATUS, url: 'https://example.test:8443' })

    const wsService = new SymphonyOperatorService({ fetchImpl, createWebSocket })
    await wsService.syncRuntimeStatus({ ...READY_STATUS, url: 'ws://example.test:9000' })

    expect(openedUrls[0]).toBe('wss://example.test:8443/api/v1/events')
    expect(openedUrls[1]).toBe('ws://example.test:9000/api/v1/events')
  })

  test('sorts worker identifiers and escalation timestamps from baseline payloads', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({
            running: {
              '2': {
                issue_id: '2',
                issue_identifier: 'KAT-2',
                issue_title: 'Second worker',
                status: 'started',
              },
              '1': {
                issue_id: '1',
                issue_identifier: 'KAT-1',
                issue_title: 'First worker',
                status: 'started',
              },
            },
            retry_queue: [],
            completed: [],
            pending_escalations: [],
            running_session_info: {},
          }),
        } as Response
      }

      return {
        ok: true,
        json: async () => ({
          pending: [
            {
              request_id: 'req-new',
              issue_id: '1',
              issue_identifier: 'KAT-1',
              preview: 'newer escalation',
              created_at: '2026-01-02T00:00:00.000Z',
              timeout_ms: 300000,
            },
            {
              request_id: 'req-old',
              issue_id: '2',
              issue_identifier: 'KAT-2',
              preview: 'older escalation',
              created_at: '2026-01-01T00:00:00.000Z',
              timeout_ms: 300000,
            },
          ],
        }),
      } as Response
    })

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    expect(service.getSnapshot().workers.map((worker) => worker.identifier)).toEqual(['KAT-1', 'KAT-2'])
    expect(service.getSnapshot().escalations.map((escalation) => escalation.requestId)).toEqual(['req-old', 'req-new'])
  })

  test('sorts escalation_created stream events by createdAt', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return {
        ok: true,
        json: async () => ({
          pending: [
            {
              request_id: 'req-late',
              issue_id: '1',
              issue_identifier: 'KAT-1',
              preview: 'later',
              created_at: '2026-01-02T00:00:00.000Z',
              timeout_ms: 300000,
            },
          ],
        }),
      } as Response
    })

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    fakeSocket.emitMessage({
      event: 'escalation_created',
      payload: {
        request_id: 'req-early',
        issue_id: '2',
        issue_identifier: 'KAT-2',
        preview: 'earlier',
        created_at: '2026-01-01T00:00:00.000Z',
        timeout_ms: 300000,
      },
    })

    expect(service.getSnapshot().escalations.map((escalation) => escalation.requestId)).toEqual(['req-early', 'req-late'])
  })

  test('clears pending reconnect timer when runtime stops', async () => {
    vi.useFakeTimers()

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const socketFactory = vi.fn(() => fakeSocket)
    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: socketFactory })
    await service.syncRuntimeStatus(READY_STATUS)

    fakeSocket.emitClose()
    await service.syncRuntimeStatus({ ...READY_STATUS, phase: 'idle' })
    await vi.advanceTimersByTimeAsync(1_200)

    expect(socketFactory).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot().connection.state).toBe('disconnected')
  })

  test('ignores blank stream messages and tolerates malformed payloads', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: () => fakeSocket })
    await service.syncRuntimeStatus(READY_STATUS)

    fakeSocket.onmessage?.({ data: '   ' })
    fakeSocket.onmessage?.({ data: '{not-json' })

    expect(service.getSnapshot().connection.state).toBe('connected')
  })

  test('marks reconnecting when websocket creation throws', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const service = new SymphonyOperatorService({
      fetchImpl,
      createWebSocket: () => {
        throw new Error('socket constructor failed')
      },
    })

    await service.syncRuntimeStatus(READY_STATUS)

    expect(service.getSnapshot().connection.state).toBe('reconnecting')
    expect(service.getSnapshot().connection.lastError).toContain('socket constructor failed')
  })

  test('dispose clears scheduled reconnect timer', async () => {
    vi.useFakeTimers()

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const socketFactory = vi.fn(() => fakeSocket)
    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: socketFactory })
    await service.syncRuntimeStatus(READY_STATUS)

    fakeSocket.emitClose()
    service.dispose()
    await vi.advanceTimersByTimeAsync(1_200)

    expect(socketFactory).toHaveBeenCalledTimes(1)
  })

  test('disconnects when state endpoint fails and does not open duplicate sockets', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return { ok: false, status: 503, json: async () => ({}) } as Response
      }

      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const socketFactory = vi.fn(() => fakeSocket)
    const service = new SymphonyOperatorService({ fetchImpl, createWebSocket: socketFactory })

    await service.syncRuntimeStatus(READY_STATUS)
    expect(service.getSnapshot().connection.state).toBe('disconnected')

    // ready again should still connect once when runtime remains ready
    const healthyFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/state')) {
        return {
          ok: true,
          json: async () => ({ running: {}, retry_queue: [], completed: [], pending_escalations: [], running_session_info: {} }),
        } as Response
      }
      return { ok: true, json: async () => ({ pending: [] }) } as Response
    })

    const healthyService = new SymphonyOperatorService({ fetchImpl: healthyFetch, createWebSocket: socketFactory })
    await healthyService.syncRuntimeStatus(READY_STATUS)
    await healthyService.syncRuntimeStatus(READY_STATUS)
    expect(socketFactory).toHaveBeenCalledTimes(2)

    await healthyService.syncRuntimeStatus({ ...READY_STATUS, phase: 'idle' })
    expect(healthyService.getSnapshot().connection.state).toBe('disconnected')
  })
})
