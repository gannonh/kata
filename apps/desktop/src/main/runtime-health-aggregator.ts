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
  A11yViolationCounts,
  AuthProvider,
  AvailableModel,
  BridgeLifecycleState,
  BridgeStatusEvent,
  FirstRunReadinessSnapshot,
  McpConfigReadResponse,
  McpServerStatusResponse,
  ProviderStatusMap,
  ReliabilityClass,
  ReliabilityRecoveryAction,
  ReliabilityRecoveryRequest,
  ReliabilityRecoveryResult,
  ReliabilitySeverity,
  ReliabilitySignal,
  ReliabilitySnapshot,
  ReliabilitySourceSurface,
  ReliabilitySurfaceState,
  StabilityMetricInput,
  StabilityMetricName,
  StabilityMetricSnapshot,
  StabilitySnapshot,
  StabilityThresholdSet,
  SymphonyOperatorSnapshot,
  SymphonyRuntimeStatus,
  ThresholdBreach,
  WorkflowBoardSnapshot,
} from '../shared/types'
import { ALL_AUTH_PROVIDERS } from '../shared/types'
import { buildFirstRunReadinessSnapshot } from '../shared/first-run-readiness'

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
  stabilityThresholds?: StabilityThresholdSet
}

interface RuntimeHealthAggregatorEvents {
  snapshot: (snapshot: ReliabilitySnapshot) => void
  stability: (snapshot: StabilitySnapshot) => void
}

interface StabilityMetricRule {
  sourceSurface: ReliabilitySourceSurface
  reliabilityClass: ReliabilityClass
  recoveryAction: ReliabilityRecoveryAction
  suggestedRecovery: string
  label: string
}

interface ThresholdEvaluationResult {
  breaches: ThresholdBreach[]
  status: StabilitySnapshot['status']
}

interface AggregateMetricAttribution {
  sourceSurfaceByMetric: Record<StabilityMetricName, ReliabilitySourceSurface>
  a11ySeriousSurface: ReliabilitySourceSurface
  a11yCriticalSurface: ReliabilitySourceSurface
}

const DEFAULT_A11Y_VIOLATION_COUNTS: A11yViolationCounts = {
  minor: 0,
  moderate: 0,
  serious: 0,
  critical: 0,
}

export const DEFAULT_STABILITY_THRESHOLDS: StabilityThresholdSet = {
  version: 'm006-r020-v1',
  eventLoopLagMs: {
    warning: 75,
    breach: 150,
    comparator: 'max',
  },
  heapGrowthMb: {
    warning: 180,
    breach: 300,
    comparator: 'max',
  },
  staleAgeMs: {
    warning: 60_000,
    breach: 180_000,
    comparator: 'max',
  },
  reconnectSuccessRate: {
    warning: 0.95,
    breach: 0.8,
    comparator: 'min',
  },
  recoveryLatencyMs: {
    warning: 12_000,
    breach: 30_000,
    comparator: 'max',
  },
  a11yViolationCounts: {
    serious: {
      warning: 1,
      breach: 2,
      comparator: 'max',
    },
    critical: {
      warning: 1,
      breach: 1,
      comparator: 'max',
    },
  },
}

const STABILITY_METRIC_RULES: Record<StabilityMetricName, StabilityMetricRule> = {
  eventLoopLagMs: {
    sourceSurface: 'chat_runtime',
    reliabilityClass: 'process',
    recoveryAction: 'restart_process',
    suggestedRecovery:
      'Restart the chat runtime and reduce concurrent tool load before retrying the flow.',
    label: 'Event loop lag',
  },
  heapGrowthMb: {
    sourceSurface: 'chat_runtime',
    reliabilityClass: 'process',
    recoveryAction: 'restart_process',
    suggestedRecovery:
      'Restart the runtime to reclaim heap and inspect recent heavy operations for leaks.',
    label: 'Heap growth',
  },
  staleAgeMs: {
    sourceSurface: 'workflow_board',
    reliabilityClass: 'stale',
    recoveryAction: 'refresh_state',
    suggestedRecovery:
      'Refresh the workflow board and verify tracker connectivity before continuing mutations.',
    label: 'Stale age',
  },
  reconnectSuccessRate: {
    sourceSurface: 'symphony',
    reliabilityClass: 'network',
    recoveryAction: 'reconnect',
    suggestedRecovery: 'Trigger a Symphony reconnect and verify service reachability.',
    label: 'Reconnect success rate',
  },
  recoveryLatencyMs: {
    sourceSurface: 'symphony',
    reliabilityClass: 'process',
    recoveryAction: 'restart_process',
    suggestedRecovery:
      'Restart Symphony runtime and confirm recovery checkpoints complete within budget.',
    label: 'Recovery latency',
  },
  a11yViolationCounts: {
    sourceSurface: 'mcp',
    reliabilityClass: 'config',
    recoveryAction: 'fix_config',
    suggestedRecovery:
      'Fix accessibility issues on affected surfaces and rerun the accessibility baseline.',
    label: 'Accessibility violations',
  },
}

const EMPTY_STABILITY_METRICS: StabilityMetricSnapshot = {
  eventLoopLagMs: 0,
  heapGrowthMb: 0,
  staleAgeMs: 0,
  reconnectSuccessRate: 1,
  recoveryLatencyMs: 0,
  a11yViolationCounts: { ...DEFAULT_A11Y_VIOLATION_COUNTS },
  collectedAt: new Date(0).toISOString(),
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(value * 100) / 100
}

function normalizeMetricInput(input: StabilityMetricInput): StabilityMetricInput {
  const normalized: StabilityMetricInput = {}

  if (typeof input.eventLoopLagMs === 'number') {
    normalized.eventLoopLagMs = Math.max(0, roundMetric(input.eventLoopLagMs))
  }

  if (typeof input.heapGrowthMb === 'number') {
    normalized.heapGrowthMb = Math.max(0, roundMetric(input.heapGrowthMb))
  }

  if (typeof input.staleAgeMs === 'number') {
    normalized.staleAgeMs = Math.max(0, roundMetric(input.staleAgeMs))
  }

  if (typeof input.reconnectSuccessRate === 'number') {
    normalized.reconnectSuccessRate = Math.min(1, Math.max(0, roundMetric(input.reconnectSuccessRate)))
  }

  if (typeof input.recoveryLatencyMs === 'number') {
    normalized.recoveryLatencyMs = Math.max(0, roundMetric(input.recoveryLatencyMs))
  }

  if (input.a11yViolationCounts) {
    normalized.a11yViolationCounts = {
      minor: Math.max(0, Math.round(input.a11yViolationCounts.minor ?? 0)),
      moderate: Math.max(0, Math.round(input.a11yViolationCounts.moderate ?? 0)),
      serious: Math.max(0, Math.round(input.a11yViolationCounts.serious ?? 0)),
      critical: Math.max(0, Math.round(input.a11yViolationCounts.critical ?? 0)),
    }
  }

  if (input.collectedAt) {
    normalized.collectedAt = input.collectedAt
  }

  return normalized
}

function mergeA11yCounts(
  previous: A11yViolationCounts,
  next: Partial<A11yViolationCounts> | undefined,
): A11yViolationCounts {
  if (!next) {
    return previous
  }

  return {
    minor: next.minor ?? previous.minor,
    moderate: next.moderate ?? previous.moderate,
    serious: next.serious ?? previous.serious,
    critical: next.critical ?? previous.critical,
  }
}

function buildThresholdCode(metric: string, level: 'warn' | 'breach'): string {
  const normalizedMetric = metric
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return `REL-LONGRUN-${normalizedMetric}-${level.toUpperCase()}`
}

function formatMetricValue(metric: StabilityMetricName, value: number): string {
  if (metric === 'reconnectSuccessRate') {
    return `${Math.round(value * 100)}%`
  }

  if (metric === 'eventLoopLagMs' || metric === 'staleAgeMs' || metric === 'recoveryLatencyMs') {
    return `${roundMetric(value)}ms`
  }

  if (metric === 'heapGrowthMb') {
    return `${roundMetric(value)}MB`
  }

  return String(value)
}

function evaluateThreshold(
  metric: StabilityMetricName,
  observedValue: number,
  warningThreshold: number,
  breachThreshold: number,
  comparator: 'max' | 'min',
  sourceSurface: ReliabilitySourceSurface,
  nowIso: string,
  lastKnownGoodAt: string | undefined,
  labelOverride?: string,
): ThresholdBreach | null {
  const rule = STABILITY_METRIC_RULES[metric]
  const compareWarning = comparator === 'max' ? observedValue >= warningThreshold : observedValue <= warningThreshold
  if (!compareWarning) {
    return null
  }

  const breached = comparator === 'max' ? observedValue >= breachThreshold : observedValue <= breachThreshold
  const severity: ReliabilitySeverity = breached ? 'critical' : 'warning'
  const metricLabel = labelOverride ?? rule.label

  const code = buildThresholdCode(
    labelOverride ? `${metric}_${labelOverride}` : metric,
    breached ? 'breach' : 'warn',
  )

  const thresholdValue = breached ? breachThreshold : warningThreshold
  const relationLabel = comparator === 'max' ? 'exceeded' : 'dropped below'

  return {
    code,
    metric,
    sourceSurface,
    failureClass: rule.reliabilityClass,
    severity,
    recoveryAction: rule.recoveryAction,
    comparator,
    observedValue: roundMetric(observedValue),
    warningThreshold,
    breachThreshold,
    breached,
    message: `${metricLabel} ${relationLabel} threshold (${formatMetricValue(metric, observedValue)} vs ${formatMetricValue(metric, thresholdValue)}).`,
    suggestedRecovery: rule.suggestedRecovery,
    timestamp: nowIso,
    ...(lastKnownGoodAt ? { lastKnownGoodAt } : {}),
  }
}

function evaluateStabilityThresholds(input: {
  metrics: StabilityMetricSnapshot
  thresholds: StabilityThresholdSet
  attribution: AggregateMetricAttribution
  nowIso: string
  lastKnownGoodAt?: string
}): ThresholdEvaluationResult {
  const { metrics, thresholds, attribution, nowIso, lastKnownGoodAt } = input
  const breaches: ThresholdBreach[] = []

  const eventLoopBreach = evaluateThreshold(
    'eventLoopLagMs',
    metrics.eventLoopLagMs,
    thresholds.eventLoopLagMs.warning,
    thresholds.eventLoopLagMs.breach,
    thresholds.eventLoopLagMs.comparator,
    attribution.sourceSurfaceByMetric.eventLoopLagMs,
    nowIso,
    lastKnownGoodAt,
  )
  if (eventLoopBreach) breaches.push(eventLoopBreach)

  const heapGrowthBreach = evaluateThreshold(
    'heapGrowthMb',
    metrics.heapGrowthMb,
    thresholds.heapGrowthMb.warning,
    thresholds.heapGrowthMb.breach,
    thresholds.heapGrowthMb.comparator,
    attribution.sourceSurfaceByMetric.heapGrowthMb,
    nowIso,
    lastKnownGoodAt,
  )
  if (heapGrowthBreach) breaches.push(heapGrowthBreach)

  const staleAgeBreach = evaluateThreshold(
    'staleAgeMs',
    metrics.staleAgeMs,
    thresholds.staleAgeMs.warning,
    thresholds.staleAgeMs.breach,
    thresholds.staleAgeMs.comparator,
    attribution.sourceSurfaceByMetric.staleAgeMs,
    nowIso,
    lastKnownGoodAt,
  )
  if (staleAgeBreach) breaches.push(staleAgeBreach)

  const reconnectBreach = evaluateThreshold(
    'reconnectSuccessRate',
    metrics.reconnectSuccessRate,
    thresholds.reconnectSuccessRate.warning,
    thresholds.reconnectSuccessRate.breach,
    thresholds.reconnectSuccessRate.comparator,
    attribution.sourceSurfaceByMetric.reconnectSuccessRate,
    nowIso,
    lastKnownGoodAt,
  )
  if (reconnectBreach) breaches.push(reconnectBreach)

  const recoveryLatencyBreach = evaluateThreshold(
    'recoveryLatencyMs',
    metrics.recoveryLatencyMs,
    thresholds.recoveryLatencyMs.warning,
    thresholds.recoveryLatencyMs.breach,
    thresholds.recoveryLatencyMs.comparator,
    attribution.sourceSurfaceByMetric.recoveryLatencyMs,
    nowIso,
    lastKnownGoodAt,
  )
  if (recoveryLatencyBreach) breaches.push(recoveryLatencyBreach)

  const seriousA11yBreach = evaluateThreshold(
    'a11yViolationCounts',
    metrics.a11yViolationCounts.serious,
    thresholds.a11yViolationCounts.serious.warning,
    thresholds.a11yViolationCounts.serious.breach,
    thresholds.a11yViolationCounts.serious.comparator,
    attribution.a11ySeriousSurface,
    nowIso,
    lastKnownGoodAt,
    'serious',
  )
  if (seriousA11yBreach) breaches.push(seriousA11yBreach)

  const criticalA11yBreach = evaluateThreshold(
    'a11yViolationCounts',
    metrics.a11yViolationCounts.critical,
    thresholds.a11yViolationCounts.critical.warning,
    thresholds.a11yViolationCounts.critical.breach,
    thresholds.a11yViolationCounts.critical.comparator,
    attribution.a11yCriticalSurface,
    nowIso,
    lastKnownGoodAt,
    'critical',
  )
  if (criticalA11yBreach) breaches.push(criticalA11yBreach)

  const status: StabilitySnapshot['status'] =
    breaches.length === 0 ? 'healthy' : breaches.some((breach) => breach.breached) ? 'breached' : 'degraded'

  return {
    breaches,
    status,
  }
}

function hasThresholdStateContradiction(
  status: StabilitySnapshot['status'],
  breaches: ThresholdBreach[],
): boolean {
  if (status === 'healthy') {
    return breaches.length > 0
  }

  if (status === 'degraded') {
    return breaches.some((breach) => breach.breached)
  }

  if (status === 'breached') {
    return breaches.length === 0 || breaches.every((breach) => !breach.breached)
  }

  return true
}

function createMissingProviderStatusMap(): ProviderStatusMap {
  const entries = ALL_AUTH_PROVIDERS.map((provider) => {
    return [
      provider,
      {
        provider,
        status: 'missing' as const,
      },
    ] as const
  })

  return Object.fromEntries(entries) as ProviderStatusMap
}

export class RuntimeHealthAggregator extends EventEmitter {
  private readonly now: () => string
  private readonly requestRecovery?: RuntimeHealthAggregatorOptions['requestRecovery']

  private readonly surfaces = new Map<ReliabilitySourceSurface, ReliabilitySurfaceState>()
  private readonly stabilityBySurface = new Map<ReliabilitySourceSurface, StabilityMetricInput>()

  private chatBridgeSignal: ReliabilitySignal | null = null
  private chatCrashSignal: ReliabilitySignal | null = null
  private symphonyRuntimeSignal: ReliabilitySignal | null = null
  private symphonyOperatorSignal: ReliabilitySignal | null = null
  private mcpConfigSignal: ReliabilitySignal | null = null
  private mcpStatusSignal: ReliabilitySignal | null = null

  private readonly stabilityThresholds: StabilityThresholdSet
  private stabilityMetrics: StabilityMetricSnapshot
  private stabilityBreaches: ThresholdBreach[] = []
  private stabilityStatus: StabilitySnapshot['status'] = 'healthy'
  private stabilityLastKnownGoodAt: string | undefined

  private firstRunProviders: ProviderStatusMap = createMissingProviderStatusMap()
  private firstRunSelectedProvider: AuthProvider | null = null
  private firstRunSelectedModel: string | null = null
  private firstRunAvailableModels: AvailableModel[] = []
  private firstRunBridgeStatus: BridgeLifecycleState = 'shutdown'
  private firstTurnCompleted = false
  private firstRunReadiness: FirstRunReadinessSnapshot | null = null

  constructor(options: RuntimeHealthAggregatorOptions = {}) {
    super()
    this.now = options.now ?? (() => new Date().toISOString())
    this.requestRecovery = options.requestRecovery
    this.stabilityThresholds = options.stabilityThresholds ?? DEFAULT_STABILITY_THRESHOLDS

    const startedAt = this.now()
    this.stabilityMetrics = {
      ...EMPTY_STABILITY_METRICS,
      a11yViolationCounts: { ...EMPTY_STABILITY_METRICS.a11yViolationCounts },
      collectedAt: startedAt,
    }
    this.stabilityLastKnownGoodAt = startedAt

    for (const sourceSurface of RELIABILITY_SURFACES) {
      this.surfaces.set(sourceSurface, {
        sourceSurface,
        status: 'healthy',
        signal: null,
        updatedAt: startedAt,
        lastHealthyAt: startedAt,
      })
      this.stabilityBySurface.set(sourceSurface, {})
    }

    this.recomputeFirstRunReadiness(startedAt)
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

  public getStabilitySnapshot(): StabilitySnapshot {
    return this.toStabilitySnapshot()
  }

  public ingestStabilityMetrics(
    sourceSurface: ReliabilitySourceSurface,
    metrics: StabilityMetricInput | null | undefined,
    options: { publish?: boolean } = {},
  ): StabilitySnapshot {
    if (!metrics) {
      return this.toStabilitySnapshot()
    }

    const current = this.stabilityBySurface.get(sourceSurface) ?? {}
    const normalized = normalizeMetricInput(metrics)
    const currentA11yCounts: A11yViolationCounts = {
      ...DEFAULT_A11Y_VIOLATION_COUNTS,
      ...(current.a11yViolationCounts ?? {}),
    }

    const merged: StabilityMetricInput = {
      ...current,
      ...normalized,
      a11yViolationCounts: mergeA11yCounts(currentA11yCounts, normalized.a11yViolationCounts),
      collectedAt: normalized.collectedAt ?? this.now(),
    }

    this.stabilityBySurface.set(sourceSurface, merged)
    this.recomputeStabilityState()
    if (options.publish !== false) {
      this.publishSnapshot()
    }
    return this.toStabilitySnapshot()
  }

  public getFirstRunReadinessSnapshot(): FirstRunReadinessSnapshot {
    if (!this.firstRunReadiness) {
      this.recomputeFirstRunReadiness(this.now())
    }

    return this.firstRunReadiness as FirstRunReadinessSnapshot
  }

  public ingestFirstRunAuthState(input: {
    providers: ProviderStatusMap
    selectedProvider?: AuthProvider | null
  }): ReliabilitySnapshot {
    this.firstRunProviders = input.providers
    this.firstRunSelectedProvider = input.selectedProvider ?? this.firstRunSelectedProvider
    this.recomputeFirstRunReadiness()
    this.emit('snapshot', this.toSnapshot())
    return this.toSnapshot()
  }

  public ingestFirstRunModelState(input: {
    selectedModel?: string | null
    availableModels?: AvailableModel[]
    selectedProvider?: AuthProvider | null
  }): ReliabilitySnapshot {
    this.firstRunSelectedModel = input.selectedModel?.trim() || null
    this.firstRunAvailableModels = input.availableModels ?? this.firstRunAvailableModels
    this.firstRunSelectedProvider = input.selectedProvider ?? this.firstRunSelectedProvider
    this.recomputeFirstRunReadiness()
    this.emit('snapshot', this.toSnapshot())
    return this.toSnapshot()
  }

  public ingestFirstRunBridgeStatus(status: BridgeStatusEvent | null | undefined): ReliabilitySnapshot {
    if (status) {
      this.firstRunBridgeStatus = status.state
    }

    this.recomputeFirstRunReadiness()
    this.emit('snapshot', this.toSnapshot())
    return this.toSnapshot()
  }

  public ingestFirstTurnCompletion(completed = true): ReliabilitySnapshot {
    this.firstTurnCompleted = completed
    this.recomputeFirstRunReadiness()
    this.emit('snapshot', this.toSnapshot())
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

    if (status) {
      this.firstRunBridgeStatus = status.state
      this.recomputeFirstRunReadiness()
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
    this.firstRunBridgeStatus = 'crashed'
    this.recomputeFirstRunReadiness(input.timestamp)
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
      this.publishSnapshot()
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

    this.publishSnapshot()
  }

  private recomputeStabilityState(): void {
    const aggregate = this.computeAggregateMetrics()
    this.stabilityMetrics = {
      ...aggregate.metrics,
      a11yViolationCounts: { ...aggregate.metrics.a11yViolationCounts },
    }

    const nowIso = this.now()
    const evaluation = evaluateStabilityThresholds({
      metrics: this.stabilityMetrics,
      thresholds: this.stabilityThresholds,
      attribution: aggregate.attribution,
      nowIso,
      lastKnownGoodAt: this.stabilityLastKnownGoodAt,
    })

    if (hasThresholdStateContradiction(evaluation.status, evaluation.breaches)) {
      log.error('[runtime-health-aggregator] contradictory stability state detected', {
        status: evaluation.status,
        breachCount: evaluation.breaches.length,
      })
      this.stabilityStatus = 'breached'
      this.stabilityBreaches = [
        {
          code: 'REL-LONGRUN-CONTRADICTORY_STATE-BREACH',
          metric: 'eventLoopLagMs',
          sourceSurface: 'chat_runtime',
          failureClass: 'unknown',
          severity: 'critical',
          recoveryAction: 'inspect',
          comparator: 'max',
          observedValue: this.stabilityMetrics.eventLoopLagMs,
          warningThreshold: this.stabilityThresholds.eventLoopLagMs.warning,
          breachThreshold: this.stabilityThresholds.eventLoopLagMs.breach,
          breached: true,
          message: 'Stability evaluator produced contradictory state output.',
          suggestedRecovery: 'Inspect threshold evaluator inputs and rerun soak diagnostics.',
          timestamp: nowIso,
          ...(this.stabilityLastKnownGoodAt ? { lastKnownGoodAt: this.stabilityLastKnownGoodAt } : {}),
        },
      ]
      return
    }

    this.stabilityStatus = evaluation.status
    this.stabilityBreaches = evaluation.breaches

    if (evaluation.status === 'healthy') {
      this.stabilityLastKnownGoodAt = nowIso
    }
  }

  private computeAggregateMetrics(): {
    metrics: StabilityMetricSnapshot
    attribution: AggregateMetricAttribution
  } {
    const nowIso = this.now()

    let eventLoopLagMs = 0
    let eventLoopLagSurface: ReliabilitySourceSurface = STABILITY_METRIC_RULES.eventLoopLagMs.sourceSurface

    let heapGrowthMb = 0
    let heapGrowthSurface: ReliabilitySourceSurface = STABILITY_METRIC_RULES.heapGrowthMb.sourceSurface

    let staleAgeMs = 0
    let staleAgeSurface: ReliabilitySourceSurface = STABILITY_METRIC_RULES.staleAgeMs.sourceSurface

    let reconnectSuccessRate = 1
    let reconnectSurface: ReliabilitySourceSurface = STABILITY_METRIC_RULES.reconnectSuccessRate.sourceSurface
    let reconnectObserved = false

    let recoveryLatencyMs = 0
    let recoverySurface: ReliabilitySourceSurface = STABILITY_METRIC_RULES.recoveryLatencyMs.sourceSurface

    const a11yTotals: A11yViolationCounts = { ...DEFAULT_A11Y_VIOLATION_COUNTS }
    let a11ySeriousSurface: ReliabilitySourceSurface = STABILITY_METRIC_RULES.a11yViolationCounts.sourceSurface
    let a11yCriticalSurface: ReliabilitySourceSurface = STABILITY_METRIC_RULES.a11yViolationCounts.sourceSurface

    for (const sourceSurface of RELIABILITY_SURFACES) {
      const metrics = this.stabilityBySurface.get(sourceSurface)
      if (!metrics) {
        continue
      }

      if (typeof metrics.eventLoopLagMs === 'number' && metrics.eventLoopLagMs >= eventLoopLagMs) {
        eventLoopLagMs = metrics.eventLoopLagMs
        eventLoopLagSurface = sourceSurface
      }

      if (typeof metrics.heapGrowthMb === 'number' && metrics.heapGrowthMb >= heapGrowthMb) {
        heapGrowthMb = metrics.heapGrowthMb
        heapGrowthSurface = sourceSurface
      }

      if (typeof metrics.staleAgeMs === 'number' && metrics.staleAgeMs >= staleAgeMs) {
        staleAgeMs = metrics.staleAgeMs
        staleAgeSurface = sourceSurface
      }

      if (typeof metrics.reconnectSuccessRate === 'number') {
        if (!reconnectObserved || metrics.reconnectSuccessRate <= reconnectSuccessRate) {
          reconnectSuccessRate = metrics.reconnectSuccessRate
          reconnectSurface = sourceSurface
        }
        reconnectObserved = true
      }

      if (typeof metrics.recoveryLatencyMs === 'number' && metrics.recoveryLatencyMs >= recoveryLatencyMs) {
        recoveryLatencyMs = metrics.recoveryLatencyMs
        recoverySurface = sourceSurface
      }

      if (metrics.a11yViolationCounts) {
        const counts = metrics.a11yViolationCounts
        a11yTotals.minor += counts.minor ?? 0
        a11yTotals.moderate += counts.moderate ?? 0
        a11yTotals.serious += counts.serious ?? 0
        a11yTotals.critical += counts.critical ?? 0

        if ((counts.serious ?? 0) > 0) {
          a11ySeriousSurface = sourceSurface
        }

        if ((counts.critical ?? 0) > 0) {
          a11yCriticalSurface = sourceSurface
        }
      }
    }

    return {
      metrics: {
        eventLoopLagMs: roundMetric(eventLoopLagMs),
        heapGrowthMb: roundMetric(heapGrowthMb),
        staleAgeMs: roundMetric(staleAgeMs),
        reconnectSuccessRate: reconnectObserved ? roundMetric(reconnectSuccessRate) : 1,
        recoveryLatencyMs: roundMetric(recoveryLatencyMs),
        a11yViolationCounts: a11yTotals,
        collectedAt: nowIso,
      },
      attribution: {
        sourceSurfaceByMetric: {
          eventLoopLagMs: eventLoopLagSurface,
          heapGrowthMb: heapGrowthSurface,
          staleAgeMs: staleAgeSurface,
          reconnectSuccessRate: reconnectSurface,
          recoveryLatencyMs: recoverySurface,
          a11yViolationCounts: a11yCriticalSurface,
        },
        a11ySeriousSurface,
        a11yCriticalSurface,
      },
    }
  }

  private publishSnapshot(): void {
    const reliabilitySnapshot = this.toSnapshot()
    const stabilitySnapshot = this.toStabilitySnapshot()

    this.emit('snapshot', reliabilitySnapshot)
    this.emit('stability', stabilitySnapshot)
  }

  private recomputeFirstRunReadiness(nowOverride?: string): void {
    const now = nowOverride ?? this.now()

    this.firstRunReadiness = buildFirstRunReadinessSnapshot({
      providers: this.firstRunProviders,
      selectedProvider: this.firstRunSelectedProvider,
      selectedModel: this.firstRunSelectedModel,
      availableModels: this.firstRunAvailableModels,
      bridgeStatus: this.firstRunBridgeStatus,
      completedFirstTurn: this.firstTurnCompleted,
      now,
    })
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
      ...(this.firstRunReadiness ? { firstRunReadiness: this.firstRunReadiness } : {}),
    }
  }

  private toStabilitySnapshot(): StabilitySnapshot {
    return {
      version: this.stabilityThresholds.version,
      status: this.stabilityStatus,
      metrics: {
        ...this.stabilityMetrics,
        a11yViolationCounts: { ...this.stabilityMetrics.a11yViolationCounts },
      },
      thresholds: {
        ...this.stabilityThresholds,
        a11yViolationCounts: {
          serious: { ...this.stabilityThresholds.a11yViolationCounts.serious },
          critical: { ...this.stabilityThresholds.a11yViolationCounts.critical },
        },
      },
      breaches: this.stabilityBreaches.map((breach) => ({ ...breach })),
      generatedAt: this.now(),
      ...(this.stabilityLastKnownGoodAt ? { lastKnownGoodAt: this.stabilityLastKnownGoodAt } : {}),
    }
  }
}
