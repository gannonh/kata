import { describe, expect, test } from 'vitest'
import { validateTaskMutationValues } from '../TaskMutationDialog'

describe('TaskMutationDialog validation', () => {
  test('requires a non-empty title', () => {
    expect(
      validateTaskMutationValues({
        title: '   ',
        description: '',
        columnId: 'todo',
      }),
    ).toBe('Task title is required.')
  })

  test('rejects titles longer than 240 characters', () => {
    expect(
      validateTaskMutationValues({
        title: 'x'.repeat(241),
        description: '',
        columnId: 'todo',
      }),
    ).toBe('Task title must be 240 characters or fewer.')
  })

  test('accepts valid task mutation payloads', () => {
    expect(
      validateTaskMutationValues({
        title: 'Implement mutation dialog',
        description: 'Optional details',
        columnId: 'todo',
      }),
    ).toBeNull()
  })
})
