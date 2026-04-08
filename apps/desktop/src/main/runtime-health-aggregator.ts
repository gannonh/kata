import { EventEmitter } from 'node:events'
import log from './logger'
import {
  mapChatBridgeStatusToReliability,
  mapChatSubprocessCrashToReliability,
  mapMcpConfigReadResponseToReliability,
  mapMcpStatusResponseToReliability,
  mapSymphonyOperatorSnapshotToReliability,
  mapSymphonyRuntimeStatusToReliability,
  mapWorkflowBoardSnapshotToReliability,
  pickPrimaryReliabilitySignal,
  RELIABILITY_SURFACES,
} from './reliability-contract'
import type {
  BridgeStatusEvent,
  McpConfigReadResponse,
  McpServerStatusResponse,
  ReliabilityRecoveryAction,
  ReliabilityRecoveryRequest,
  ReliabilityRecoveryResult,
  ReliabilitySignal,
  ReliabilitySnapshot,
  ReliabilitySourceSurface,
  ReliabilitySurfaceState,
  SymphonyOperatorSnapshot,
  SymphonyRuntimeStatus,
  WorkflowBoardSnapshot,
} from '../shared/types'

type RecoveryAttempt = {
  success: boolean
  outcome: 'succeeded' | 'failed'
  code: string
  message: string
}

interface RuntimeHealthAggregatorOptions {
  now?: () => string
  requestRecovery?: (request: {
    sourceSurface: ReliabilitySourceSurface
    action: ReliabilityRecoveryAction
  }) => Promise<RecoveryAttempt>
}

interface RuntimeHealthAggregatorEvents {
  snapshot: (snapshot: ReliabilitySnapshot) => void
}

export class RuntimeHealthAggregator extends EventEmitter {
  private readonly now: () => string
  private readonly requestRecovery?: RuntimeHealthAggregatorOptions['requestRecovery']

  private readonly surfaces = new Map<ReliabilitySourceSurface, ReliabilitySurfaceState>()

  private chatBridgeSignal: ReliabilitySignal | null = null
  private chatCrashSignal: ReliabilitySignal | null = null
  private symphonyRuntimeSignal: ReliabilitySignal | null = null
  private symphonyOperatorSignal: ReliabilitySignal | null = null
  private mcpConfigSignal: ReliabilitySignal | null = null
  private mcpStatusSignal: ReliabilitySignal | null = null

  constructor(options: RuntimeHealthAggregatorOptions = {}) {
    super()
    this.now = options.now ?? (() => new Date().toISOString())
    this.requestRecovery = options.requestRecovery

    const startedAt = this.now()
    for (const sourceSurface of RELIABILITY_SURFACES) {
      this.surfaces.set(sourceSurface, {
        sourceSurface,
        status: 'healthy',
        signal: null,
        updatedAt: startedAt,
        lastHealthyAt: startedAt,
      })
    }
  }

  override on<K extends keyof RuntimeHealthAggregatorEvents>(
    event: K,
    listener: RuntimeHealthAggregatorEvents[K],
  ): this {
    return super.on(event, listener)
  }

  override off<K extends keyof RuntimeHealthAggregatorEvents>(
    event: K,
    listener: RuntimeHealthAggregatorEvents[K],
  ): this {
    return super.off(event, listener)
  }

  override emit<K extends keyof RuntimeHealthAggregatorEvents>(
    event: K,
    ...args: Parameters<RuntimeHealthAggregatorEvents[K]>
  ): boolean {
    return super.emit(event, ...args)
  }

  public getSnapshot(): ReliabilitySnapshot {
    return this.toSnapshot()
  }

  public ingestWorkflowSnapshot(snapshot: WorkflowBoardSnapshot | null | undefined): ReliabilitySnapshot {
    this.updateSurface('workflow_board', mapWorkflowBoardSnapshotToReliability(snapshot))
    return this.toSnapshot()
  }

  public ingestChatBridgeStatus(status: BridgeStatusEvent | null | undefined): ReliabilitySnapshot {
    this.chatBridgeSignal = mapChatBridgeStatusToReliability(status)

    // A recovered bridge status supersedes any prior crash-only signal.
    if (status && status.state !== 'crashed') {
      this.chatCrashSignal = null
    }

    this.syncChatSurface()
    return this.toSnapshot()
  }

  public ingestChatSubprocessCrash(input: {
    message: string
    exitCode: number | null
    signal: NodeJS.Signals | null
    stderrLines: string[]
    timestamp?: string
  }): ReliabilitySnapshot {
    this.chatCrashSignal = mapChatSubprocessCrashToReliability(input)
    this.syncChatSurface()
    return this.toSnapshot()
  }

  public ingestSymphonyRuntimeStatus(status: SymphonyRuntimeStatus | null | undefined): ReliabilitySnapshot {
    this.symphonyRuntimeSignal = mapSymphonyRuntimeStatusToReliability(status)
    this.syncSymphonySurface()
    return this.toSnapshot()
  }

  public ingestSymphonyOperatorSnapshot(
    snapshot: SymphonyOperatorSnapshot | null | undefined,
  ): ReliabilitySnapshot {
    this.symphonyOperatorSignal = mapSymphonyOperatorSnapshotToReliability(snapshot)
    this.syncSymphonySurface()
    return this.toSnapshot()
  }

  public ingestMcpConfigResponse(response: McpConfigReadResponse | null | undefined): ReliabilitySnapshot {
    this.mcpConfigSignal = mapMcpConfigReadResponseToReliability(response)
    this.syncMcpSurface()
    return this.toSnapshot()
  }

  public ingestMcpStatusResponse(response: McpServerStatusResponse | null | undefined): ReliabilitySnapshot {
    this.mcpStatusSignal = mapMcpStatusResponseToReliability(response)
    this.syncMcpSurface()
    return this.toSnapshot()
  }

  public async requestRecoveryAction(
    request: ReliabilityRecoveryRequest,
  ): Promise<ReliabilityRecoveryResult> {
    const surface = this.surfaces.get(request.sourceSurface)
    const action = request.action ?? surface?.signal?.recoveryAction ?? 'inspect'
    const timestamp = this.now()
    const preRecoverySignal = surface?.signal ? { ...surface.signal } : null

    log.info('[runtime-health-aggregator] recovery requested', {
      sourceSurface: request.sourceSurface,
      action,
    })

    let attempt: RecoveryAttempt

    if (!this.requestRecovery) {
      attempt = {
        success: false,
        outcome: 'failed',
        code: 'RECOVERY_HANDLER_UNAVAILABLE',
        message: 'Recovery handler is unavailable.',
      }
    } else {
      try {
        attempt = await this.requestRecovery({
          sourceSurface: request.sourceSurface,
          action,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('[runtime-health-aggregator] recovery threw', {
          sourceSurface: request.sourceSurface,
          action,
          error: message,
        })
        attempt = {
          success: false,
          outcome: 'failed',
          code: 'RECOVERY_THROW',
          message,
        }
      }
    }

    log.info('[runtime-health-aggregator] recovery completed', {
      sourceSurface: request.sourceSurface,
      action,
      success: attempt.success,
      outcome: attempt.outcome,
      code: attempt.code,
      message: attempt.message,
    })

    const currentSurfaceSignal = this.surfaces.get(request.sourceSurface)?.signal
    const signalForOutcome =
      currentSurfaceSignal ?? (attempt.outcome === 'failed' ? preRecoverySignal : null)

    if (signalForOutcome) {
      this.updateSurface(request.sourceSurface, {
        ...signalForOutcome,
        recoveryAction: action,
        outcome: attempt.outcome,
        timestamp,
      })
    }

    return {
      success: attempt.success,
      sourceSurface: request.sourceSurface,
      action,
      outcome: attempt.outcome,
      code: attempt.code,
      message: attempt.message,
      timestamp,
    }
  }

  private syncChatSurface(): void {
    this.updateSurface(
      'chat_runtime',
      pickPrimaryReliabilitySignal([this.chatBridgeSignal, this.chatCrashSignal]),
    )
  }

  private syncSymphonySurface(): void {
    this.updateSurface(
      'symphony',
      pickPrimaryReliabilitySignal([this.symphonyRuntimeSignal, this.symphonyOperatorSignal]),
    )
  }

  private syncMcpSurface(): void {
    this.updateSurface('mcp', pickPrimaryReliabilitySignal([this.mcpConfigSignal, this.mcpStatusSignal]))
  }

  private updateSurface(
    sourceSurface: ReliabilitySourceSurface,
    signal: ReliabilitySignal | null,
  ): void {
    const existing = this.surfaces.get(sourceSurface)
    if (!existing) {
      return
    }

    const updatedAt = this.now()

    if (!signal) {
      this.surfaces.set(sourceSurface, {
        sourceSurface,
        status: 'healthy',
        signal: null,
        updatedAt,
        lastHealthyAt: updatedAt,
      })
      this.emit('snapshot', this.toSnapshot())
      return
    }

    const inferredLastKnownGoodAt =
      signal.lastKnownGoodAt ?? existing.signal?.lastKnownGoodAt ?? existing.lastHealthyAt

    this.surfaces.set(sourceSurface, {
      sourceSurface,
      status: 'degraded',
      signal: {
        ...signal,
        ...(inferredLastKnownGoodAt ? { lastKnownGoodAt: inferredLastKnownGoodAt } : {}),
      },
      updatedAt,
      lastHealthyAt: existing.lastHealthyAt,
    })

    this.emit('snapshot', this.toSnapshot())
  }

  private toSnapshot(): ReliabilitySnapshot {
    const surfaces = RELIABILITY_SURFACES.map((surface) => {
      const state = this.surfaces.get(surface)
      if (state) {
        return {
          ...state,
          ...(state.signal ? { signal: { ...state.signal } } : { signal: null }),
        }
      }

      const now = this.now()
      return {
        sourceSurface: surface,
        status: 'healthy' as const,
        signal: null,
        updatedAt: now,
        lastHealthyAt: now,
      }
    })

    return {
      generatedAt: this.now(),
      overallStatus: surfaces.some((surface) => surface.status === 'degraded') ? 'degraded' : 'healthy',
      surfaces,
    }
  }
}
