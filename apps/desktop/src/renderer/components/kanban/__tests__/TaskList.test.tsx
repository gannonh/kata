import { describe, expect, test } from 'vitest'
import { getTaskMoveTargetOptions } from '../TaskList'

describe('TaskList move options', () => {
  test('returns all workflow columns except the current task column', () => {
    const options = getTaskMoveTargetOptions('in_progress')

    expect(options.some((option) => option.id === 'in_progress')).toBe(false)
    expect(options.some((option) => option.id === 'todo')).toBe(true)
    expect(options.some((option) => option.id === 'done')).toBe(true)
  })
})
