import type { ProjectTask, TaskStatus } from '../../types/project'

export const LEFT_STATUS_ROW_CAP = 25
const LEFT_STATUS_MIN_TRACK_SEGMENTS = 10
const LEFT_STATUS_MID_TRACK_SEGMENTS = 20

export type LeftStatusMode = 'simple' | 'progress'
export type SegmentTone = TaskStatus
export type RollupChip = { label: string }

export type LeftStatusProgressView = {
  mode: LeftStatusMode
  message: string
  rollups: RollupChip[]
  liveSegments: SegmentTone[]
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'done' || value === 'blocked'
}

function toSegmentTone(task: ProjectTask): SegmentTone {
  if (isTaskStatus(task.status)) {
    return task.status
  }
  console.warn(
    `[left-status-progress] Task "${task.id}" has unrecognized status "${String(task.status)}", defaulting to "todo"`
  )
  return 'todo'
}

// Tier the live track width: <=10 -> 10, <=20 -> 20, else 25.
function resolveTrackSegmentCount(taskCount: number): number {
  if (taskCount <= LEFT_STATUS_MIN_TRACK_SEGMENTS) {
    return LEFT_STATUS_MIN_TRACK_SEGMENTS
  }

  if (taskCount <= LEFT_STATUS_MID_TRACK_SEGMENTS) {
    return LEFT_STATUS_MID_TRACK_SEGMENTS
  }

  return LEFT_STATUS_ROW_CAP
}

function buildTrack({
  doneCount,
  inProgressCount,
  blockedCount,
  todoCount,
  segmentCount
}: {
  doneCount: number
  inProgressCount: number
  blockedCount: number
  todoCount: number
  segmentCount: number
}): SegmentTone[] {
  const track: SegmentTone[] = []

  const push = (status: SegmentTone, count: number) => {
    for (let index = 0; index < count && track.length < segmentCount; index += 1) {
      track.push(status)
    }
  }

  // Segment order matches visual layout: done | in_progress | blocked | todo
  push('done', doneCount)
  push('in_progress', inProgressCount)
  push('blocked', blockedCount)
  push('todo', todoCount)

  while (track.length < segmentCount) {
    track.push('todo')
  }

  return track
}

/**
 * Computes a view model for the left-panel progress bar.
 * Completed rows of 25 become rollup chips; the remaining tasks
 * fill a live track sized at 10, 20, or 25 segments.
 */
export function buildLeftStatusProgress(tasks: ProjectTask[]): LeftStatusProgressView {
  if (tasks.length === 0) {
    return { mode: 'simple', message: 'No tasks yet.', rollups: [], liveSegments: [] }
  }

  const segmentTones = tasks.map(toSegmentTone)
  const totalCount = segmentTones.length
  const counts = segmentTones.reduce<Record<SegmentTone, number>>(
    (acc, status) => {
      acc[status] += 1
      return acc
    },
    { done: 0, in_progress: 0, blocked: 0, todo: 0 }
  )
  const doneCount = counts.done
  const inProgressCount = counts.in_progress
  const blockedCount = counts.blocked
  const todoCount = counts.todo
  const isAllComplete = totalCount > 0 && doneCount === totalCount
  const hasProgress = doneCount > 0 || inProgressCount > 0 || blockedCount > 0
  const completeRows = Math.floor(doneCount / LEFT_STATUS_ROW_CAP)
  const rollups = Array.from({ length: completeRows }, () => ({
    label: `${LEFT_STATUS_ROW_CAP} done`
  }))
  const remainingTotal = totalCount - completeRows * LEFT_STATUS_ROW_CAP
  const trackSegments = resolveTrackSegmentCount(remainingTotal)

  if (!hasProgress) {
    return {
      mode: 'simple',
      message: 'Tasks ready to go.',
      rollups,
      liveSegments: buildTrack({
        doneCount: 0,
        inProgressCount: 0,
        blockedCount: 0,
        todoCount,
        segmentCount: trackSegments
      })
    }
  }

  if (isAllComplete) {
    return {
      mode: 'progress',
      message: `${doneCount} of ${totalCount} complete.`,
      rollups,
      liveSegments: Array.from({ length: trackSegments }, () => 'done')
    }
  }

  const remainingDoneCount = doneCount - completeRows * LEFT_STATUS_ROW_CAP
  const liveSegments = buildTrack({
    doneCount: Math.max(0, remainingDoneCount),
    inProgressCount,
    blockedCount,
    todoCount,
    segmentCount: trackSegments
  })

  return {
    mode: 'progress',
    message: `${doneCount} of ${totalCount} complete.`,
    rollups,
    liveSegments
  }
}
