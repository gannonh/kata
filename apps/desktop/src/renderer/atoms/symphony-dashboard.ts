import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type {
  SymphonyEscalationResponseCommandResult,
  SymphonyOperatorSnapshot,
} from '@shared/types'

const EMPTY_SNAPSHOT: SymphonyOperatorSnapshot = {
  fetchedAt: new Date(0).toISOString(),
  queueCount: 0,
  completedCount: 0,
  workers: [],
  escalations: [],
  connection: {
    state: 'disconnected',
    updatedAt: new Date(0).toISOString(),
  },
  freshness: {
    status: 'stale',
    staleReason: 'Dashboard snapshot has not loaded yet.',
  },
  response: {},
}

export const symphonyDashboardSnapshotAtom = atom<SymphonyOperatorSnapshot>(EMPTY_SNAPSHOT)
export const symphonyDashboardLoadingAtom = atom<boolean>(false)
export const symphonyEscalationDraftsAtom = atom<Record<string, string>>({})

export const setSymphonyEscalationDraftAtom = atom(
  null,
  (get, set, update: { requestId: string; value: string }) => {
    const current = get(symphonyEscalationDraftsAtom)
    set(symphonyEscalationDraftsAtom, {
      ...current,
      [update.requestId]: update.value,
    })
  },
)

export const refreshSymphonyDashboardAtom = atom(null, async (_get, set) => {
  set(symphonyDashboardLoadingAtom, true)

  try {
    const response = await window.api.symphony.refreshDashboardSnapshot()
    set(symphonyDashboardSnapshotAtom, response.snapshot)
  } finally {
    set(symphonyDashboardLoadingAtom, false)
  }
})

export const respondToEscalationAtom = atom(
  null,
  async (
    get,
    set,
    input: { requestId: string },
  ): Promise<SymphonyEscalationResponseCommandResult> => {
    const drafts = get(symphonyEscalationDraftsAtom)
    const responseText = drafts[input.requestId]?.trim() ?? ''

    try {
      const result = await window.api.symphony.respondToEscalation(input.requestId, responseText)
      set(symphonyDashboardSnapshotAtom, result.snapshot)

      if (result.success) {
        set(symphonyEscalationDraftsAtom, (currentDrafts) => {
          const { [input.requestId]: _discarded, ...remaining } = currentDrafts
          return remaining
        })
      }

      return result
    } catch (error) {
      const currentSnapshot = get(symphonyDashboardSnapshotAtom)
      const failureResult = {
        requestId: input.requestId,
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : String(error),
        submittedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }

      const snapshot = {
        ...currentSnapshot,
        response: {
          ...currentSnapshot.response,
          submittingRequestId: undefined,
          lastResult: failureResult,
        },
      }

      set(symphonyDashboardSnapshotAtom, snapshot)
      return { success: false, snapshot, result: failureResult }
    }
  },
)

export function useSymphonyDashboardBridge(): void {
  const setSnapshot = useSetAtom(symphonyDashboardSnapshotAtom)
  const setLoading = useSetAtom(symphonyDashboardLoadingAtom)

  useEffect(() => {
    let cancelled = false
    let receivedPush = false

    const unsubscribe = window.api.symphony.onDashboardSnapshot((snapshot) => {
      receivedPush = true
      setSnapshot(snapshot)
    })

    const loadInitialSnapshot = async () => {
      setLoading(true)
      try {
        const response = await window.api.symphony.getDashboardSnapshot()
        if (!cancelled && !receivedPush) {
          setSnapshot(response.snapshot)
        }
      } finally {
        setLoading(false)
      }
    }

    void loadInitialSnapshot()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [setLoading, setSnapshot])
}

export function useSymphonyDashboardSnapshot(): SymphonyOperatorSnapshot {
  return useAtomValue(symphonyDashboardSnapshotAtom)
}
