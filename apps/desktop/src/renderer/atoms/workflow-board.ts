import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useEffect, useRef } from 'react'
import type { WorkflowBoardSnapshot, WorkflowBoardScope, WorkflowColumnId } from '@shared/types'
import { currentSessionIdAtom, workingDirectoryAtom } from './session'
import { rightPaneModeAtom, setWorkflowContextAtom } from './right-pane'

const REFRESH_INTERVAL_MS = 30_000

const WORKFLOW_BOARD_SCOPE_STORAGE_KEY = 'kata-desktop:workflow-board-scope-by-workspace'
const WORKFLOW_BOARD_COLLAPSE_STORAGE_KEY = 'kata-desktop:workflow-board-collapsed-columns'

type ScopePreferenceMap = Record<string, WorkflowBoardScope>
type CollapsedColumnsMap = Record<string, WorkflowColumnId[]>

export const workflowBoardAtom = atom<WorkflowBoardSnapshot | null>(null)
export const workflowBoardLoadingAtom = atom<boolean>(false)
export const workflowBoardRefreshingAtom = atom<boolean>(false)
export const workflowBoardErrorAtom = atom<string | null>(null)
export const workflowBoardActiveAtom = atom<boolean>(false)

type EscalationActionState = {
  status: 'idle' | 'submitting' | 'success' | 'error' | 'disabled'
  message?: string
  updatedAt: string
}

type IssueActionState = {
  status: 'idle' | 'opening' | 'success' | 'error' | 'disabled'
  message?: string
  updatedAt: string
}

export const workflowEscalationActionStateAtom = atom<Record<string, EscalationActionState>>({})
export const workflowIssueActionStateAtom = atom<Record<string, IssueActionState>>({})

const workflowBoardScopePreferencesAtom = atomWithStorage<ScopePreferenceMap>(
  WORKFLOW_BOARD_SCOPE_STORAGE_KEY,
  {},
)

const workflowBoardCollapsedColumnsAtom = atomWithStorage<CollapsedColumnsMap>(
  WORKFLOW_BOARD_COLLAPSE_STORAGE_KEY,
  {},
)

const workflowBoardWorkspaceKeyAtom = atom((get) => get(workingDirectoryAtom) || 'workspace:none')

export const workflowBoardScopeAtom = atom<WorkflowBoardScope, [WorkflowBoardScope], void>(
  (get) => {
    const workspaceKey = get(workflowBoardWorkspaceKeyAtom)
    return get(workflowBoardScopePreferencesAtom)[workspaceKey] ?? 'milestone'
  },
  (get, set, nextScope) => {
    const workspaceKey = get(workflowBoardWorkspaceKeyAtom)
    const existing = get(workflowBoardScopePreferencesAtom)
    set(workflowBoardScopePreferencesAtom, {
      ...existing,
      [workspaceKey]: nextScope,
    })
  },
)

const workflowBoardCollapseKeyAtom = atom((get) => {
  const workspaceKey = get(workflowBoardWorkspaceKeyAtom)
  const scope = get(workflowBoardScopeAtom)
  return `${workspaceKey}::scope:${scope}`
})

export const collapsedWorkflowColumnsAtom = atom((get) => {
  const collapseKey = get(workflowBoardCollapseKeyAtom)
  const collapsed = get(workflowBoardCollapsedColumnsAtom)[collapseKey] ?? []
  return new Set<WorkflowColumnId>(collapsed)
})

export const toggleWorkflowColumnCollapsedAtom = atom(
  null,
  (get, set, columnId: WorkflowColumnId) => {
    const collapseKey = get(workflowBoardCollapseKeyAtom)
    const existingMap = get(workflowBoardCollapsedColumnsAtom)
    const current = new Set(existingMap[collapseKey] ?? [])

    if (current.has(columnId)) {
      current.delete(columnId)
    } else {
      current.add(columnId)
    }

    set(workflowBoardCollapsedColumnsAtom, {
      ...existingMap,
      [collapseKey]: Array.from(current),
    })
  },
)

export const resetWorkflowCollapsedColumnsAtom = atom(null, (get, set) => {
  const collapseKey = get(workflowBoardCollapseKeyAtom)
  const existingMap = get(workflowBoardCollapsedColumnsAtom)
  if (!(collapseKey in existingMap)) {
    return
  }

  const next = { ...existingMap }
  delete next[collapseKey]
  set(workflowBoardCollapsedColumnsAtom, next)
})

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

export const respondToWorkflowEscalationAtom = atom(
  null,
  async (_get, set, input: { cardId: string; requestId: string; responseText: string }) => {
    const actionKey = `${input.cardId}:${input.requestId}`
    const nowIso = new Date().toISOString()
    set(workflowEscalationActionStateAtom, (previous) => ({
      ...previous,
      [actionKey]: {
        status: 'submitting',
        message: 'Submitting escalation response…',
        updatedAt: nowIso,
      },
    }))

    const result = await window.api.workflow.respondToEscalation({
      cardId: input.cardId,
      requestId: input.requestId,
      responseText: input.responseText,
    })

    set(workflowEscalationActionStateAtom, (previous) => ({
      ...previous,
      [actionKey]: {
        status: result.status,
        message: result.message,
        updatedAt: result.completedAt,
      },
    }))

    if (result.refreshBoard) {
      const boardResponse = await window.api.workflow.refreshBoard()
      set(workflowBoardAtom, boardResponse.snapshot)
      set(workflowBoardErrorAtom, boardResponse.snapshot.lastError?.message ?? null)
    }

    return result
  },
)

export const openWorkflowIssueAtom = atom(
  null,
  async (_get, set, input: { cardId: string; url: string; identifier?: string }) => {
    const nowIso = new Date().toISOString()
    set(workflowIssueActionStateAtom, (previous) => ({
      ...previous,
      [input.cardId]: {
        status: 'opening',
        message: 'Opening issue link…',
        updatedAt: nowIso,
      },
    }))

    const result = await window.api.workflow.openIssue({
      cardId: input.cardId,
      url: input.url,
      identifier: input.identifier,
    })

    set(workflowIssueActionStateAtom, (previous) => ({
      ...previous,
      [input.cardId]: {
        status: result.status,
        message: result.message,
        updatedAt: result.openedAt,
      },
    }))

    return result
  },
)

function buildScopeKey(params: {
  workspacePath: string
  sessionId: string
  scope: WorkflowBoardScope
}): string {
  return `${params.workspacePath}::${params.sessionId}::scope:${params.scope}`
}

export function shouldRefreshAfterScopeSync(params: {
  rightPaneMode: 'planning' | 'kanban'
  boardActivationReady: boolean
}): boolean {
  return params.rightPaneMode === 'kanban' && params.boardActivationReady
}

export function useWorkflowBoardBridge(): void {
  const rightPaneMode = useAtomValue(rightPaneModeAtom)
  const workspacePath = useAtomValue(workingDirectoryAtom)
  const sessionId = useAtomValue(currentSessionIdAtom)
  const requestedScope = useAtomValue(workflowBoardScopeAtom)

  const setBoard = useSetAtom(workflowBoardAtom)
  const setLoading = useSetAtom(workflowBoardLoadingAtom)
  const setRefreshing = useSetAtom(workflowBoardRefreshingAtom)
  const setError = useSetAtom(workflowBoardErrorAtom)
  const setActive = useSetAtom(workflowBoardActiveAtom)
  const setWorkflowContext = useSetAtom(setWorkflowContextAtom)

  const intervalIdRef = useRef<number | null>(null)
  const activeRef = useRef(false)
  const boardActivationReadyRef = useRef(false)
  const activationVersionRef = useRef(0)

  const normalizedWorkspacePath = workspacePath || 'workspace:none'
  const normalizedSessionId = sessionId || 'session:none'
  const scopeKey = buildScopeKey({
    workspacePath: normalizedWorkspacePath,
    sessionId: normalizedSessionId,
    scope: requestedScope,
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        await window.api.workflow.setScope({
          scopeKey,
          requestedScope,
        })

        const contextResponse = await window.api.workflow.getContext()
        if (!cancelled) {
          setWorkflowContext(contextResponse.context)
        }

        if (
          !shouldRefreshAfterScopeSync({
            rightPaneMode,
            boardActivationReady: boardActivationReadyRef.current,
          })
        ) {
          return
        }

        setRefreshing(true)
        const response = await window.api.workflow.refreshBoard()
        if (!cancelled) {
          setBoard(response.snapshot)
          setError(response.snapshot.lastError?.message ?? null)
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) {
          setRefreshing(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [requestedScope, rightPaneMode, scopeKey, setBoard, setError, setRefreshing, setWorkflowContext])

  useEffect(() => {

    const deactivateInterval = () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current)
        intervalIdRef.current = null
      }
    }

    const deactivatePolling = async () => {
      activeRef.current = false
      boardActivationReadyRef.current = false
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

      boardActivationReadyRef.current = false
      await window.api.workflow.setBoardActive(true)
      if (!isCurrentActivation()) {
        return
      }

      boardActivationReadyRef.current = true
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
      boardActivationReadyRef.current = false
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
