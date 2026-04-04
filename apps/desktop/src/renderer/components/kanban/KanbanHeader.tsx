import { LayoutGrid, RefreshCcw } from 'lucide-react'
import type { RightPaneResolution, RightPaneOverride, WorkflowBoardSnapshot, WorkflowContextSnapshot } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

function formatPaneResolutionReason(reason: string): string {
  const labels: Record<string, string> = {
    manual_override: 'Manual override',
    default_fallback: 'Default fallback',
    planning_activity_detected: 'Planning activity detected',
    tracker_and_board_available: 'Tracker configured and board available',
    tracker_configured_board_pending: 'Tracker configured — board pending',
    board_available_without_tracker: 'Board available without tracker config',
    unknown_context: 'Context unavailable',
  }

  return labels[reason] ?? 'Automatic context resolution'
}

function formatBoardSource(snapshot: WorkflowBoardSnapshot | null): string {
  if (!snapshot) {
    return 'unknown source'
  }

  if (snapshot.backend === 'github') {
    const mode = snapshot.source.githubStateMode ?? 'labels'
    const repo =
      snapshot.source.repoOwner && snapshot.source.repoName
        ? `${snapshot.source.repoOwner}/${snapshot.source.repoName}`
        : 'unknown-repo'
    return `${snapshot.backend} · ${mode} · ${repo}`
  }

  return snapshot.backend
}

export function formatWorkflowBoardStatus(input: {
  loading: boolean
  boardStatus?: 'fresh' | 'stale' | 'empty' | 'error'
  board?: WorkflowBoardSnapshot | null
  emptyReason?: string
  refreshing: boolean
}): string {
  if (input.loading) {
    return 'Loading workflow board…'
  }

  let status = 'Workflow board not loaded'

  if (input.boardStatus === 'fresh') {
    status = `Live data · ${formatBoardSource(input.board ?? null)}`
  } else if (input.boardStatus === 'empty') {
    status = input.emptyReason ?? 'No work items found'
  } else if (input.boardStatus === 'stale') {
    const lastSuccess = input.board?.poll.lastSuccessAt
      ? ` · Last success ${new Date(input.board.poll.lastSuccessAt).toLocaleTimeString()}`
      : ''
    status = `Showing stale board snapshot · ${formatBoardSource(input.board ?? null)}${lastSuccess}`
  } else if (input.boardStatus === 'error') {
    status = `Workflow board unavailable · ${formatBoardSource(input.board ?? null)}`
  }

  return input.refreshing ? `${status} · Refreshing…` : status
}

export function formatSymphonyBoardStatus(board: WorkflowBoardSnapshot | null): string {
  if (!board?.symphony) {
    return 'Symphony: unavailable'
  }

  const symphony = board.symphony
  const statusLabel =
    symphony.freshness === 'fresh'
      ? 'live'
      : symphony.freshness === 'stale'
        ? 'stale'
        : symphony.freshness === 'disconnected'
          ? 'disconnected'
          : 'unknown'

  const mismatchLabel =
    symphony.diagnostics.correlationMisses.length > 0
      ? ` · ${symphony.diagnostics.correlationMisses.length} correlation miss${
          symphony.diagnostics.correlationMisses.length === 1 ? '' : 'es'
        }`
      : ''

  const workerLabel = `${symphony.workerCount} worker${symphony.workerCount === 1 ? '' : 's'}`
  const escalationLabel = `${symphony.escalationCount} escalation${symphony.escalationCount === 1 ? '' : 's'}`

  return `Symphony: ${statusLabel} · ${workerLabel} · ${escalationLabel}${mismatchLabel}`
}

interface KanbanHeaderProps {
  board: WorkflowBoardSnapshot | null
  loading: boolean
  refreshing: boolean
  rightPaneOverride: RightPaneOverride
  paneResolution: RightPaneResolution
  workflowContext: WorkflowContextSnapshot
  onOpenPlanningView: () => void
  onRefresh: () => void
  onClearOverride: () => void
}

export function KanbanHeader({
  board,
  loading,
  refreshing,
  rightPaneOverride,
  paneResolution,
  workflowContext,
  onOpenPlanningView,
  onRefresh,
  onClearOverride,
}: KanbanHeaderProps) {
  return (
    <>
      <div className="flex h-14 items-center justify-between px-4">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Workflow Board</h2>
          <p className="truncate text-sm font-medium text-foreground">
            {board?.activeMilestone?.name ?? 'No active milestone'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" aria-label="Open planning view" onClick={onOpenPlanningView}>
            <LayoutGrid className="size-4" />
          </Button>

          <Button type="button" size="icon" variant="ghost" aria-label="Refresh workflow board" onClick={onRefresh}>
            <RefreshCcw className="size-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground" data-testid="workflow-board-status">
        {rightPaneOverride
          ? `Manual override: ${rightPaneOverride}`
          : `Auto mode: ${formatPaneResolutionReason(paneResolution.reason)}`}
        {' · '}
        {`Context: ${workflowContext.mode}`}
        {' · '}
        {formatWorkflowBoardStatus({
          loading,
          boardStatus: board?.status,
          board,
          emptyReason: board?.emptyReason,
          refreshing,
        })}
        {' · '}
        {formatSymphonyBoardStatus(board)}
      </div>

      {board?.symphony?.staleReason ? (
        <div className="border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200" data-testid="workflow-board-symphony-stale">
          {board.symphony.staleReason}
        </div>
      ) : null}

      {rightPaneOverride ? (
        <div className="border-b border-border bg-muted/70 px-4 py-2 text-xs text-muted-foreground">
          Manual pane override is active.
          <Button type="button" variant="link" className="ml-1 h-auto p-0 text-xs" onClick={onClearOverride}>
            Return to auto mode
          </Button>
        </div>
      ) : null}
    </>
  )
}
