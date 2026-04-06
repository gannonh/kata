import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import type { WorkflowBoardColumn, WorkflowColumnId } from '@shared/types'
import {
  collapsedWorkflowColumnsAtom,
  refreshWorkflowBoardAtom,
  resetWorkflowCollapsedColumnsAtom,
  toggleWorkflowColumnCollapsedAtom,
  workflowBoardAtom,
  workflowBoardErrorAtom,
  workflowBoardLoadingAtom,
  workflowBoardRefreshingAtom,
  workflowBoardScopeAtom,
} from '@/atoms/workflow-board'
import {
  clearRightPaneOverrideAtom,
  rightPaneOverrideAtom,
  rightPaneResolutionAtom,
  setRightPaneOverrideAtom,
  workflowContextAtom,
} from '@/atoms/right-pane'
import { BoardStateNotice } from '@/components/kanban/BoardStateNotice'
import { KanbanColumn } from '@/components/kanban/KanbanColumn'
import { KanbanHeader } from '@/components/kanban/KanbanHeader'
import { normalizeWorkflowColumns } from '@/lib/workflow-board'

export function summarizeColumnPresentation(
  columns: WorkflowBoardColumn[],
  collapsedColumns: Set<WorkflowColumnId>,
): { collapsedColumnCount: number; hiddenCardCount: number } {
  let hiddenCardCount = 0

  for (const column of columns) {
    if (collapsedColumns.has(column.id)) {
      hiddenCardCount += column.cards.length
    }
  }

  return {
    collapsedColumnCount: collapsedColumns.size,
    hiddenCardCount,
  }
}

export function KanbanPane() {
  const board = useAtomValue(workflowBoardAtom)
  const loading = useAtomValue(workflowBoardLoadingAtom)
  const refreshing = useAtomValue(workflowBoardRefreshingAtom)
  const error = useAtomValue(workflowBoardErrorAtom)
  const selectedScope = useAtomValue(workflowBoardScopeAtom)
  const collapsedColumns = useAtomValue(collapsedWorkflowColumnsAtom)

  const setRightPaneOverride = useSetAtom(setRightPaneOverrideAtom)
  const setScope = useSetAtom(workflowBoardScopeAtom)
  const clearOverride = useSetAtom(clearRightPaneOverrideAtom)
  const toggleCollapsedColumn = useSetAtom(toggleWorkflowColumnCollapsedAtom)
  const resetCollapsedColumns = useSetAtom(resetWorkflowCollapsedColumnsAtom)

  const rightPaneOverride = useAtomValue(rightPaneOverrideAtom)
  const paneResolution = useAtomValue(rightPaneResolutionAtom)
  const workflowContext = useAtomValue(workflowContextAtom)
  const refreshBoard = useSetAtom(refreshWorkflowBoardAtom)

  const columns = board ? normalizeWorkflowColumns(board) : []
  const presentation = summarizeColumnPresentation(columns, collapsedColumns)

  return (
    <aside className="flex h-full flex-col bg-muted/40" data-testid="workflow-kanban-pane">
      <KanbanHeader
        board={board}
        loading={loading}
        refreshing={refreshing}
        selectedScope={selectedScope}
        collapsedColumnCount={presentation.collapsedColumnCount}
        hiddenCardCount={presentation.hiddenCardCount}
        rightPaneOverride={rightPaneOverride}
        paneResolution={paneResolution}
        workflowContext={workflowContext}
        onScopeChange={(scope) => {
          setScope(scope)
        }}
        onExpandAllColumns={() => {
          resetCollapsedColumns()
        }}
        onOpenPlanningView={() => setRightPaneOverride('planning')}
        onRefresh={() => {
          void refreshBoard()
        }}
        onClearOverride={() => clearOverride()}
      />

      <BoardStateNotice board={board} error={error} />

      <div className="min-h-0 flex-1 overflow-x-auto px-3 py-3">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading workflow board…</span>
          </div>
        ) : (
          <div className="flex h-full min-w-max gap-3">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                collapsed={collapsedColumns.has(column.id)}
                onToggleCollapse={() => {
                  toggleCollapsedColumn(column.id)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
