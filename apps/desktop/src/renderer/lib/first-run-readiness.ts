import type {
  FirstRunCheckpointId,
  FirstRunCheckpointState,
  FirstRunReadinessSnapshot,
  ReliabilityRecoveryAction,
} from '@shared/types'

export const FIRST_RUN_CHECKPOINT_LABELS: Record<FirstRunCheckpointId, string> = {
  auth: 'Auth',
  model: 'Model',
  startup: 'Startup',
  first_turn: 'First turn',
}

export function formatFirstRunRecoveryAction(action: ReliabilityRecoveryAction): string {
  switch (action) {
    case 'fix_config':
      return 'Fix configuration'
    case 'reauthenticate':
      return 'Update credentials'
    case 'retry_request':
      return 'Retry request'
    case 'restart_process':
      return 'Restart runtime'
    case 'reconnect':
      return 'Reconnect service'
    case 'refresh_state':
      return 'Refresh state'
    case 'inspect':
    default:
      return 'Inspect diagnostics'
  }
}

export function getFirstRunCheckpoint(
  readiness: FirstRunReadinessSnapshot | null | undefined,
  checkpoint: FirstRunCheckpointId,
): FirstRunCheckpointState | null {
  return readiness?.checkpoints?.[checkpoint] ?? null
}

export function buildFirstRunGuidance(
  checkpoint: FirstRunCheckpointState | null | undefined,
): string | null {
  if (!checkpoint || checkpoint.status === 'pass' || !checkpoint.failure) {
    return null
  }

  return `${checkpoint.failure.message} Recovery: ${formatFirstRunRecoveryAction(
    checkpoint.failure.recoveryAction,
  )}.`
}
