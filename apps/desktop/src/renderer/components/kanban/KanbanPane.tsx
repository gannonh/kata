import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import {
  refreshWorkflowBoardAtom,
  workflowBoardAtom,
  workflowBoardErrorAtom,
  workflowBoardLoadingAtom,
  workflowBoardRefreshingAtom,
} from '@/atoms/workflow-board'
import {
  clearRightPaneOverrideAtom,
  rightPaneOverrideAtom,
  rightPaneResolutionAtom,
  setRightPaneOverrideAtom,
  workflowContextAtom,
} from '@/atoms/right-pane'
import { KanbanColumn } from '@/components/kanban/KanbanColumn'
import { KanbanHeader } from '@/components/kanban/KanbanHeader'
import { normalizeWorkflowColumns } from '@/lib/workflow-board'

export function KanbanPane() {
  const board = useAtomValue(workflowBoardAtom)
  const loading = useAtomValue(workflowBoardLoadingAtom)
  const refreshing = useAtomValue(workflowBoardRefreshingAtom)
  const error = useAtomValue(workflowBoardErrorAtom)
  const setRightPaneOverride = useSetAtom(setRightPaneOverrideAtom)
  const clearOverride = useSetAtom(clearRightPaneOverrideAtom)
  const rightPaneOverride = useAtomValue(rightPaneOverrideAtom)
  const paneResolution = useAtomValue(rightPaneResolutionAtom)
  const workflowContext = useAtomValue(workflowContextAtom)
  const refreshBoard = useSetAtom(refreshWorkflowBoardAtom)

  const columns = board ? normalizeWorkflowColumns(board) : []

  return (
    <aside className="flex h-full flex-col bg-muted/40" data-testid="workflow-kanban-pane">
      <KanbanHeader
        board={board}
        loading={loading}
        refreshing={refreshing}
        rightPaneOverride={rightPaneOverride}
        paneResolution={paneResolution}
        workflowContext={workflowContext}
        onOpenPlanningView={() => setRightPaneOverride('planning')}
        onRefresh={() => {
          void refreshBoard()
        }}
        onClearOverride={() => clearOverride()}
      />

      {error ? (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-x-auto px-3 py-3">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading workflow board…</span>
          </div>
        ) : (
          <div className="flex h-full min-w-max gap-3">
            {columns.map((column) => (
              <KanbanColumn key={column.id} column={column} />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
