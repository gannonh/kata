import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid, Loader2, RefreshCcw } from 'lucide-react'
import {
  refreshWorkflowBoardAtom,
  workflowBoardAtom,
  workflowBoardErrorAtom,
  workflowBoardLoadingAtom,
  workflowBoardRefreshingAtom,
} from '@/atoms/workflow-board'
import { rightPaneModeAtom } from '@/atoms/planning'
import { KanbanColumn } from '@/components/kanban/KanbanColumn'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { normalizeWorkflowColumns } from '@/lib/workflow-board'

export function KanbanPane() {
  const board = useAtomValue(workflowBoardAtom)
  const loading = useAtomValue(workflowBoardLoadingAtom)
  const refreshing = useAtomValue(workflowBoardRefreshingAtom)
  const error = useAtomValue(workflowBoardErrorAtom)
  const setRightPaneMode = useSetAtom(rightPaneModeAtom)
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
            onClick={() => setRightPaneMode('planning')}
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
        {loading ? 'Loading workflow board…' : null}
        {!loading && !board ? 'Workflow board not loaded' : null}
        {!loading && board?.status === 'fresh'
          ? `Live data · ${board.backend}${board.source.githubStateMode ? ` · ${board.source.githubStateMode}` : ''}${board.source.repoOwner && board.source.repoName ? ` · ${board.source.repoOwner}/${board.source.repoName}` : ''}`
          : null}
        {!loading && board?.status === 'empty' ? board.emptyReason ?? 'No work items found' : null}
        {!loading && board?.status === 'stale' ? 'Showing stale board snapshot' : null}
        {!loading && board?.status === 'error' ? 'Workflow board unavailable' : null}
        {refreshing ? ' · Refreshing…' : null}
      </div>

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
