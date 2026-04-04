import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid, Loader2, RefreshCcw } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { normalizeWorkflowColumns } from '@/lib/workflow-board'

export function formatWorkflowBoardStatus(input: {
  loading: boolean
  boardStatus?: 'fresh' | 'stale' | 'empty' | 'error'
  backend?: string
  emptyReason?: string
  refreshing: boolean
}): string {
  if (input.loading) {
    return 'Loading workflow board…'
  }

  let status = 'Workflow board not loaded'

  if (input.boardStatus === 'fresh') {
    status = `Live data · ${input.backend ?? 'unknown'}`
  } else if (input.boardStatus === 'empty') {
    status = input.emptyReason ?? 'No work items found'
  } else if (input.boardStatus === 'stale') {
    status = 'Showing stale board snapshot'
  } else if (input.boardStatus === 'error') {
    status = 'Workflow board unavailable'
  }

  return input.refreshing ? `${status} · Refreshing…` : status
}

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
      <div className="flex h-14 items-center justify-between px-4">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Workflow Board</h2>
          <p className="truncate text-sm font-medium text-foreground">
            {board?.activeMilestone?.name ?? 'No active milestone'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Open planning view"
            onClick={() => setRightPaneOverride('planning')}
          >
            <LayoutGrid className="size-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Refresh workflow board"
            onClick={() => {
              void refreshBoard()
            }}
          >
            <RefreshCcw className="size-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground" data-testid="workflow-board-status">
        {rightPaneOverride ? `Manual override: ${rightPaneOverride}` : `Auto mode: ${paneResolution.reason}`}
        {' · '}
        {`Context: ${workflowContext.mode}`}
        {' · '}
        {formatWorkflowBoardStatus({
          loading,
          boardStatus: board?.status,
          backend: board?.backend,
          emptyReason: board?.emptyReason,
          refreshing,
        })}
      </div>

      {rightPaneOverride ? (
        <div className="border-b border-border bg-muted/70 px-4 py-2 text-xs text-muted-foreground">
          Manual pane override is active.
          <Button
            type="button"
            variant="link"
            className="ml-1 h-auto p-0 text-xs"
            onClick={() => clearOverride()}
          >
            Return to auto mode
          </Button>
        </div>
      ) : null}

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
