import type { ProjectTask, TaskStatus } from '../../types/project'

export const LEFT_STATUS_ROW_CAP = 25
const LEFT_STATUS_MIN_TRACK_SEGMENTS = 10
const LEFT_STATUS_MID_TRACK_SEGMENTS = 20

export type LeftStatusMode = 'simple' | 'progress'
export type LeftStatusMessage = string
export type SegmentTone = TaskStatus

export type LeftStatusProgressView = {
  mode: LeftStatusMode
  message: LeftStatusMessage
  rollups: Array<{ label: string }>
  liveSegments: SegmentTone[]
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'done' || value === 'blocked'
}

function toSegmentTone(task: ProjectTask): SegmentTone {
  return isTaskStatus(task.status) ? task.status : 'todo'
}

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

  push('done', doneCount)
  push('in_progress', inProgressCount)
  push('blocked', blockedCount)
  push('todo', todoCount)

  while (track.length < segmentCount) {
    track.push('todo')
  }

  return track
}

export function buildLeftStatusProgress(tasks: ProjectTask[]): LeftStatusProgressView {
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
