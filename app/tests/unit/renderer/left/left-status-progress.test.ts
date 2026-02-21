import { describe, expect, it } from 'vitest'

import { buildLeftStatusProgress } from '../../../../src/renderer/components/left/left-status-progress'

describe('buildLeftStatusProgress', () => {
  it('returns simple mode when no tasks have started', () => {
    const result = buildLeftStatusProgress([
      { id: 't1', title: 'Task 1', status: 'todo' },
      { id: 't2', title: 'Task 2', status: 'todo' }
    ])

    expect(result.mode).toBe('simple')
    expect(result.message).toBe('Tasks ready to go.')
    expect(result.liveSegments).toHaveLength(10)
    expect(result.liveSegments.filter((segment) => segment === 'todo')).toHaveLength(10)
  })

  it('uses 10 segments baseline and marks four done + one in progress for busy state', () => {
    const result = buildLeftStatusProgress([
      { id: 't1', title: 'Task 1', status: 'done' },
      { id: 't2', title: 'Task 2', status: 'done' },
      { id: 't3', title: 'Task 3', status: 'done' },
      { id: 't4', title: 'Task 4', status: 'done' },
      { id: 't5', title: 'Task 5', status: 'in_progress' }
    ])

    expect(result.mode).toBe('progress')
    expect(result.message).toBe('4 of 5 complete.')
    expect(result.liveSegments).toHaveLength(10)
    expect(result.liveSegments.slice(0, 5)).toEqual(['done', 'done', 'done', 'done', 'in_progress'])
  })

  it('rolls completed full rows into N done chips with 25-per-row cap', () => {
    const tasks = Array.from({ length: 60 }, (_, index) => ({
      id: `t-${index}`,
      title: `Task ${index}`,
      status: index < 50 ? ('done' as const) : ('todo' as const)
    }))

    const result = buildLeftStatusProgress(tasks)

    expect(result.mode).toBe('progress')
    expect(result.message).toBe('50 of 60 complete.')
    expect(result.rollups).toEqual([{ label: '25 done' }, { label: '25 done' }])
    expect(result.liveSegments).toHaveLength(10)
  })

  it('scales track size to 20 and then 25 as task counts grow', () => {
    const twentyTrack = buildLeftStatusProgress(
      Array.from({ length: 15 }, (_, index) => ({
        id: `t20-${index}`,
        title: `Task ${index}`,
        status: 'todo' as const
      }))
    )
    const twentyFiveTrack = buildLeftStatusProgress(
      Array.from({ length: 23 }, (_, index) => ({
        id: `t25-${index}`,
        title: `Task ${index}`,
        status: 'todo' as const
      }))
    )

    expect(twentyTrack.liveSegments).toHaveLength(20)
    expect(twentyFiveTrack.liveSegments).toHaveLength(25)
  })

  it('returns all-complete message when every task is done', () => {
    const result = buildLeftStatusProgress([
      { id: 't1', title: 'Task 1', status: 'done' },
      { id: 't2', title: 'Task 2', status: 'done' }
    ])

    expect(result.mode).toBe('progress')
    expect(result.message).toBe('2 of 2 complete.')
  })

  it('coerces unknown task statuses to muted todo segments', () => {
    const result = buildLeftStatusProgress([
      { id: 't1', title: 'Task 1', status: 'unknown' as never }
    ])

    expect(result.mode).toBe('simple')
    expect(result.liveSegments[0]).toBe('todo')
    expect(result.liveSegments).toHaveLength(10)
  })
})
