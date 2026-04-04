import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type { WorkflowBoardSnapshot } from '@shared/types'

const REFRESH_INTERVAL_MS = 30_000

export const workflowBoardAtom = atom<WorkflowBoardSnapshot | null>(null)
export const workflowBoardLoadingAtom = atom<boolean>(false)
export const workflowBoardRefreshingAtom = atom<boolean>(false)
export const workflowBoardErrorAtom = atom<string | null>(null)

export const workflowBoardHasCardsAtom = atom((get) => {
  const snapshot = get(workflowBoardAtom)
  if (!snapshot) {
    return false
  }

  return snapshot.columns.some((column) => column.cards.length > 0)
})

export const refreshWorkflowBoardAtom = atom(null, async (_get, set) => {
  set(workflowBoardRefreshingAtom, true)
  set(workflowBoardErrorAtom, null)

  try {
    const response = await window.api.workflow.refreshBoard()
    set(workflowBoardAtom, response.snapshot)
    set(workflowBoardErrorAtom, response.snapshot.lastError?.message ?? null)
  } catch (error) {
    set(workflowBoardErrorAtom, error instanceof Error ? error.message : String(error))
  } finally {
    set(workflowBoardRefreshingAtom, false)
  }
})
export function useWorkflowBoardBridge(): void {
  const setBoard = useSetAtom(workflowBoardAtom)
  const setLoading = useSetAtom(workflowBoardLoadingAtom)
  const setRefreshing = useSetAtom(workflowBoardRefreshingAtom)
  const setError = useSetAtom(workflowBoardErrorAtom)

  useEffect(() => {
    let cancelled = false

    const loadBoard = async (mode: 'initial' | 'refresh') => {
      if (cancelled) {
        return
      }

      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const response =
          mode === 'initial' ? await window.api.workflow.getBoard() : await window.api.workflow.refreshBoard()

        if (cancelled) {
          return
        }

        setBoard(response.snapshot)
        setError(response.snapshot.lastError?.message ?? null)
      } catch (error) {
        if (cancelled) {
          return
        }

        setError(error instanceof Error ? error.message : String(error))
      } finally {
        if (cancelled) {
          return
        }

        if (mode === 'initial') {
          setLoading(false)
        } else {
          setRefreshing(false)
        }
      }
    }

    void loadBoard('initial')

    const intervalId = window.setInterval(() => {
      void loadBoard('refresh')
    }, REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [setBoard, setError, setLoading, setRefreshing])
}

export function useWorkflowBoardSnapshot(): WorkflowBoardSnapshot | null {
  return useAtomValue(workflowBoardAtom)
}
