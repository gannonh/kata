import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import {
  AGENT_ACTIVITY_EVENT_CAP,
  AGENT_ACTIVITY_VERBOSE_CAP,
} from '@shared/types'
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
  pinnedEvents: [],
}

export const agentActivitySnapshotAtom = atom<AgentActivitySnapshot>(EMPTY_SNAPSHOT)
export const agentActivityLoadingAtom = atom<boolean>(false)
export const agentActivityModeAtom = atom<AgentActivityMode>('events')
export const agentActivitySourceFilterAtom = atom<AgentActivitySourceFilter>('all')
export const agentActivitySeverityFilterAtom = atom<AgentActivitySeverityFilter>('all')
export const agentActivityAutoFollowAtom = atom<boolean>(true)
export const agentActivityUnseenCountAtom = atom<number>(0)

function trimStream<T>(stream: T[], cap: number): T[] {
  if (stream.length <= cap) {
    return stream
  }

  return stream.slice(stream.length - cap)
}

function appendAndTrim(
  current: AgentActivityEvent[],
  appended: AgentActivityEvent[] | undefined,
  cap: number,
): AgentActivityEvent[] {
  if (!appended?.length) {
    return current
  }

  return trimStream([...current, ...appended], cap)
}

function mergeHydratedStream(
  incoming: AgentActivityEvent[],
  current: AgentActivityEvent[],
  cap: number,
): AgentActivityEvent[] {
  if (current.length === 0) {
    return trimStream(incoming, cap)
  }

  const merged = incoming.slice()
  const knownIds = new Set(merged.map((event) => event.id))
  for (const event of current) {
    if (!knownIds.has(event.id)) {
      merged.push(event)
      knownIds.add(event.id)
    }
  }

  return trimStream(merged, cap)
}

function mergeHydratedSnapshot(
  current: AgentActivitySnapshot,
  incoming: AgentActivitySnapshot,
): AgentActivitySnapshot {
  const pinnedById = new Map(incoming.pinnedEvents.map((event) => [event.eventId, event]))
  for (const event of current.pinnedEvents) {
    pinnedById.set(event.eventId, event)
  }

  return {
    generatedAt:
      current.generatedAt.localeCompare(incoming.generatedAt) > 0 ? current.generatedAt : incoming.generatedAt,
    events: mergeHydratedStream(incoming.events, current.events, AGENT_ACTIVITY_EVENT_CAP),
    verbose: mergeHydratedStream(incoming.verbose, current.verbose, AGENT_ACTIVITY_VERBOSE_CAP),
    pinnedEvents: Array.from(pinnedById.values()),
  }
}

function applyAgentActivityUpdate(
  snapshot: AgentActivitySnapshot,
  update: AgentActivityUpdate,
): AgentActivitySnapshot {
  const nextEvents = appendAndTrim(snapshot.events, update.appendedEvents, AGENT_ACTIVITY_EVENT_CAP)
  const nextVerbose = appendAndTrim(snapshot.verbose, update.appendedVerbose, AGENT_ACTIVITY_VERBOSE_CAP)

  const pinnedById = new Map(snapshot.pinnedEvents.map((event) => [event.eventId, event]))
  for (const event of update.upsertedPinnedEvents ?? []) {
    pinnedById.set(event.eventId, event)
  }
  for (const eventId of update.removedPinnedEventIds ?? []) {
    pinnedById.delete(eventId)
  }

  return {
    generatedAt: update.generatedAt,
    events: nextEvents,
    verbose: nextVerbose,
    pinnedEvents: Array.from(pinnedById.values()),
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

export const setPinnedEventAtom = atom(
  null,
  async (_get, set, payload: { eventId: string; pinned: boolean }) => {
    const response = await window.api.agentActivity.setPinnedEvent(payload.eventId, payload.pinned)
    if (response.success) {
      set(agentActivitySnapshotAtom, response.snapshot)
    }
    return response
  },
)

export const pinnedEventIdsAtom = atom((get) => {
  return new Set(get(agentActivitySnapshotAtom).pinnedEvents.map((event) => event.eventId))
})

export const isEventPinnedAtom = atom((get) => {
  const pinnedIds = get(pinnedEventIdsAtom)
  return (eventId: string) => pinnedIds.has(eventId)
})

export const togglePinnedEventAtom = atom(null, async (get, set, eventId: string) => {
  const isPinned = get(isEventPinnedAtom)(eventId)
  const response = await window.api.agentActivity.setPinnedEvent(eventId, !isPinned)
  if (response.success) {
    set(agentActivitySnapshotAtom, response.snapshot)
  }
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

    const unsubscribe = window.api.agentActivity.onUpdate((update) => {
      applyUpdate(update)
    })

    const loadInitial = async () => {
      setLoading(true)
      try {
        const response = await window.api.agentActivity.getSnapshot()
        if (!cancelled) {
          setSnapshot((current) => mergeHydratedSnapshot(current, response.snapshot))
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
