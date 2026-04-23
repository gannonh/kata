import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type {
  AgentActivityEvent,
  AgentActivitySeverity,
  AgentActivitySnapshot,
  AgentActivitySource,
  AgentActivityUpdate,
} from '@shared/types'

export type AgentActivityMode = 'events' | 'verbose'
export type AgentActivitySourceFilter = AgentActivitySource | 'all'
export type AgentActivitySeverityFilter = AgentActivitySeverity | 'all'

const EMPTY_SNAPSHOT: AgentActivitySnapshot = {
  generatedAt: new Date(0).toISOString(),
  events: [],
  verbose: [],
  pinnedErrors: [],
}

export const agentActivitySnapshotAtom = atom<AgentActivitySnapshot>(EMPTY_SNAPSHOT)
export const agentActivityLoadingAtom = atom<boolean>(false)
export const agentActivityModeAtom = atom<AgentActivityMode>('events')
export const agentActivitySourceFilterAtom = atom<AgentActivitySourceFilter>('all')
export const agentActivitySeverityFilterAtom = atom<AgentActivitySeverityFilter>('all')
export const agentActivityAutoFollowAtom = atom<boolean>(true)
export const agentActivityUnseenCountAtom = atom<number>(0)

function applyAgentActivityUpdate(
  snapshot: AgentActivitySnapshot,
  update: AgentActivityUpdate,
): AgentActivitySnapshot {
  const nextEvents = update.appendedEvents?.length
    ? [...snapshot.events, ...update.appendedEvents]
    : snapshot.events
  const nextVerbose = update.appendedVerbose?.length
    ? [...snapshot.verbose, ...update.appendedVerbose]
    : snapshot.verbose

  const pinnedById = new Map(snapshot.pinnedErrors.map((incident) => [incident.incidentId, incident]))
  for (const incident of update.upsertedPinnedErrors ?? []) {
    pinnedById.set(incident.incidentId, incident)
  }
  for (const incidentId of update.removedPinnedErrorIds ?? []) {
    pinnedById.delete(incidentId)
  }

  return {
    generatedAt: update.generatedAt,
    events: nextEvents,
    verbose: nextVerbose,
    pinnedErrors: Array.from(pinnedById.values()),
  }
}

function countIncoming(update: AgentActivityUpdate, mode: AgentActivityMode): number {
  if (mode === 'events') {
    return update.appendedEvents?.length ?? 0
  }

  return update.appendedVerbose?.length ?? 0
}

export const applyAgentActivityUpdateAtom = atom(
  null,
  (get, set, update: AgentActivityUpdate) => {
    const currentSnapshot = get(agentActivitySnapshotAtom)
    const nextSnapshot = applyAgentActivityUpdate(currentSnapshot, update)
    set(agentActivitySnapshotAtom, nextSnapshot)

    if (get(agentActivityAutoFollowAtom)) {
      return
    }

    const mode = get(agentActivityModeAtom)
    const incoming = countIncoming(update, mode)
    if (incoming > 0) {
      set(agentActivityUnseenCountAtom, (count) => count + incoming)
    }
  },
)

export const setAgentActivityModeAtom = atom(null, (_get, set, mode: AgentActivityMode) => {
  set(agentActivityModeAtom, mode)
  set(agentActivityUnseenCountAtom, 0)
})

export const setAgentActivityAutoFollowAtom = atom(null, (_get, set, autoFollow: boolean) => {
  set(agentActivityAutoFollowAtom, autoFollow)
  if (autoFollow) {
    set(agentActivityUnseenCountAtom, 0)
  }
})

export const jumpToLatestAgentActivityAtom = atom(null, (_get, set) => {
  set(agentActivityAutoFollowAtom, true)
  set(agentActivityUnseenCountAtom, 0)
})

export const dismissPinnedErrorAtom = atom(null, async (_get, set, incidentId: string) => {
  const response = await window.api.agentActivity.dismissPinnedError(incidentId)
  set(agentActivitySnapshotAtom, response.snapshot)
  return response
})

export const filteredAgentActivityEventsAtom = atom((get): AgentActivityEvent[] => {
  const snapshot = get(agentActivitySnapshotAtom)
  const mode = get(agentActivityModeAtom)
  const sourceFilter = get(agentActivitySourceFilterAtom)
  const severityFilter = get(agentActivitySeverityFilterAtom)

  const stream = mode === 'events' ? snapshot.events : snapshot.verbose

  return stream.filter((event) => {
    const sourceMatches = sourceFilter === 'all' || event.source === sourceFilter
    const severityMatches = severityFilter === 'all' || event.severity === severityFilter
    return sourceMatches && severityMatches
  })
})

export function useAgentActivityBridge(): void {
  const setSnapshot = useSetAtom(agentActivitySnapshotAtom)
  const setLoading = useSetAtom(agentActivityLoadingAtom)
  const applyUpdate = useSetAtom(applyAgentActivityUpdateAtom)

  useEffect(() => {
    let cancelled = false
    let receivedPush = false

    const unsubscribe = window.api.agentActivity.onUpdate((update) => {
      receivedPush = true
      applyUpdate(update)
    })

    const loadInitial = async () => {
      setLoading(true)
      try {
        const response = await window.api.agentActivity.getSnapshot()
        if (!cancelled && !receivedPush) {
          setSnapshot(response.snapshot)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitial()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [applyUpdate, setLoading, setSnapshot])
}

export function useAgentActivitySnapshot(): AgentActivitySnapshot {
  return useAtomValue(agentActivitySnapshotAtom)
}
