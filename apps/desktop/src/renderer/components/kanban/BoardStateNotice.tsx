import type { WorkflowBoardSnapshot } from '@shared/types'

interface BoardStateNoticeProps {
  board: WorkflowBoardSnapshot | null
  error: string | null
}

export function BoardStateNotice({ board, error }: BoardStateNoticeProps) {
  const notices: Array<{ id: string; tone: 'error' | 'warning'; message: string }> = []

  if (error) {
    notices.push({
      id: 'board-error',
      tone: 'error',
      message: `${error} Last known board state is still shown so you can recover without losing context.`,
    })
  }

  if (board?.status === 'stale') {
    notices.push({
      id: 'board-stale',
      tone: 'warning',
      message:
        'Workflow data is stale. Retry refresh to reconcile rollback or remote changes before continuing board mutations.',
    })
  }

  if (board?.scope?.requested === 'active' && board.scope.resolved !== 'active') {
    const reason = board.scope.reason
    const message =
      reason === 'operator_state_unavailable'
        ? 'Symphony is not running. Start Symphony to use Active scope. Showing project-wide view instead.'
        : reason === 'operator_state_disconnected'
          ? 'Symphony is disconnected. Showing project-wide view until connection is restored.'
          : reason === 'operator_state_stale'
            ? 'Symphony state is stale. Showing project-wide view until a fresh update arrives.'
            : board.scope.note ??
              `Active scope is unavailable (${reason}). Showing ${board.scope.resolved} scope instead.`
    notices.push({
      id: 'active-fallback',
      tone: 'warning',
      message,
    })
  } else if (board?.symphony?.staleReason) {
    // Only show symphony-stale when it's NOT already covered by the active-fallback notice
    notices.push({
      id: 'symphony-stale',
      tone: 'warning',
      message: board.symphony.staleReason,
    })
  }

  if (notices.length === 0) {
    return null
  }

  return (
    <div className="space-y-1 px-4 pt-2" data-testid="board-state-notice">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={
            notice.tone === 'error'
              ? 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'
              : 'rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200'
          }
          data-testid={`board-state-notice-${notice.id}`}
        >
          {notice.message}
        </div>
      ))}
    </div>
  )
}
