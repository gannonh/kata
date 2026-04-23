import { EventEmitter } from 'node:events'
import type {
  AgentActivityEvent,
  AgentActivitySeverity,
  AgentActivitySnapshot,
  AgentActivitySource,
  AgentActivityUpdate,
  AgentPinnedErrorIncident,
  ChatEvent,
  SymphonyEscalationResponseCommandResult,
  SymphonyOperatorSnapshot,
  SymphonyOperatorWorkerRow,
  SymphonyRuntimeStatus,
} from '../shared/types'

export const AGENT_ACTIVITY_DEFAULT_EVENT_CAP = 2_000
export const AGENT_ACTIVITY_DEFAULT_VERBOSE_CAP = 20_000

interface AgentActivityJournalEvents {
  update: (update: AgentActivityUpdate) => void
}

interface AgentActivityJournalOptions {
  eventCap?: number
  verboseCap?: number
}

interface DeltaAccumulator {
  generatedAt: string
  appendedEvents: AgentActivityEvent[]
  appendedVerbose: AgentActivityEvent[]
  upsertedPinnedErrors: AgentPinnedErrorIncident[]
  removedPinnedErrorIds: string[]
}

interface EventInput {
  timestamp?: string
  source: AgentActivitySource
  severity: AgentActivitySeverity
  kind: string
  message: string
  workerId?: string
  issueId?: string
  issueIdentifier?: string
  requestId?: string
  connectionState?: AgentActivityEvent['connectionState']
  details?: Record<string, unknown>
}

interface CliEventContext {
  workerId?: string
  issueId?: string
  issueIdentifier?: string
}

export class AgentActivityJournal extends EventEmitter {
  private readonly eventCap: number
  private readonly verboseCap: number
  private readonly events: AgentActivityEvent[] = []
  private readonly verbose: AgentActivityEvent[] = []
  private readonly pinnedByFingerprint = new Map<string, AgentPinnedErrorIncident>()
  private readonly fingerprintByIncidentId = new Map<string, string>()
  private previousRuntimeStatus: SymphonyRuntimeStatus | null = null
  private previousOperatorSnapshot: SymphonyOperatorSnapshot | null = null
  private sequence = 0
  private incidentSequence = 0

  constructor(options: AgentActivityJournalOptions = {}) {
    super()
    this.eventCap = Math.max(1, options.eventCap ?? AGENT_ACTIVITY_DEFAULT_EVENT_CAP)
    this.verboseCap = Math.max(1, options.verboseCap ?? AGENT_ACTIVITY_DEFAULT_VERBOSE_CAP)
  }

  override on<K extends keyof AgentActivityJournalEvents>(event: K, listener: AgentActivityJournalEvents[K]): this {
    return super.on(event, listener)
  }

  override off<K extends keyof AgentActivityJournalEvents>(event: K, listener: AgentActivityJournalEvents[K]): this {
    return super.off(event, listener)
  }

  override emit<K extends keyof AgentActivityJournalEvents>(
    event: K,
    ...args: Parameters<AgentActivityJournalEvents[K]>
  ): boolean {
    return super.emit(event, ...args)
  }

  public getSnapshot(): AgentActivitySnapshot {
    return {
      generatedAt: new Date().toISOString(),
      events: this.events.slice(),
      verbose: this.verbose.slice(),
      pinnedErrors: Array.from(this.pinnedByFingerprint.values()).sort((left, right) =>
        left.lastSeenAt.localeCompare(right.lastSeenAt),
      ),
    }
  }

  public dismissPinnedError(incidentId: string): AgentActivitySnapshot {
    const trimmedIncidentId = incidentId.trim()
    const fingerprint = this.fingerprintByIncidentId.get(trimmedIncidentId)
    if (!fingerprint) {
      return this.getSnapshot()
    }

    this.fingerprintByIncidentId.delete(trimmedIncidentId)
    this.pinnedByFingerprint.delete(fingerprint)

    this.emitUpdate({
      generatedAt: new Date().toISOString(),
      removedPinnedErrorIds: [trimmedIncidentId],
    })

    return this.getSnapshot()
  }

  public recordSystemError(message: string, details?: Record<string, unknown>): void {
    const delta = this.createDelta()
    this.recordEvent(
      {
        source: 'system',
        severity: 'error',
        kind: 'system.error',
        message,
        details,
      },
      delta,
      { toEvents: true, toVerbose: true },
    )
    this.flushDelta(delta)
  }

  public ingestRuntimeStatus(status: SymphonyRuntimeStatus): void {
    const delta = this.createDelta()
    const previous = this.previousRuntimeStatus
    const timestamp = status.updatedAt

    if (!previous || previous.phase !== status.phase) {
      this.recordEvent(
        {
          timestamp,
          source: 'runtime',
          severity: status.phase === 'failed' || status.phase === 'config_error' ? 'error' : 'info',
          kind: 'runtime.phase_changed',
          message: `Runtime phase is now ${status.phase}.`,
          details: {
            previousPhase: previous?.phase ?? null,
            nextPhase: status.phase,
            restartCount: status.restartCount,
          },
        },
        delta,
        { toEvents: true, toVerbose: true },
      )
    }

    const previousErrorKey = previous?.lastError
      ? `${previous.lastError.code}:${previous.lastError.message}`
      : null
    const nextErrorKey = status.lastError ? `${status.lastError.code}:${status.lastError.message}` : null
    if (nextErrorKey && previousErrorKey !== nextErrorKey) {
      this.recordEvent(
        {
          timestamp,
          source: 'runtime',
          severity: 'error',
          kind: 'runtime.error',
          message: status.lastError?.message ?? 'Runtime error',
          details: {
            code: status.lastError?.code ?? null,
            phase: status.lastError?.phase ?? null,
            details: status.lastError?.details ?? null,
          },
        },
        delta,
        { toEvents: true, toVerbose: true },
      )
    }

    const prevStdoutLength = previous?.diagnostics.stdout.length ?? 0
    const prevStderrLength = previous?.diagnostics.stderr.length ?? 0
    const nextStdoutLength = status.diagnostics.stdout.length
    const nextStderrLength = status.diagnostics.stderr.length
    if (prevStdoutLength !== nextStdoutLength || prevStderrLength !== nextStderrLength) {
      this.recordEvent(
        {
          timestamp,
          source: 'runtime',
          severity: nextStderrLength > prevStderrLength ? 'warning' : 'info',
          kind: 'runtime.diagnostics_updated',
          message: `Runtime diagnostics updated (stdout=${nextStdoutLength}, stderr=${nextStderrLength}).`,
          details: {
            prevStdoutLength,
            nextStdoutLength,
            prevStderrLength,
            nextStderrLength,
          },
        },
        delta,
        { toEvents: false, toVerbose: true },
      )
    }

    this.previousRuntimeStatus = structuredClone(status)
    this.flushDelta(delta)
  }

  public ingestOperatorSnapshot(snapshot: SymphonyOperatorSnapshot): void {
    const delta = this.createDelta()
    const previous = this.previousOperatorSnapshot
    const timestamp = snapshot.fetchedAt

    if (
      !previous ||
      previous.connection.state !== snapshot.connection.state ||
      previous.connection.lastError !== snapshot.connection.lastError
    ) {
      const severity: AgentActivitySeverity =
        snapshot.connection.state === 'disconnected'
          ? 'error'
          : snapshot.connection.state === 'reconnecting'
            ? 'warning'
            : 'info'
      this.recordEvent(
        {
          timestamp,
          source: 'connection',
          severity,
          kind: 'connection.state_changed',
          message: `Connection state is ${snapshot.connection.state}.`,
          connectionState: snapshot.connection.state,
          details: {
            previousState: previous?.connection.state ?? null,
            nextState: snapshot.connection.state,
            lastError: snapshot.connection.lastError ?? null,
          },
        },
        delta,
        { toEvents: true, toVerbose: true },
      )
    }

    const previousWorkers = new Map((previous?.workers ?? []).map((worker) => [worker.issueId, worker]))
    const nextWorkers = new Map(snapshot.workers.map((worker) => [worker.issueId, worker]))

    for (const nextWorker of snapshot.workers) {
      const previousWorker = previousWorkers.get(nextWorker.issueId)
      if (!previousWorker) {
        this.recordWorkerAdded(nextWorker, timestamp, delta)
        continue
      }

      if (previousWorker.state !== nextWorker.state) {
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: 'info',
            kind: 'worker.state_changed',
            message: `${nextWorker.identifier} moved to ${nextWorker.state}.`,
            workerId: nextWorker.identifier,
            issueId: nextWorker.issueId,
            issueIdentifier: nextWorker.identifier,
            details: {
              previousState: previousWorker.state,
              nextState: nextWorker.state,
            },
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
      }

      if (previousWorker.toolName !== nextWorker.toolName) {
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: 'info',
            kind: 'worker.tool_changed',
            message: `${nextWorker.identifier} switched tool to ${nextWorker.toolName}.`,
            workerId: nextWorker.identifier,
            issueId: nextWorker.issueId,
            issueIdentifier: nextWorker.identifier,
            details: {
              previousTool: previousWorker.toolName,
              nextTool: nextWorker.toolName,
            },
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
      }

      if (nextWorker.lastError && previousWorker.lastError !== nextWorker.lastError) {
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: 'error',
            kind: 'worker.error',
            message: nextWorker.lastError,
            workerId: nextWorker.identifier,
            issueId: nextWorker.issueId,
            issueIdentifier: nextWorker.identifier,
            details: {
              previousError: previousWorker.lastError ?? null,
              nextError: nextWorker.lastError,
            },
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
      }
    }

    for (const previousWorker of previous?.workers ?? []) {
      if (nextWorkers.has(previousWorker.issueId)) {
        continue
      }
      this.recordEvent(
        {
          timestamp,
          source: 'worker',
          severity: 'info',
          kind: 'worker.removed',
          message: `${previousWorker.identifier} is no longer active.`,
          workerId: previousWorker.identifier,
          issueId: previousWorker.issueId,
          issueIdentifier: previousWorker.identifier,
        },
        delta,
        { toEvents: true, toVerbose: true },
      )
    }

    const previousEscalations = new Set((previous?.escalations ?? []).map((item) => item.requestId))
    const nextEscalations = new Set(snapshot.escalations.map((item) => item.requestId))

    for (const escalation of snapshot.escalations) {
      if (previousEscalations.has(escalation.requestId)) {
        continue
      }
      this.recordEvent(
        {
          timestamp,
          source: 'escalation',
          severity: 'warning',
          kind: 'escalation.created',
          message: `Escalation created for ${escalation.issueIdentifier}.`,
          issueId: escalation.issueId,
          issueIdentifier: escalation.issueIdentifier,
          requestId: escalation.requestId,
          details: {
            questionPreview: escalation.questionPreview,
            timeoutMs: escalation.timeoutMs,
          },
        },
        delta,
        { toEvents: true, toVerbose: true },
      )
    }

    for (const previousEscalation of previous?.escalations ?? []) {
      if (nextEscalations.has(previousEscalation.requestId)) {
        continue
      }
      this.recordEvent(
        {
          timestamp,
          source: 'escalation',
          severity: 'info',
          kind: 'escalation.resolved',
          message: `Escalation resolved for ${previousEscalation.issueIdentifier}.`,
          issueId: previousEscalation.issueId,
          issueIdentifier: previousEscalation.issueIdentifier,
          requestId: previousEscalation.requestId,
        },
        delta,
        { toEvents: true, toVerbose: true },
      )
    }

    if (!previous || previous.queueCount !== snapshot.queueCount || previous.completedCount !== snapshot.completedCount) {
      this.recordEvent(
        {
          timestamp,
          source: 'system',
          severity: 'info',
          kind: 'operator.counters_updated',
          message: `Operator counters: queue=${snapshot.queueCount}, completed=${snapshot.completedCount}.`,
          details: {
            previousQueue: previous?.queueCount ?? null,
            nextQueue: snapshot.queueCount,
            previousCompleted: previous?.completedCount ?? null,
            nextCompleted: snapshot.completedCount,
          },
        },
        delta,
        { toEvents: false, toVerbose: true },
      )
    }

    this.previousOperatorSnapshot = structuredClone(snapshot)
    this.flushDelta(delta)
  }

  public ingestEscalationResponse(response: SymphonyEscalationResponseCommandResult): void {
    const delta = this.createDelta()
    const result = response.result
    const timestamp = result?.completedAt ?? new Date().toISOString()
    const message = result?.message ?? 'Escalation response command completed.'

    this.recordEvent(
      {
        timestamp,
        source: 'escalation',
        severity: response.success ? 'info' : 'error',
        kind: 'escalation.response',
        message,
        requestId: result?.requestId,
        details: {
          status: result?.status ?? null,
          ok: result?.ok ?? response.success,
        },
      },
      delta,
      { toEvents: true, toVerbose: true },
    )

    this.flushDelta(delta)
  }

  public ingestCliChatEvent(chatEvent: ChatEvent, context: CliEventContext = {}): void {
    const delta = this.createDelta()
    const timestamp = new Date().toISOString()
    const issuePrefix = context.issueIdentifier ? `[${context.issueIdentifier}] ` : ''
    const workerId = context.workerId ?? context.issueIdentifier

    switch (chatEvent.type) {
      case 'agent_start':
        this.recordEvent(
          {
            timestamp,
            source: 'runtime',
            severity: 'info',
            kind: 'cli.agent_start',
            message: `${issuePrefix}CLI agent started.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'agent_end':
        this.recordEvent(
          {
            timestamp,
            source: 'runtime',
            severity: 'info',
            kind: 'cli.agent_end',
            message: `${issuePrefix}CLI agent ended.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'turn_start':
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: 'info',
            kind: 'cli.turn_start',
            message: `${issuePrefix}Worker turn started.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'turn_end':
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: 'info',
            kind: 'cli.turn_end',
            message: `${issuePrefix}Worker turn ended.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'tool_start':
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: 'info',
            kind: 'cli.tool_start',
            message: `${issuePrefix}Tool started: ${chatEvent.toolName}.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
            details: {
              toolCallId: chatEvent.toolCallId,
              toolName: chatEvent.toolName,
              args: chatEvent.args,
            },
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'tool_update':
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: toCliToolUpdateSeverity(chatEvent.status),
            kind: 'cli.tool_update',
            message: `${issuePrefix}Tool update: ${chatEvent.toolName}${chatEvent.status ? ` (${chatEvent.status})` : ''}.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
            details: {
              toolCallId: chatEvent.toolCallId,
              toolName: chatEvent.toolName,
              status: chatEvent.status ?? null,
              partialStdout: chatEvent.partialStdout ?? null,
              partialResult: chatEvent.partialResult ?? null,
            },
          },
          delta,
          { toEvents: false, toVerbose: true },
        )
        break

      case 'tool_end':
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: chatEvent.isError ? 'error' : 'info',
            kind: chatEvent.isError ? 'cli.tool_error' : 'cli.tool_end',
            message: chatEvent.isError
              ? `${issuePrefix}${chatEvent.error || `Tool failed: ${chatEvent.toolName}.`}`
              : `${issuePrefix}Tool completed: ${chatEvent.toolName}.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
            details: {
              toolCallId: chatEvent.toolCallId,
              toolName: chatEvent.toolName,
              isError: chatEvent.isError,
              result: chatEvent.result ?? null,
            },
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'agent_error':
        this.recordEvent(
          {
            timestamp,
            source: 'runtime',
            severity: 'error',
            kind: 'cli.agent_error',
            message: `${issuePrefix}${chatEvent.message}`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'subprocess_crash':
        this.recordEvent(
          {
            timestamp,
            source: 'runtime',
            severity: 'error',
            kind: 'cli.subprocess_crash',
            message: `${issuePrefix}${chatEvent.message}`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
            details: {
              exitCode: chatEvent.exitCode,
              signal: chatEvent.signal,
              stderrLines: chatEvent.stderrLines,
            },
          },
          delta,
          { toEvents: true, toVerbose: true },
        )
        break

      case 'thinking_start':
      case 'thinking_delta':
      case 'thinking_end':
      case 'message_start':
      case 'text_delta':
      case 'message_end':
      case 'history_user_message':
        this.recordEvent(
          {
            timestamp,
            source: 'worker',
            severity: 'info',
            kind: `cli.${chatEvent.type}`,
            message: `${issuePrefix}CLI event: ${chatEvent.type}.`,
            workerId,
            issueId: context.issueId,
            issueIdentifier: context.issueIdentifier,
          },
          delta,
          { toEvents: false, toVerbose: true },
        )
        break

      default:
        break
    }

    this.flushDelta(delta)
  }

  private recordWorkerAdded(worker: SymphonyOperatorWorkerRow, timestamp: string, delta: DeltaAccumulator): void {
    this.recordEvent(
      {
        timestamp,
        source: 'worker',
        severity: 'info',
        kind: 'worker.added',
        message: `${worker.identifier} started ${worker.state}.`,
        workerId: worker.identifier,
        issueId: worker.issueId,
        issueIdentifier: worker.identifier,
        details: {
          state: worker.state,
          tool: worker.toolName,
          model: worker.model,
        },
      },
      delta,
      { toEvents: true, toVerbose: true },
    )
  }

  private recordEvent(
    input: EventInput,
    delta: DeltaAccumulator,
    options: { toEvents: boolean; toVerbose: boolean },
  ): void {
    const timestamp = input.timestamp ?? new Date().toISOString()
    const common = {
      id: this.nextEventId(timestamp),
      timestamp,
      source: input.source,
      severity: input.severity,
      kind: input.kind,
      message: input.message,
      ...(input.workerId ? { workerId: input.workerId } : {}),
      ...(input.issueId ? { issueId: input.issueId } : {}),
      ...(input.issueIdentifier ? { issueIdentifier: input.issueIdentifier } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.connectionState ? { connectionState: input.connectionState } : {}),
      ...(input.details ? { details: input.details } : {}),
    } satisfies Omit<AgentActivityEvent, 'stream'>

    let primaryEvent: AgentActivityEvent | null = null

    if (options.toEvents) {
      const event: AgentActivityEvent = { ...common, stream: 'events' }
      this.events.push(event)
      trimBuffer(this.events, this.eventCap)
      delta.appendedEvents.push(event)
      primaryEvent = event
    }

    if (options.toVerbose) {
      const verboseEvent: AgentActivityEvent = { ...common, stream: 'verbose' }
      this.verbose.push(verboseEvent)
      trimBuffer(this.verbose, this.verboseCap)
      delta.appendedVerbose.push(verboseEvent)
      primaryEvent ??= verboseEvent
    }

    if (primaryEvent && primaryEvent.severity === 'error') {
      this.upsertPinned(primaryEvent, delta)
    }
  }

  private upsertPinned(event: AgentActivityEvent, delta: DeltaAccumulator): void {
    const fingerprint = buildFingerprint(event)
    const existing = this.pinnedByFingerprint.get(fingerprint)
    if (existing) {
      const updated: AgentPinnedErrorIncident = {
        ...existing,
        message: event.message,
        lastSeenAt: event.timestamp,
        occurrences: existing.occurrences + 1,
        lastEventId: event.id,
      }
      this.pinnedByFingerprint.set(fingerprint, updated)
      this.fingerprintByIncidentId.set(updated.incidentId, fingerprint)
      delta.upsertedPinnedErrors.push(updated)
      return
    }

    const incidentId = this.nextIncidentId(event.timestamp)
    const incident: AgentPinnedErrorIncident = {
      incidentId,
      fingerprint,
      source: event.source,
      kind: event.kind,
      message: event.message,
      severity: 'error',
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
      occurrences: 1,
      lastEventId: event.id,
    }
    this.pinnedByFingerprint.set(fingerprint, incident)
    this.fingerprintByIncidentId.set(incidentId, fingerprint)
    delta.upsertedPinnedErrors.push(incident)
  }

  private nextEventId(timestamp: string): string {
    this.sequence += 1
    return `evt:${timestamp}:${this.sequence}`
  }

  private nextIncidentId(timestamp: string): string {
    this.incidentSequence += 1
    return `incident:${timestamp}:${this.incidentSequence}`
  }

  private createDelta(): DeltaAccumulator {
    return {
      generatedAt: new Date().toISOString(),
      appendedEvents: [],
      appendedVerbose: [],
      upsertedPinnedErrors: [],
      removedPinnedErrorIds: [],
    }
  }

  private flushDelta(delta: DeltaAccumulator): void {
    if (
      delta.appendedEvents.length === 0 &&
      delta.appendedVerbose.length === 0 &&
      delta.upsertedPinnedErrors.length === 0 &&
      delta.removedPinnedErrorIds.length === 0
    ) {
      return
    }

    this.emitUpdate({
      generatedAt: delta.generatedAt,
      ...(delta.appendedEvents.length > 0 ? { appendedEvents: delta.appendedEvents } : {}),
      ...(delta.appendedVerbose.length > 0 ? { appendedVerbose: delta.appendedVerbose } : {}),
      ...(delta.upsertedPinnedErrors.length > 0 ? { upsertedPinnedErrors: delta.upsertedPinnedErrors } : {}),
      ...(delta.removedPinnedErrorIds.length > 0 ? { removedPinnedErrorIds: delta.removedPinnedErrorIds } : {}),
    })
  }

  private emitUpdate(update: AgentActivityUpdate): void {
    this.emit('update', update)
  }
}

function trimBuffer<T>(buffer: T[], cap: number): void {
  if (buffer.length <= cap) {
    return
  }
  buffer.splice(0, buffer.length - cap)
}

function buildFingerprint(event: AgentActivityEvent): string {
  const normalizedMessage = event.message.trim().toLowerCase()
  const issue = event.issueIdentifier ?? event.issueId ?? ''
  const request = event.requestId ?? ''
  return `${event.source}|${event.kind}|${issue}|${request}|${normalizedMessage}`
}

function toCliToolUpdateSeverity(status: string | undefined): AgentActivitySeverity {
  const normalized = status?.trim().toLowerCase()
  if (!normalized) {
    return 'info'
  }

  if (
    normalized.includes('error') ||
    normalized.includes('failed') ||
    normalized.includes('cancel') ||
    normalized.includes('denied')
  ) {
    return 'warning'
  }

  return 'info'
}
