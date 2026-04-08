import type { ReliabilitySignal, ThresholdBreach, WorkflowBoardSnapshot } from '@shared/types'
import {
  formatReliabilityActionLabel,
  formatReliabilityClassLabel,
  formatStabilityMetricLabel,
  reliabilitySeverityTone,
  useReliabilitySurfaceState,
  useStabilityBreachesForSurface,
} from '@/atoms/reliability'

interface BoardStateNoticeProps {
  board: WorkflowBoardSnapshot | null
  error: string | null
}

export function formatWorkflowReliabilityNotice(signal: ReliabilitySignal): string {
  return (
    `${formatReliabilityClassLabel(signal.class)} issue (${signal.code}). ` +
    `${signal.message} ` +
    `Recommended recovery: ${formatReliabilityActionLabel(signal.recoveryAction)}.` +
    (signal.lastKnownGoodAt
      ? ` Last known good: ${new Date(signal.lastKnownGoodAt).toLocaleTimeString()}.`
      : '')
  )
}

export function formatWorkflowStabilityNotice(breach: ThresholdBreach): string {
  return (
    `${formatStabilityMetricLabel(breach.metric)} threshold breach (${breach.code}). ` +
    `${breach.message} ` +
    `Suggested recovery: ${breach.suggestedRecovery}.` +
    (breach.lastKnownGoodAt
      ? ` Last known good: ${new Date(breach.lastKnownGoodAt).toLocaleTimeString()}.`
      : '')
  )
}

export function BoardStateNotice({ board, error }: BoardStateNoticeProps) {
  const workflowReliability = useReliabilitySurfaceState('workflow_board')
  const workflowStabilityBreaches = useStabilityBreachesForSurface('workflow_board')
  const notices: Array<{ id: string; tone: 'error' | 'warning'; message: string }> = []

  if (workflowReliability.signal) {
    const tone = reliabilitySeverityTone(workflowReliability.signal.severity) === 'error' ? 'error' : 'warning'

    notices.push({
      id: 'workflow-reliability',
      tone,
      message: formatWorkflowReliabilityNotice(workflowReliability.signal),
    })
  }

  for (const breach of workflowStabilityBreaches) {
    notices.push({
      id: `workflow-stability-${breach.code}`,
      tone: reliabilitySeverityTone(breach.severity) === 'error' ? 'error' : 'warning',
      message: formatWorkflowStabilityNotice(breach),
    })
  }

  if (!workflowReliability.signal) {
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
  }

  const activeUnavailable =
    board?.scope?.requested === 'active' &&
    board.scope.reason !== 'requested' &&
    (board.scope.reason === 'operator_state_unavailable' ||
      board.scope.reason === 'operator_state_disconnected' ||
      board.scope.reason === 'operator_state_stale')

  if (activeUnavailable) {
    const reason = board!.scope!.reason
    const message =
      board!.scope!.note ??
      (reason === 'operator_state_unavailable'
        ? 'Symphony is not running. Start Symphony to see active work.'
        : reason === 'operator_state_disconnected'
          ? 'Symphony is disconnected. Active work will appear when the connection is restored.'
          : reason === 'operator_state_stale'
            ? 'Symphony state is stale. Active work will appear when a fresh update arrives.'
            : `Active scope is unavailable (${reason}).`)
    notices.push({
      id: 'active-fallback',
      tone: 'warning',
      message,
    })
  } else if (board?.scope?.requested === 'active' && board.scope.resolved !== 'active') {
    notices.push({
      id: 'active-fallback',
      tone: 'warning',
      message:
        board.scope.note ??
        `Active scope is unavailable (${board.scope.reason}). Showing ${board.scope.resolved} scope instead.`,
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
