import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type {
  ReliabilityRecoveryAction,
  ReliabilityRecoveryRequest,
  ReliabilityRecoveryResult,
  ReliabilitySnapshot,
  ReliabilitySourceSurface,
  ReliabilitySurfaceState,
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

export function reliabilitySeverityTone(
  severity: string | undefined,
): 'error' | 'warning' | 'info' {
  if (severity === 'critical' || severity === 'error') {
    return 'error'
  }

  if (severity === 'warning') {
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

export const refreshReliabilityStatusAtom = atom(null, async (_get, set) => {
  set(reliabilityLoadingAtom, true)

  try {
    const response = await window.api.reliability.getStatus()
    if (response.success) {
      set(setReliabilitySnapshotAtom, response.snapshot)
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

      const response = await window.api.reliability.getStatus()
      if (response.success) {
        set(setReliabilitySnapshotAtom, response.snapshot)
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
  const refresh = useSetAtom(refreshReliabilityStatusAtom)

  useEffect(() => {
    let cancelled = false

    const unsubscribe = window.api.reliability.onStatus((snapshot) => {
      if (cancelled) {
        return
      }
      setSnapshot(snapshot)
    })

    void refresh()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [refresh, setSnapshot])
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
