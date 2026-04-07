import { LayoutGrid, RefreshCcw } from 'lucide-react'
import type {
  RightPaneResolution,
  RightPaneOverride,
  WorkflowBoardScope,
  WorkflowBoardSnapshot,
  WorkflowContextSnapshot,
} from '@shared/types'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const SCOPE_OPTIONS: Array<{ scope: WorkflowBoardScope; label: string }> = [
  { scope: 'active', label: 'Active' },
  { scope: 'project', label: 'Project' },
  { scope: 'milestone', label: 'Milestone' },
]

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

function scopeLabel(scope: WorkflowBoardScope): string {
  return SCOPE_OPTIONS.find((entry) => entry.scope === scope)?.label ?? scope
}

function formatScopeReason(reason: string): string {
  const labels: Record<string, string> = {
    requested: 'requested',
    milestone_scope_not_supported: 'milestone unavailable for this tracker',
    operator_state_unavailable: 'operator state unavailable',
    operator_state_stale: 'operator state stale',
    operator_state_disconnected: 'operator disconnected',
  }

  return labels[reason] ?? reason
}

export function formatScopeStatus(board: WorkflowBoardSnapshot | null, selectedScope: WorkflowBoardScope): string {
  const scope = board?.scope
  if (!scope) {
    return `Scope: ${scopeLabel(selectedScope)}`
  }

  if (scope.requested === scope.resolved) {
    const activeLabel =
      scope.resolved === 'active' && typeof scope.activeMatchCount === 'number'
        ? ` · ${scope.activeMatchCount} active match${scope.activeMatchCount === 1 ? '' : 'es'}`
        : ''
    return `Scope: ${scopeLabel(scope.resolved)}${activeLabel}`
  }

  return `Scope: ${scopeLabel(scope.requested)} → ${scopeLabel(scope.resolved)} (${formatScopeReason(scope.reason)})`
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
  if (!board?.symphony || board.symphony.provenance === 'unavailable') {
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
  selectedScope: WorkflowBoardScope
  collapsedColumnCount: number
  hiddenCardCount: number
  rightPaneOverride: RightPaneOverride
  paneResolution: RightPaneResolution
  workflowContext: WorkflowContextSnapshot
  mcpShortcutDisabled: boolean
  refreshDisabled: boolean
  actionLockReason?: string | null
  onScopeChange: (scope: WorkflowBoardScope) => void
  onExpandAllColumns: () => void
  onOpenPlanningView: () => void
  onOpenMcpSettings: () => void
  onRefresh: () => void
  onClearOverride: () => void
}

export function KanbanHeader({
  board,
  loading,
  refreshing,
  selectedScope,
  collapsedColumnCount,
  hiddenCardCount,
  rightPaneOverride,
  paneResolution,
  workflowContext,
  mcpShortcutDisabled,
  refreshDisabled,
  actionLockReason,
  onScopeChange,
  onExpandAllColumns,
  onOpenPlanningView,
  onOpenMcpSettings,
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
          <div className="mr-1 flex items-center rounded-md border border-border/70 bg-background/70 p-0.5">
            {SCOPE_OPTIONS.map((option) => (
              <Button
                key={option.scope}
                type="button"
                size="sm"
                variant={selectedScope === option.scope ? 'secondary' : 'ghost'}
                className="h-7 px-2 text-[11px]"
                aria-label={`Show ${option.label} scope`}
                onClick={() => onScopeChange(option.scope)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {collapsedColumnCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mr-1 h-7 px-2 text-[11px]"
              onClick={onExpandAllColumns}
              data-testid="kanban-expand-all-columns"
            >
              Expand {collapsedColumnCount} column{collapsedColumnCount === 1 ? '' : 's'}
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            aria-label="Open MCP tab"
            onClick={onOpenMcpSettings}
            disabled={mcpShortcutDisabled}
            title="Open MCP settings (⌘⇧M / Ctrl+Shift+M)"
            data-testid="kanban-open-mcp-settings"
          >
            MCP
          </Button>

          <Button type="button" size="icon" variant="ghost" aria-label="Open planning view" onClick={onOpenPlanningView}>
            <LayoutGrid className="size-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Refresh workflow board"
            onClick={onRefresh}
            disabled={refreshDisabled}
            title="Refresh workflow board (⌘⇧R / Ctrl+Shift+R)"
            data-testid="kanban-refresh-board"
          >
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
        {formatScopeStatus(board, selectedScope)}
        {' · '}
        {collapsedColumnCount > 0
          ? `Columns: ${collapsedColumnCount} collapsed · ${hiddenCardCount} hidden card${hiddenCardCount === 1 ? '' : 's'}`
          : 'Columns: all expanded'}
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

      <div className="border-b border-border bg-background/80 px-4 py-1 text-[11px] text-muted-foreground">
        Shortcuts: <span className="font-mono">⌘⇧M</span> open MCP settings ·{' '}
        <span className="font-mono">⌘⇧R</span> refresh board
      </div>

      {actionLockReason ? (
        <div
          className="border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200"
          data-testid="kanban-action-lock-reason"
        >
          {actionLockReason}
        </div>
      ) : null}



      {rightPaneOverride ? (
        <div className="border-b border-border bg-muted/70 px-4 py-2 text-xs text-muted-foreground">
          Manual pane override is active.
          <Button type="button" variant="link" className="ml-1 h-auto p-0 text-xs text-sidebar-primary" onClick={onClearOverride}>
            Return to auto mode
          </Button>
        </div>
      ) : null}
    </>
  )
}
