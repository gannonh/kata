import type {
  WorkflowBoardSnapshot,
  WorkflowContextSnapshot,
  WorkflowContextMode,
  WorkflowContextReason,
} from '../shared/types'

export interface ResolveWorkflowContextInput {
  planningActive: boolean
  trackerConfigured: boolean
  boardSnapshot: WorkflowBoardSnapshot | null
}

export interface WorkflowContextTransition {
  previous: WorkflowContextSnapshot | null
  next: WorkflowContextSnapshot
}

export class WorkflowContextService {
  private snapshot: WorkflowContextSnapshot | null = null

  resolve(input: ResolveWorkflowContextInput): WorkflowContextTransition {
    const next = buildWorkflowContextSnapshot(input)
    const previous = this.snapshot
    this.snapshot = next
    return { previous, next }
  }

  getSnapshot(): WorkflowContextSnapshot | null {
    return this.snapshot
  }

  reset(): void {
    this.snapshot = null
  }
}

export function buildWorkflowContextSnapshot(
  input: ResolveWorkflowContextInput,
): WorkflowContextSnapshot {
  const boardAvailable = isBoardAvailable(input.boardSnapshot)

  let mode: WorkflowContextMode = 'unknown'
  let reason: WorkflowContextReason = 'unknown_context'

  if (input.planningActive) {
    mode = 'planning'
    reason = 'planning_activity_detected'
  } else if (input.trackerConfigured && boardAvailable) {
    mode = 'execution'
    reason = 'tracker_and_board_available'
  } else if (input.trackerConfigured) {
    mode = 'execution'
    reason = 'tracker_configured_board_pending'
  } else if (boardAvailable) {
    mode = 'execution'
    reason = 'board_available_without_tracker'
  }

  return {
    mode,
    reason,
    planningActive: input.planningActive,
    trackerConfigured: input.trackerConfigured,
    boardAvailable,
    updatedAt: new Date().toISOString(),
  }
}

function isBoardAvailable(boardSnapshot: WorkflowBoardSnapshot | null): boolean {
  if (!boardSnapshot) {
    return false
  }

  return (
    boardSnapshot.status === 'fresh' ||
    boardSnapshot.status === 'empty' ||
    boardSnapshot.status === 'stale'
  )
}
