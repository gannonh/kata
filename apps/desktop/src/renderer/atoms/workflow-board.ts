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

    const contextResponse = await window.api.workflow.getContext()
    set(setWorkflowContextAtom, contextResponse.context)
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
  const activationVersionRef = useRef(0)
  const scopeKey = `${workspacePath || 'workspace:none'}::${sessionId || 'session:none'}`

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        await window.api.workflow.setScope(scopeKey)
        const response = await window.api.workflow.getContext()
        if (!cancelled) {
          setWorkflowContext(response.context)
        }
      } catch {
        // best-effort scope/context sync
      }
    })()

    return () => {
      cancelled = true
    }
  }, [scopeKey, setWorkflowContext])

  useEffect(() => {

    const deactivateInterval = () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current)
        intervalIdRef.current = null
      }
    }

    const deactivatePolling = async () => {
      activeRef.current = false
      activationVersionRef.current += 1
      setActive(false)
      deactivateInterval()
      await window.api.workflow.setBoardActive(false)
    }

    const activatePolling = async () => {
      const activationVersion = ++activationVersionRef.current
      const isCurrentActivation = () =>
        activeRef.current && activationVersionRef.current === activationVersion

      setActive(true)
      activeRef.current = true

      await window.api.workflow.setBoardActive(true)
      if (!isCurrentActivation()) {
        return
      }

      setLoading(true)
      try {
        const initial = await window.api.workflow.getBoard()
        if (!isCurrentActivation()) {
          return
        }

        setBoard(initial.snapshot)
        setError(initial.snapshot.lastError?.message ?? null)
      } catch (error) {
        if (!isCurrentActivation()) {
          return
        }

        setError(error instanceof Error ? error.message : String(error))
      } finally {
        if (isCurrentActivation()) {
          setLoading(false)
        }
      }

      if (!isCurrentActivation()) {
        return
      }

      deactivateInterval()

      intervalIdRef.current = window.setInterval(() => {
        void (async () => {
          if (!isCurrentActivation()) {
            return
          }

          setRefreshing(true)
          try {
            const refreshed = await window.api.workflow.refreshBoard()
            if (!isCurrentActivation()) {
              return
            }

            setBoard(refreshed.snapshot)
            setError(refreshed.snapshot.lastError?.message ?? null)
          } catch (error) {
            if (!isCurrentActivation()) {
              return
            }

            setError(error instanceof Error ? error.message : String(error))
          } finally {
            if (isCurrentActivation()) {
              setRefreshing(false)
            }
          }

          try {
            const contextResponse = await window.api.workflow.getContext()
            if (isCurrentActivation()) {
              setWorkflowContext(contextResponse.context)
            }
          } catch {
            // ignore context sync failures during interval
          }
        })()
      }, REFRESH_INTERVAL_MS)
    }

    if (rightPaneMode === 'kanban') {
      void activatePolling()
    } else {
      void deactivatePolling()
    }

    return () => {
      activeRef.current = false
      activationVersionRef.current += 1
      deactivateInterval()
      void window.api.workflow.setBoardActive(false)
      setActive(false)
    }
  }, [
    rightPaneMode,
    setActive,
    setBoard,
    setError,
    setLoading,
    setRefreshing,
    setWorkflowContext,
  ])
}

export function useWorkflowBoardSnapshot(): WorkflowBoardSnapshot | null {
  return useAtomValue(workflowBoardAtom)
}
