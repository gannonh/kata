import { EventEmitter } from 'node:events'
import type { SymphonyRuntimeStatus } from '../shared/types'
import type {
  SymphonyEscalationResponseCommandResult,
  SymphonyEscalationResponseResult,
  SymphonyOperatorEscalationItem,
  SymphonyOperatorSnapshot,
  SymphonyOperatorWorkerRow,
} from '../shared/types'

const STALE_AFTER_MS = 30_000

type FetchLike = typeof fetch

type WebSocketLike = {
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data?: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
  close: () => void
}

interface SymphonyStatePayload {
  running?: Record<string, Record<string, unknown>>
  retry_queue?: unknown[]
  completed?: unknown[]
  pending_escalations?: Array<Record<string, unknown>>
  running_session_info?: Record<string, Record<string, unknown>>
}

interface SymphonyEventEnvelope {
  sequence?: number
  kind?: string
  event?: string
  payload?: Record<string, unknown>
}

export interface SymphonyOperatorServiceOptions {
  fetchImpl?: FetchLike
  createWebSocket?: (url: string) => WebSocketLike
  env?: NodeJS.ProcessEnv
}

interface OperatorEvents {
  snapshot: (snapshot: SymphonyOperatorSnapshot) => void
}

export class SymphonyOperatorService extends EventEmitter {
  private readonly fetchImpl: FetchLike
  private readonly createWebSocket: (url: string) => WebSocketLike
  private readonly mockMode: string | null
  private runtimeStatus: SymphonyRuntimeStatus | null = null
  private activeUrl: string | null = null
  private socket: WebSocketLike | null = null
  private socketUrl: string | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private runtimeSyncRevision = 0
  private readonly snapshot: SymphonyOperatorSnapshot = createEmptySnapshot()

  constructor(options: SymphonyOperatorServiceOptions = {}) {
    super()
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.createWebSocket =
      options.createWebSocket ??
      ((url: string) => {
        const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket
        if (!WebSocketCtor) {
          throw new Error('WebSocket is unavailable in the current runtime.')
        }

        return new WebSocketCtor(url)
      })
    this.mockMode = options.env?.KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK?.trim() ?? null
  }

  override on<K extends keyof OperatorEvents>(event: K, listener: OperatorEvents[K]): this {
    return super.on(event, listener)
  }

  override emit<K extends keyof OperatorEvents>(event: K, ...args: Parameters<OperatorEvents[K]>): boolean {
    return super.emit(event, ...args)
  }

  override off<K extends keyof OperatorEvents>(event: K, listener: OperatorEvents[K]): this {
    return super.off(event, listener)
  }

  public getSnapshot(): SymphonyOperatorSnapshot {
    this.refreshFreshness()
    return this.snapshot
  }

  public async refreshBaseline(): Promise<SymphonyOperatorSnapshot> {
    const url = this.activeUrl ?? this.runtimeStatus?.url
    if (!url) {
      this.markDisconnected('Symphony URL is unavailable.')
      return this.snapshot
    }

    if (this.mockMode) {
      this.applyMockBaseline(this.mockMode)
      return this.snapshot
    }

    try {
      const [stateResponse, escalationResponse] = await Promise.all([
        this.fetchImpl(buildEndpoint(url, '/api/v1/state'), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
        this.fetchImpl(buildEndpoint(url, '/api/v1/escalations'), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
      ])

      if (!stateResponse.ok) {
        this.markDisconnected(`State request failed (${stateResponse.status}).`)
        return this.snapshot
      }

      const statePayload = (await stateResponse.json()) as SymphonyStatePayload
      const escalationsPayload = escalationResponse.ok
        ? ((await escalationResponse.json()) as { pending?: Array<Record<string, unknown>> })
        : { pending: statePayload.pending_escalations ?? [] }

      if (!escalationResponse.ok) {
        this.snapshot.connection.lastError = `Escalation request failed (${escalationResponse.status}).`
      }

      this.applyStatePayload(statePayload, escalationsPayload.pending ?? [])
      this.snapshot.connection.lastBaselineRefreshAt = new Date().toISOString()
      if (escalationResponse.ok) {
        this.snapshot.connection.lastError = undefined
      }
      this.snapshot.connection.state = 'connected'
      this.snapshot.connection.updatedAt = new Date().toISOString()
      this.refreshFreshness()
      this.emitSnapshot()
      return this.snapshot
    } catch (error) {
      this.markDisconnected(error instanceof Error ? error.message : String(error))
      return this.snapshot
    }
  }

  public async respondToEscalation(
    requestId: string,
    responseText: string,
  ): Promise<SymphonyEscalationResponseCommandResult> {
    const trimmedRequestId = requestId.trim()
    const submittedAt = new Date().toISOString()
    this.snapshot.response.submittingRequestId = trimmedRequestId
    this.emitSnapshot()

    const url = this.activeUrl ?? this.runtimeStatus?.url
    if (!url) {
      const result = buildResponseResult(trimmedRequestId, false, 0, 'Symphony URL is unavailable.', submittedAt)
      this.snapshot.response.submittingRequestId = undefined
      this.snapshot.response.lastResult = result
      this.refreshFreshness()
      this.emitSnapshot()
      return { success: false, snapshot: this.snapshot, result }
    }

    if (this.mockMode === 'response_failure') {
      const result = buildResponseResult(trimmedRequestId, false, 422, 'Mocked response failure.', submittedAt)
      this.snapshot.response.submittingRequestId = undefined
      this.snapshot.response.lastResult = result
      this.refreshFreshness()
      this.emitSnapshot()
      return { success: false, snapshot: this.snapshot, result }
    }

    if (this.mockMode) {
      const result = buildResponseResult(trimmedRequestId, true, 200, 'Escalation response accepted.', submittedAt)
      this.snapshot.escalations = this.snapshot.escalations.filter(
        (escalation) => escalation.requestId !== trimmedRequestId,
      )
      this.snapshot.response.submittingRequestId = undefined
      this.snapshot.response.lastResult = result
      this.snapshot.connection.lastBaselineRefreshAt = new Date().toISOString()
      this.refreshFreshness()
      this.emitSnapshot()
      return { success: true, snapshot: this.snapshot, result }
    }

    try {
      const response = await this.fetchImpl(
        buildEndpoint(url, `/api/v1/escalations/${encodeURIComponent(trimmedRequestId)}/respond`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            response: {
              text: responseText,
            },
          }),
        },
      )

      const result = buildResponseResult(
        trimmedRequestId,
        response.ok,
        response.status,
        response.ok ? 'Escalation response accepted.' : `Escalation response failed (${response.status}).`,
        submittedAt,
      )

      this.snapshot.response.submittingRequestId = undefined
      this.snapshot.response.lastResult = result

      if (response.ok) {
        await this.refreshBaseline()
      } else {
        this.refreshFreshness()
        this.emitSnapshot()
      }

      return {
        success: response.ok,
        snapshot: this.snapshot,
        result,
      }
    } catch (error) {
      const result = buildResponseResult(
        trimmedRequestId,
        false,
        0,
        error instanceof Error ? error.message : String(error),
        submittedAt,
      )

      this.snapshot.response.submittingRequestId = undefined
      this.snapshot.response.lastResult = result
      this.refreshFreshness()
      this.emitSnapshot()
      return { success: false, snapshot: this.snapshot, result }
    }
  }

  public async syncRuntimeStatus(status: SymphonyRuntimeStatus): Promise<void> {
    this.runtimeStatus = status
    this.activeUrl = status.url
    const syncRevision = ++this.runtimeSyncRevision

    if (!status.url || status.phase === 'config_error' || status.phase === 'failed') {
      this.stopStream()
      this.markDisconnected(status.lastError?.message ?? 'Symphony runtime unavailable.')
      return
    }

    if (status.phase === 'ready') {
      await this.refreshBaseline()
      const latestStatus = this.runtimeStatus
      if (
        syncRevision !== this.runtimeSyncRevision ||
        latestStatus?.phase !== 'ready' ||
        latestStatus.url !== status.url
      ) {
        if (latestStatus?.phase === 'starting' || latestStatus?.phase === 'restarting') {
          this.snapshot.connection.state = 'reconnecting'
          this.snapshot.connection.updatedAt = new Date().toISOString()
          this.snapshot.connection.lastError = latestStatus.lastError?.message
          this.refreshFreshness()
          this.emitSnapshot()
        } else if (latestStatus && latestStatus.phase !== 'ready') {
          this.stopStream()
          this.markDisconnected(latestStatus.lastError?.message ?? 'Symphony runtime unavailable.')
        }
        return
      }

      this.connectStream(status.url)
      return
    }

    if (status.phase === 'restarting' || status.phase === 'starting') {
      this.stopStream()
      this.snapshot.connection.state = 'reconnecting'
      this.snapshot.connection.updatedAt = new Date().toISOString()
      this.snapshot.connection.lastError = status.lastError?.message
      this.refreshFreshness()
      this.emitSnapshot()
      return
    }

    if (status.phase === 'disconnected') {
      this.stopStream()
      this.markDisconnected(status.lastError?.message ?? 'Symphony runtime disconnected.')
      return
    }

    if (status.phase === 'stopping' || status.phase === 'stopped' || status.phase === 'idle') {
      this.stopStream()
      this.markDisconnected('Symphony runtime is not running.')
    }
  }

  public dispose(): void {
    this.stopStream()
  }

  private connectStream(url: string): void {
    if (this.mockMode) {
      return
    }

    const eventUrl = toWebSocketUrl(buildEndpoint(url, '/api/v1/events'))

    if (this.socket) {
      if (this.socketUrl === eventUrl) {
        return
      }
      this.stopStream()
    }

    try {
      const socket = this.createWebSocket(eventUrl)
      this.socket = socket
      this.socketUrl = eventUrl

      socket.onopen = () => {
        this.snapshot.connection.state = 'connected'
        this.snapshot.connection.updatedAt = new Date().toISOString()
        this.snapshot.connection.lastError = undefined
        this.refreshFreshness()
        this.emitSnapshot()
      }

      socket.onmessage = (message) => {
        const raw = typeof message.data === 'string' ? message.data : ''
        if (!raw.trim()) {
          return
        }

        try {
          const event = JSON.parse(raw) as SymphonyEventEnvelope
          this.applyStreamEvent(event)
        } catch {
          // ignore malformed messages
        }
      }

      socket.onerror = () => {
        this.snapshot.connection.state = 'reconnecting'
        this.snapshot.connection.updatedAt = new Date().toISOString()
        this.snapshot.connection.lastError = 'Event stream error.'
        this.refreshFreshness()
        this.emitSnapshot()
      }

      socket.onclose = () => {
        this.socket = null
        this.socketUrl = null
        this.snapshot.connection.state = 'reconnecting'
        this.snapshot.connection.updatedAt = new Date().toISOString()
        this.refreshFreshness()
        this.emitSnapshot()

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }

        if (this.runtimeStatus?.phase === 'ready' && this.activeUrl) {
          const reconnectUrl = this.activeUrl
          this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null
            await this.refreshBaseline()
            if (this.runtimeStatus?.phase === 'ready' && this.activeUrl === reconnectUrl) {
              this.connectStream(reconnectUrl)
            }
          }, 1_000)
        }
      }
    } catch (error) {
      this.snapshot.connection.state = 'reconnecting'
      this.snapshot.connection.updatedAt = new Date().toISOString()
      this.snapshot.connection.lastError = error instanceof Error ? error.message : String(error)
      this.refreshFreshness()
      this.emitSnapshot()
    }
  }

  private stopStream(): void {
    if (this.socket) {
      this.socket.onopen = null
      this.socket.onmessage = null
      this.socket.onerror = null
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
      this.socketUrl = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private markDisconnected(reason: string): void {
    this.snapshot.connection.state = 'disconnected'
    this.snapshot.connection.updatedAt = new Date().toISOString()
    this.snapshot.connection.lastError = reason
    this.refreshFreshness(reason)
    this.emitSnapshot()
  }

  private applyStatePayload(
    payload: SymphonyStatePayload,
    escalationPayload: Array<Record<string, unknown>>,
  ): void {
    const nowIso = new Date().toISOString()
    const running = payload.running ?? {}
    const sessionInfo = payload.running_session_info ?? {}

    this.snapshot.workers = Object.values(running)
      .map((run) => this.mapWorker(run, sessionInfo[String(run.issue_id ?? '')]))
      .filter((worker): worker is SymphonyOperatorWorkerRow => Boolean(worker))
      .sort((left, right) => left.identifier.localeCompare(right.identifier))

    this.snapshot.escalations = escalationPayload
      .map((escalation) => this.mapEscalation(escalation))
      .filter((item): item is SymphonyOperatorEscalationItem => Boolean(item))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))

    this.snapshot.queueCount = Array.isArray(payload.retry_queue) ? payload.retry_queue.length : 0
    this.snapshot.completedCount = Array.isArray(payload.completed) ? payload.completed.length : 0
    this.snapshot.fetchedAt = nowIso
  }

  private applyStreamEvent(event: SymphonyEventEnvelope): void {
    if (typeof event.sequence === 'number') {
      this.snapshot.connection.lastEventSequence = event.sequence
    }

    this.snapshot.fetchedAt = new Date().toISOString()

    if (event.kind === 'snapshot' && event.payload) {
      this.applyStatePayload(event.payload as SymphonyStatePayload, ((event.payload as SymphonyStatePayload).pending_escalations ?? []) as Array<Record<string, unknown>>)
    } else if (event.event === 'escalation_created' && event.payload) {
      const nextEscalation = this.mapEscalation(event.payload)
      if (nextEscalation && !this.snapshot.escalations.some((item) => item.requestId === nextEscalation.requestId)) {
        this.snapshot.escalations = [...this.snapshot.escalations, nextEscalation].sort(
          (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
        )
      }
    } else if (
      (event.event === 'escalation_responded' ||
        event.event === 'escalation_timed_out' ||
        event.event === 'escalation_cancelled') &&
      event.payload
    ) {
      const requestId = String(event.payload.request_id ?? '').trim()
      if (requestId) {
        this.snapshot.escalations = this.snapshot.escalations.filter((item) => item.requestId !== requestId)
      }
    }

    this.refreshFreshness()
    this.emitSnapshot()
  }

  private applyMockBaseline(mockMode: string): void {
    const nowIso = new Date().toISOString()

    this.snapshot.fetchedAt = nowIso
    this.snapshot.queueCount = mockMode === 'reconnecting' ? 2 : 1
    this.snapshot.completedCount = 3
    this.snapshot.workers = [
      {
        issueId: '1',
        identifier: 'KAT-2338',
        issueTitle: 'Live Worker Dashboard and Escalation Handling',
        state: mockMode === 'reconnecting' ? 'reconnecting' : 'in_progress',
        toolName: 'edit',
        model: 'claude-sonnet-4-6',
        lastActivityAt: nowIso,
      },
    ]

    this.snapshot.escalations = [
      {
        requestId: 'req-123',
        issueId: '1',
        issueIdentifier: 'KAT-2338',
        issueTitle: 'Live Worker Dashboard and Escalation Handling',
        questionPreview: 'Need clarification on dashboard failure state copy.',
        createdAt: new Date(Date.now() - 15_000).toISOString(),
        timeoutMs: 300_000,
      },
    ]

    this.snapshot.connection.state = mockMode === 'reconnecting' ? 'reconnecting' : 'connected'
    this.snapshot.connection.updatedAt = nowIso
    this.snapshot.connection.lastBaselineRefreshAt = nowIso
    this.snapshot.connection.lastError =
      mockMode === 'reconnecting' ? 'Mocked reconnect in progress.' : undefined
    this.refreshFreshness()
    this.emitSnapshot()
  }

  private mapWorker(
    run: Record<string, unknown>,
    info: Record<string, unknown> | undefined,
  ): SymphonyOperatorWorkerRow | null {
    const issueId = String(run.issue_id ?? '').trim()
    const identifier = String(run.issue_identifier ?? '').trim()
    if (!issueId || !identifier) {
      return null
    }

    const startedAt = typeof run.started_at === 'string' ? run.started_at : undefined
    const activityMs = typeof info?.last_activity_ms === 'number' ? info.last_activity_ms : undefined

    return {
      issueId,
      identifier,
      issueTitle: String(run.issue_title ?? identifier).trim() || identifier,
      state: String(run.linear_state ?? run.status ?? 'unknown').trim(),
      toolName: String(info?.current_tool_name ?? 'idle').trim() || 'idle',
      model: String(run.model ?? 'default').trim() || 'default',
      ...(activityMs ? { lastActivityAt: new Date(activityMs).toISOString() } : startedAt ? { lastActivityAt: startedAt } : {}),
      ...(typeof run.error === 'string' && run.error.trim() ? { lastError: run.error.trim() } : {}),
    }
  }

  private mapEscalation(raw: Record<string, unknown>): SymphonyOperatorEscalationItem | null {
    const requestId = String(raw.request_id ?? '').trim()
    const issueId = String(raw.issue_id ?? '').trim()
    const issueIdentifier = String(raw.issue_identifier ?? '').trim()
    if (!requestId || !issueId || !issueIdentifier) {
      return null
    }

    return {
      requestId,
      issueId,
      issueIdentifier,
      issueTitle: issueIdentifier,
      questionPreview: String(raw.preview ?? '').trim() || 'Escalation pending response.',
      createdAt: String(raw.created_at ?? new Date().toISOString()),
      timeoutMs: Number(raw.timeout_ms ?? 0) || 0,
    }
  }

  private refreshFreshness(reason?: string): void {
    const ageMs = Date.now() - Date.parse(this.snapshot.fetchedAt)
    const isStale = Number.isFinite(ageMs) ? ageMs > STALE_AFTER_MS : true
    this.snapshot.freshness.status = isStale ? 'stale' : 'fresh'
    this.snapshot.freshness.staleReason = isStale ? reason ?? this.snapshot.connection.lastError ?? 'No recent updates.' : undefined
  }

  private emitSnapshot(): void {
    this.emit('snapshot', this.snapshot)
  }
}

function createEmptySnapshot(): SymphonyOperatorSnapshot {
  const nowIso = new Date(0).toISOString()
  return {
    fetchedAt: nowIso,
    queueCount: 0,
    completedCount: 0,
    workers: [],
    escalations: [],
    connection: {
      state: 'disconnected',
      updatedAt: nowIso,
    },
    freshness: {
      status: 'stale',
      staleReason: 'No baseline has been loaded yet.',
    },
    response: {},
  }
}

function toWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith('https://')) {
    return `wss://${httpUrl.slice('https://'.length)}`
  }

  if (httpUrl.startsWith('http://')) {
    return `ws://${httpUrl.slice('http://'.length)}`
  }

  return httpUrl
}

function buildEndpoint(baseUrl: string, endpointPath: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(endpointPath.replace(/^\//, ''), normalized).toString()
}

function buildResponseResult(
  requestId: string,
  ok: boolean,
  status: number,
  message: string,
  submittedAt: string,
): SymphonyEscalationResponseResult {
  return {
    requestId,
    ok,
    status,
    message,
    submittedAt,
    completedAt: new Date().toISOString(),
  }
}
