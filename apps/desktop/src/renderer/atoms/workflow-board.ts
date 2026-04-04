import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import type { WorkflowBoardSnapshot } from '@shared/types'
import { currentSessionIdAtom, workingDirectoryAtom } from './session'
import { rightPaneModeAtom, setWorkflowContextAtom } from './right-pane'

const REFRESH_INTERVAL_MS = 30_000

export const workflowBoardAtom = atom<WorkflowBoardSnapshot | null>(null)
export const workflowBoardLoadingAtom = atom<boolean>(false)
export const workflowBoardRefreshingAtom = atom<boolean>(false)
export const workflowBoardErrorAtom = atom<string | null>(null)
export const workflowBoardActiveAtom = atom<boolean>(false)

export const workflowBoardHasCardsAtom = atom((get) => {
  const snapshot = get(workflowBoardAtom)
  return snapshot ? snapshot.columns.some((column) => column.cards.length > 0) : false
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
  const rightPaneMode = useAtomValue(rightPaneModeAtom)
  const workspacePath = useAtomValue(workingDirectoryAtom)
  const sessionId = useAtomValue(currentSessionIdAtom)

  const setBoard = useSetAtom(workflowBoardAtom)
  const setLoading = useSetAtom(workflowBoardLoadingAtom)
  const setRefreshing = useSetAtom(workflowBoardRefreshingAtom)
  const setError = useSetAtom(workflowBoardErrorAtom)
  const setActive = useSetAtom(workflowBoardActiveAtom)
  const setWorkflowContext = useSetAtom(setWorkflowContextAtom)

  const intervalIdRef = useRef<number | null>(null)
  const activeRef = useRef(false)

  useEffect(() => {
    const syncContext = async () => {
      try {
        const response = await window.api.workflow.getContext()
        setWorkflowContext(response.context)
      } catch {
        // best-effort context sync
      }
    }

    void syncContext()
  }, [setWorkflowContext])

  useEffect(() => {
    const scopeKey = `${workspacePath || 'workspace:none'}::${sessionId || 'session:none'}`

    const activatePolling = async () => {
      setActive(true)
      activeRef.current = true
      await window.api.workflow.setScope(scopeKey)
      await window.api.workflow.setBoardActive(true)

      setLoading(true)
      try {
        const initial = await window.api.workflow.getBoard()
        setBoard(initial.snapshot)
        setError(initial.snapshot.lastError?.message ?? null)
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
      } finally {
        setLoading(false)
      }

      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current)
      }

      intervalIdRef.current = window.setInterval(() => {
        void (async () => {
          if (!activeRef.current) {
            return
          }

          setRefreshing(true)
          try {
            const refreshed = await window.api.workflow.refreshBoard()
            setBoard(refreshed.snapshot)
            setError(refreshed.snapshot.lastError?.message ?? null)
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error))
          } finally {
            setRefreshing(false)
          }

          try {
            const contextResponse = await window.api.workflow.getContext()
            setWorkflowContext(contextResponse.context)
          } catch {
            // ignore context sync failures during interval
          }
        })()
      }, REFRESH_INTERVAL_MS)
    }

    const deactivatePolling = async () => {
      activeRef.current = false
      setActive(false)
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current)
        intervalIdRef.current = null
      }

      await window.api.workflow.setBoardActive(false)
    }

    if (rightPaneMode === 'kanban') {
      void activatePolling()
    } else {
      void deactivatePolling()
    }

    return () => {
      activeRef.current = false
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current)
        intervalIdRef.current = null
      }
      void window.api.workflow.setBoardActive(false)
      setActive(false)
    }
  }, [
    rightPaneMode,
    sessionId,
    setActive,
    setBoard,
    setError,
    setLoading,
    setRefreshing,
    setWorkflowContext,
    workspacePath,
  ])
}

export function useWorkflowBoardSnapshot(): WorkflowBoardSnapshot | null {
  return useAtomValue(workflowBoardAtom)
}
