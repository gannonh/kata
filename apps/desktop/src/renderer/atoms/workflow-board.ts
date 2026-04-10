import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useEffect, useRef } from 'react'
import {
  WORKFLOW_COLUMNS,
  type WorkflowBoardSnapshot,
  type WorkflowBoardScope,
  type WorkflowColumnId,
  type WorkflowCreateTaskResult,
  type WorkflowEntityKind,
  type WorkflowMoveEntityResult,
  type WorkflowTaskDetailResponse,
  type WorkflowUpdateTaskResult,
} from '@shared/types'
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

export interface WorkflowBoardReturnContext {
  scope: WorkflowBoardScope
  capturedAt: string
}

export const workflowBoardReturnContextAtom = atom<WorkflowBoardReturnContext | null>(null)

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

type WorkflowEntityMutationState = {
  action: 'move'
  phase: 'pending' | 'success' | 'error'
  targetColumnId: WorkflowColumnId
  message: string
  updatedAt: string
}

export const workflowEscalationActionStateAtom = atom<Record<string, EscalationActionState>>({})
export const workflowIssueActionStateAtom = atom<Record<string, IssueActionState>>({})
export const workflowEntityMutationStateAtom = atom<Record<string, WorkflowEntityMutationState>>({})

export const workflowMutationPendingAtom = atom((get) => {
  return Object.values(get(workflowEntityMutationStateAtom)).some((mutation) => mutation.phase === 'pending')
})

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
    return get(workflowBoardScopePreferencesAtom)[workspaceKey] ?? 'project'
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

export const captureWorkflowBoardReturnContextAtom = atom(null, (get, set) => {
  set(workflowBoardReturnContextAtom, {
    scope: get(workflowBoardScopeAtom),
    capturedAt: new Date().toISOString(),
  })
})

export const clearWorkflowBoardReturnContextAtom = atom(null, (_get, set) => {
  set(workflowBoardReturnContextAtom, null)
})

// --- Card collapse state ---

const collapsedWorkflowCardsAtom = atom<Set<string>>(new Set<string>())

export const isWorkflowCardCollapsedAtom = atom((get) => {
  const collapsed = get(collapsedWorkflowCardsAtom)
  return (cardId: string) => collapsed.has(cardId)
})

export const toggleWorkflowCardCollapsedAtom = atom(
  null,
  (get, set, cardId: string) => {
    const current = new Set(get(collapsedWorkflowCardsAtom))
    if (current.has(cardId)) {
      current.delete(cardId)
    } else {
      current.add(cardId)
    }
    set(collapsedWorkflowCardsAtom, current)
  },
)

export const collapseAllWorkflowCardsAtom = atom(null, (get, set) => {
  const board = get(workflowBoardAtom)
  if (!board) return
  const allCardIds = new Set<string>()
  for (const col of board.columns) {
    for (const card of col.cards) {
      allCardIds.add(card.id)
    }
  }
  set(collapsedWorkflowCardsAtom, allCardIds)
})

export const expandAllWorkflowCardsAtom = atom(null, (_get, set) => {
  set(collapsedWorkflowCardsAtom, new Set())
})

// --- Column collapse state ---

export const collapsedWorkflowColumnsAtom = atom((get) => {
  const collapseKey = get(workflowBoardCollapseKeyAtom)
  const storedMap = get(workflowBoardCollapsedColumnsAtom)
  const hasExplicitState = collapseKey in storedMap

  // When the user has explicitly set collapse state, respect it.
  if (hasExplicitState) {
    return new Set<WorkflowColumnId>(storedMap[collapseKey] ?? [])
  }

  // Otherwise, auto-collapse empty columns and auto-expand non-empty
  // columns so the board gives more space to columns that have cards.
  const snapshot = get(workflowBoardAtom)
  if (!snapshot) {
    return new Set<WorkflowColumnId>()
  }

  const emptyColumnIds = snapshot.columns
    .filter((col) => col.cards.length === 0)
    .map((col) => col.id)
  return new Set<WorkflowColumnId>(emptyColumnIds)
})

export const toggleWorkflowColumnCollapsedAtom = atom(
  null,
  (get, set, columnId: WorkflowColumnId) => {
    const collapseKey = get(workflowBoardCollapseKeyAtom)
    const existingMap = get(workflowBoardCollapsedColumnsAtom)

    // Seed from the computed collapsed set (which includes auto-collapsed
    // empty columns) rather than the raw stored value, so toggling one
    // column doesn't lose the auto-collapse state of others.
    const current = new Set(get(collapsedWorkflowColumnsAtom))

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

  // Explicitly set an empty array (not delete) so the auto-collapse
  // logic doesn't re-collapse empty columns after expand-all.
  set(workflowBoardCollapsedColumnsAtom, {
    ...existingMap,
    [collapseKey]: [],
  })
})

/**
 * Clears explicit column collapse overrides so auto-presentation
 * (auto-collapse empty, auto-expand non-empty) resumes.
 */
export const resetColumnCollapseOverridesAtom = atom(null, (get, set) => {
  const collapseKey = get(workflowBoardCollapseKeyAtom)
  const existingMap = get(workflowBoardCollapsedColumnsAtom)
  const { [collapseKey]: _removed, ...rest } = existingMap
  set(workflowBoardCollapsedColumnsAtom, rest)
})

/**
 * Returns true when the user has explicit column collapse overrides
 * for the current workspace/scope, meaning "Reset columns to auto"
 * would have an effect.
 */
export const hasExplicitColumnOverridesAtom = atom((get) => {
  const collapseKey = get(workflowBoardCollapseKeyAtom)
  return collapseKey in get(workflowBoardCollapsedColumnsAtom)
})

export const workflowBoardHasCardsAtom = atom((get) => {
  const snapshot = get(workflowBoardAtom)
  return snapshot ? snapshot.columns.some((column) => column.cards.length > 0) : false
})

export function workflowEntityMutationKey(entityKind: WorkflowEntityKind, entityId: string): string {
  return `${entityKind}:${entityId}`
}

function toColumnTitle(columnId: WorkflowColumnId): string {
  return WORKFLOW_COLUMNS.find((column) => column.id === columnId)?.title ?? columnId
}

function toColumnStateType(columnId: WorkflowColumnId): string {
  if (columnId === 'backlog') return 'backlog'
  if (columnId === 'todo') return 'unstarted'
  if (columnId === 'done') return 'completed'
  return 'started'
}

function applyOptimisticMove(
  snapshot: WorkflowBoardSnapshot,
  input: { entityKind: WorkflowEntityKind; entityId: string; targetColumnId: WorkflowColumnId },
): WorkflowBoardSnapshot {
  const next = structuredClone(snapshot)
  const targetColumn = next.columns.find((column) => column.id === input.targetColumnId)
  if (!targetColumn) {
    return next
  }

  if (input.entityKind === 'slice') {
    let movingCard: WorkflowBoardSnapshot['columns'][number]['cards'][number] | null = null

    for (const column of next.columns) {
      const cardIndex = column.cards.findIndex((card) => card.id === input.entityId)
      if (cardIndex >= 0) {
        movingCard = column.cards.splice(cardIndex, 1)[0] ?? null
        break
      }
    }

    if (!movingCard) {
      return next
    }

    movingCard.columnId = input.targetColumnId
    movingCard.stateName = toColumnTitle(input.targetColumnId)
    movingCard.stateType = toColumnStateType(input.targetColumnId)
    targetColumn.cards.push(movingCard)
    targetColumn.cards.sort((left, right) => left.identifier.localeCompare(right.identifier))

    return next
  }

  for (const column of next.columns) {
    for (const card of column.cards) {
      const task = card.tasks.find((candidate) => candidate.id === input.entityId)
      if (!task) {
        continue
      }

      task.columnId = input.targetColumnId
      task.stateName = toColumnTitle(input.targetColumnId)
      task.stateType = toColumnStateType(input.targetColumnId)
      card.taskCounts = {
        total: card.tasks.length,
        done: card.tasks.filter((candidate) => candidate.columnId === 'done').length,
      }
      return next
    }
  }

  return next
}

export const moveWorkflowEntityAtom = atom(
  null,
  async (
    get,
    set,
    input: {
      entityKind: WorkflowEntityKind
      entityId: string
      targetColumnId: WorkflowColumnId
      currentColumnId?: WorkflowColumnId
      currentStateId?: string
      currentStateName?: string
      currentStateType?: string
      teamId?: string
      projectId?: string
    },
  ) => {
    const snapshot = get(workflowBoardAtom)
    if (!snapshot) {
      const nowIso = new Date().toISOString()
      return {
        success: false,
        entityKind: input.entityKind,
        entityId: input.entityId,
        targetColumnId: input.targetColumnId,
        status: 'error',
        code: 'FAILED',
        phase: 'rolled_back',
        message: 'Workflow board snapshot unavailable. Please refresh and retry.',
        refreshBoard: false,
        updatedAt: nowIso,
      } satisfies WorkflowMoveEntityResult
    }

    const previousSnapshot = snapshot
    const optimisticSnapshot = applyOptimisticMove(snapshot, input)
    const mutationKey = workflowEntityMutationKey(input.entityKind, input.entityId)
    const startedAt = new Date().toISOString()

    set(workflowBoardAtom, optimisticSnapshot)
    set(workflowEntityMutationStateAtom, (previous) => ({
      ...previous,
      [mutationKey]: {
        action: 'move',
        phase: 'pending',
        targetColumnId: input.targetColumnId,
        message: `Moving to ${toColumnTitle(input.targetColumnId)}…`,
        updatedAt: startedAt,
      },
    }))

    try {
      const result = await window.api.workflow.moveEntity({
        entityKind: input.entityKind,
        entityId: input.entityId,
        targetColumnId: input.targetColumnId,
        currentColumnId: input.currentColumnId,
        currentStateId: input.currentStateId,
        currentStateName: input.currentStateName,
        currentStateType: input.currentStateType,
        teamId: input.teamId,
        projectId: input.projectId,
      })

      if (!result.success) {
        if (result.refreshBoard) {
          const refreshed = await window.api.workflow.refreshBoard()
          set(workflowBoardAtom, refreshed.snapshot)
          set(workflowBoardErrorAtom, refreshed.snapshot.lastError?.message ?? null)
        } else {
          set(workflowBoardAtom, previousSnapshot)
        }

        set(workflowEntityMutationStateAtom, (previous) => ({
          ...previous,
          [mutationKey]: {
            action: 'move',
            phase: 'error',
            targetColumnId: input.targetColumnId,
            message: result.message,
            updatedAt: result.updatedAt,
          },
        }))

        return result
      }

      set(workflowEntityMutationStateAtom, (previous) => ({
        ...previous,
        [mutationKey]: {
          action: 'move',
          phase: 'success',
          targetColumnId: input.targetColumnId,
          message: result.message,
          updatedAt: result.updatedAt,
        },
      }))

      if (result.refreshBoard) {
        const refreshed = await window.api.workflow.refreshBoard()
        set(workflowBoardAtom, refreshed.snapshot)
        set(workflowBoardErrorAtom, refreshed.snapshot.lastError?.message ?? null)
      }

      return result
    } catch (error) {
      const failedAt = new Date().toISOString()
      set(workflowBoardAtom, previousSnapshot)
      set(workflowEntityMutationStateAtom, (previous) => ({
        ...previous,
        [mutationKey]: {
          action: 'move',
          phase: 'error',
          targetColumnId: input.targetColumnId,
          message: error instanceof Error ? error.message : String(error),
          updatedAt: failedAt,
        },
      }))

      return {
        success: false,
        entityKind: input.entityKind,
        entityId: input.entityId,
        targetColumnId: input.targetColumnId,
        status: 'error',
        code: 'FAILED',
        phase: 'rolled_back',
        message: error instanceof Error ? error.message : String(error),
        refreshBoard: false,
        updatedAt: failedAt,
      } satisfies WorkflowMoveEntityResult
    }
  },
)

export const createWorkflowTaskAtom = atom(
  null,
  async (
    _get,
    set,
    input: {
      parentSliceId: string
      title: string
      description?: string
      initialColumnId?: WorkflowColumnId
      teamId?: string
      projectId?: string
    },
  ) => {
    const result = (await window.api.workflow.createTask({
      parentSliceId: input.parentSliceId,
      title: input.title,
      description: input.description,
      initialColumnId: input.initialColumnId,
      teamId: input.teamId,
      projectId: input.projectId,
    })) satisfies WorkflowCreateTaskResult

    if (result.refreshBoard) {
      const refreshed = await window.api.workflow.refreshBoard()
      set(workflowBoardAtom, refreshed.snapshot)
      set(workflowBoardErrorAtom, refreshed.snapshot.lastError?.message ?? null)
    }

    return result
  },
)

export const loadWorkflowTaskDetailAtom = atom(
  null,
  async (_get, _set, input: { taskId: string }) => {
    return (await window.api.workflow.getTaskDetail({ taskId: input.taskId })) satisfies WorkflowTaskDetailResponse
  },
)

export const updateWorkflowTaskAtom = atom(
  null,
  async (
    get,
    set,
    input: {
      taskId: string
      title: string
      description?: string
      targetColumnId?: WorkflowColumnId
      teamId?: string
      projectId?: string
      currentStateId?: string
    },
  ) => {
    const previousSnapshot = get(workflowBoardAtom)

    if (previousSnapshot) {
      const optimisticSnapshot = structuredClone(previousSnapshot)
      for (const column of optimisticSnapshot.columns) {
        for (const card of column.cards) {
          const task = card.tasks.find((candidate) => candidate.id === input.taskId)
          if (!task) {
            continue
          }

          task.title = input.title
          if (input.targetColumnId) {
            task.columnId = input.targetColumnId
            task.stateName = toColumnTitle(input.targetColumnId)
            task.stateType = toColumnStateType(input.targetColumnId)
            card.taskCounts = {
              total: card.tasks.length,
              done: card.tasks.filter((candidate) => candidate.columnId === 'done').length,
            }
          }
        }
      }

      set(workflowBoardAtom, optimisticSnapshot)
    }

    try {
      const result = (await window.api.workflow.updateTask({
        taskId: input.taskId,
        title: input.title,
        description: input.description,
        targetColumnId: input.targetColumnId,
        teamId: input.teamId,
        projectId: input.projectId,
        currentStateId: input.currentStateId,
      })) satisfies WorkflowUpdateTaskResult

      if (!result.success) {
        if (result.refreshBoard) {
          const refreshed = await window.api.workflow.refreshBoard()
          set(workflowBoardAtom, refreshed.snapshot)
          set(workflowBoardErrorAtom, refreshed.snapshot.lastError?.message ?? null)
        } else if (previousSnapshot) {
          set(workflowBoardAtom, previousSnapshot)
        }

        return result
      }

      if (result.refreshBoard) {
        const refreshed = await window.api.workflow.refreshBoard()
        set(workflowBoardAtom, refreshed.snapshot)
        set(workflowBoardErrorAtom, refreshed.snapshot.lastError?.message ?? null)
      }

      return result
    } catch (error) {
      if (previousSnapshot) {
        set(workflowBoardAtom, previousSnapshot)
      }

      return {
        success: false,
        taskId: input.taskId,
        status: 'error',
        code: 'FAILED',
        message: error instanceof Error ? error.message : String(error),
        refreshBoard: false,
        updatedAt: new Date().toISOString(),
      } satisfies WorkflowUpdateTaskResult
    }
  },
)

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
