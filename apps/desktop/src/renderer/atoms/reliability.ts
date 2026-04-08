import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type {
  ReliabilityRecoveryAction,
  ReliabilityRecoveryRequest,
  ReliabilityRecoveryResult,
  ReliabilitySnapshot,
  ReliabilitySourceSurface,
  ReliabilitySurfaceState,
  StabilityHealthStatus,
  StabilityMetricName,
  StabilitySnapshot,
  ThresholdBreach,
} from '@shared/types'

const RELIABILITY_SURFACES: ReadonlyArray<ReliabilitySourceSurface> = [
  'chat_runtime',
  'workflow_board',
  'symphony',
  'mcp',
]

function buildEmptySnapshot(): ReliabilitySnapshot {
  const now = new Date(0).toISOString()
  return {
    generatedAt: now,
    overallStatus: 'healthy',
    surfaces: RELIABILITY_SURFACES.map((surface) => ({
      sourceSurface: surface,
      status: 'healthy',
      signal: null,
      updatedAt: now,
      lastHealthyAt: now,
    })),
  }
}

function buildEmptyStabilitySnapshot(): StabilitySnapshot {
  const now = new Date(0).toISOString()
  return {
    version: 'unknown',
    status: 'healthy',
    metrics: {
      eventLoopLagMs: 0,
      heapGrowthMb: 0,
      staleAgeMs: 0,
      reconnectSuccessRate: 1,
      recoveryLatencyMs: 0,
      a11yViolationCounts: {
        minor: 0,
        moderate: 0,
        serious: 0,
        critical: 0,
      },
      collectedAt: now,
    },
    thresholds: {
      version: 'unknown',
      eventLoopLagMs: { warning: 0, breach: 0, comparator: 'max' },
      heapGrowthMb: { warning: 0, breach: 0, comparator: 'max' },
      staleAgeMs: { warning: 0, breach: 0, comparator: 'max' },
      reconnectSuccessRate: { warning: 1, breach: 0, comparator: 'min' },
      recoveryLatencyMs: { warning: 0, breach: 0, comparator: 'max' },
      a11yViolationCounts: {
        serious: { warning: 0, breach: 0, comparator: 'max' },
        critical: { warning: 0, breach: 0, comparator: 'max' },
      },
    },
    breaches: [],
    generatedAt: now,
  }
}

export function formatReliabilityClassLabel(value: string): string {
  if (!value) {
    return 'Unknown'
  }

  return value
    .split('_')
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatReliabilityActionLabel(action: ReliabilityRecoveryAction): string {
  switch (action) {
    case 'fix_config':
      return 'Fix configuration'
    case 'reauthenticate':
      return 'Re-authenticate'
    case 'retry_request':
      return 'Retry request'
    case 'restart_process':
      return 'Restart process'
    case 'reconnect':
      return 'Reconnect service'
    case 'refresh_state':
      return 'Refresh state'
    case 'inspect':
    default:
      return 'Inspect diagnostics'
  }
}

export function formatReliabilitySurfaceLabel(surface: ReliabilitySourceSurface): string {
  switch (surface) {
    case 'chat_runtime':
      return 'Chat runtime'
    case 'workflow_board':
      return 'Workflow board'
    case 'symphony':
      return 'Symphony'
    case 'mcp':
      return 'MCP'
    default:
      return surface
  }
}

export function formatStabilityMetricLabel(metric: StabilityMetricName): string {
  switch (metric) {
    case 'eventLoopLagMs':
      return 'Event loop lag'
    case 'heapGrowthMb':
      return 'Heap growth'
    case 'staleAgeMs':
      return 'Stale age'
    case 'reconnectSuccessRate':
      return 'Reconnect success rate'
    case 'recoveryLatencyMs':
      return 'Recovery latency'
    case 'a11yViolationCounts':
      return 'Accessibility violations'
    default:
      return metric
  }
}

export function formatStabilityStatusLabel(status: StabilityHealthStatus): string {
  switch (status) {
    case 'breached':
      return 'Breached'
    case 'degraded':
      return 'Degraded'
    case 'healthy':
    default:
      return 'Healthy'
  }
}

export function reliabilitySeverityTone(
  severity: string | undefined,
): 'error' | 'warning' | 'info' {
  if (severity === 'critical' || severity === 'error') {
    return 'error'
  }

  if (severity === 'serious' || severity === 'warning') {
    return 'warning'
  }

  return 'info'
}

function mergeReliabilitySnapshot(
  previous: ReliabilitySnapshot,
  next: ReliabilitySnapshot,
): ReliabilitySnapshot {
  const previousBySurface = new Map(previous.surfaces.map((surface) => [surface.sourceSurface, surface]))

  const mergedSurfaces = next.surfaces.map((surface) => {
    const previousSurface = previousBySurface.get(surface.sourceSurface)
    if (!previousSurface) {
      return surface
    }

    if (!surface.signal) {
      return {
        ...surface,
        lastHealthyAt: surface.lastHealthyAt ?? previousSurface.lastHealthyAt,
      }
    }

    return {
      ...surface,
      signal: {
        ...surface.signal,
        lastKnownGoodAt:
          surface.signal.lastKnownGoodAt ??
          previousSurface.signal?.lastKnownGoodAt ??
          previousSurface.lastHealthyAt,
      },
    }
  })

  return {
    ...next,
    surfaces: mergedSurfaces,
  }
}

export const reliabilitySnapshotAtom = atom<ReliabilitySnapshot>(buildEmptySnapshot())
export const stabilitySnapshotAtom = atom<StabilitySnapshot>(buildEmptyStabilitySnapshot())
export const reliabilityLoadingAtom = atom<boolean>(false)
export const reliabilityRecoveryPendingAtom = atom<Record<ReliabilitySourceSurface, boolean>>({
  chat_runtime: false,
  workflow_board: false,
  symphony: false,
  mcp: false,
})
export const reliabilityRecoveryResultAtom = atom<
  Record<ReliabilitySourceSurface, ReliabilityRecoveryResult | null>
>({
  chat_runtime: null,
  workflow_board: null,
  symphony: null,
  mcp: null,
})

const setReliabilitySnapshotAtom = atom(
  null,
  (get, set, snapshot: ReliabilitySnapshot) => {
    const previous = get(reliabilitySnapshotAtom)
    set(reliabilitySnapshotAtom, mergeReliabilitySnapshot(previous, snapshot))
  },
)

const setStabilitySnapshotAtom = atom(null, (_get, set, snapshot: StabilitySnapshot) => {
  set(stabilitySnapshotAtom, snapshot)
})

export const refreshStabilitySnapshotAtom = atom(null, async (_get, set) => {
  const response = await window.api.reliability.getStabilitySnapshot()
  if (response.success) {
    set(setStabilitySnapshotAtom, response.snapshot)
  }
})

export const refreshReliabilityStatusAtom = atom(null, async (_get, set) => {
  set(reliabilityLoadingAtom, true)

  try {
    const [statusResponse, stabilityResponse] = await Promise.all([
      window.api.reliability.getStatus(),
      window.api.reliability.getStabilitySnapshot(),
    ])

    if (statusResponse.success) {
      set(setReliabilitySnapshotAtom, statusResponse.snapshot)
    }

    if (stabilityResponse.success) {
      set(setStabilitySnapshotAtom, stabilityResponse.snapshot)
    }
  } finally {
    set(reliabilityLoadingAtom, false)
  }
})

export const requestReliabilityRecoveryActionAtom = atom(
  null,
  async (_get, set, request: ReliabilityRecoveryRequest) => {
    set(reliabilityRecoveryPendingAtom, (previous) => ({
      ...previous,
      [request.sourceSurface]: true,
    }))

    try {
      const result = await window.api.reliability.requestRecoveryAction(request)
      set(reliabilityRecoveryResultAtom, (previous) => ({
        ...previous,
        [request.sourceSurface]: result,
      }))

      const [statusResponse, stabilityResponse] = await Promise.all([
        window.api.reliability.getStatus(),
        window.api.reliability.getStabilitySnapshot(),
      ])

      if (statusResponse.success) {
        set(setReliabilitySnapshotAtom, statusResponse.snapshot)
      }

      if (stabilityResponse.success) {
        set(setStabilitySnapshotAtom, stabilityResponse.snapshot)
      }

      return result
    } finally {
      set(reliabilityRecoveryPendingAtom, (previous) => ({
        ...previous,
        [request.sourceSurface]: false,
      }))
    }
  },
)

export function useReliabilityBridge(): void {
  const setSnapshot = useSetAtom(setReliabilitySnapshotAtom)
  const setStabilitySnapshot = useSetAtom(setStabilitySnapshotAtom)
  const refresh = useSetAtom(refreshReliabilityStatusAtom)

  useEffect(() => {
    let cancelled = false

    const unsubscribeStatus = window.api.reliability.onStatus((snapshot) => {
      if (cancelled) {
        return
      }
      setSnapshot(snapshot)
    })

    const unsubscribeStability = window.api.reliability.onStabilitySnapshot((snapshot) => {
      if (cancelled) {
        return
      }
      setStabilitySnapshot(snapshot)
    })

    void refresh()

    return () => {
      cancelled = true
      unsubscribeStatus()
      unsubscribeStability()
    }
  }, [refresh, setSnapshot, setStabilitySnapshot])
}

export function useReliabilitySnapshot(): ReliabilitySnapshot {
  return useAtomValue(reliabilitySnapshotAtom)
}

const FALLBACK_SURFACE_STATE = (surface: ReliabilitySourceSurface): ReliabilitySurfaceState => ({
  sourceSurface: surface,
  status: 'healthy',
  signal: null,
  updatedAt: new Date(0).toISOString(),
  lastHealthyAt: new Date(0).toISOString(),
})

export function useReliabilitySurfaceState(
  sourceSurface: ReliabilitySourceSurface,
): ReliabilitySurfaceState {
  const snapshot = useReliabilitySnapshot()
  return (
    snapshot.surfaces.find((surface) => surface.sourceSurface === sourceSurface) ??
    FALLBACK_SURFACE_STATE(sourceSurface)
  )
}

export function useStabilitySnapshot(): StabilitySnapshot {
  return useAtomValue(stabilitySnapshotAtom)
}

const STABILITY_SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  error: 2,
  warning: 3,
  info: 4,
}

export function useStabilityBreachesForSurface(
  sourceSurface: ReliabilitySourceSurface,
): ThresholdBreach[] {
  const snapshot = useStabilitySnapshot()
  return snapshot.breaches
    .filter((breach) => breach.sourceSurface === sourceSurface)
    .sort((left, right) => {
      if (left.breached !== right.breached) {
        return left.breached ? -1 : 1
      }

      if (left.severity !== right.severity) {
        return (STABILITY_SEVERITY_RANK[left.severity] ?? Number.MAX_SAFE_INTEGER) -
          (STABILITY_SEVERITY_RANK[right.severity] ?? Number.MAX_SAFE_INTEGER)
      }

      return right.timestamp.localeCompare(left.timestamp)
    })
}
