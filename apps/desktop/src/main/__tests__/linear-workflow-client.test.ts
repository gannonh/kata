import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  LinearWorkflowClient,
  LinearWorkflowClientError,
  mapLinearStateToColumnId,
  normalizeLinearBoard,
} from '../linear-workflow-client'

const originalFetch = globalThis.fetch
const originalLinearApiKey = process.env.LINEAR_API_KEY

describe('LinearWorkflowClient', () => {
  beforeEach(() => {
    delete process.env.LINEAR_API_KEY
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalLinearApiKey) {
      process.env.LINEAR_API_KEY = originalLinearApiKey
    } else {
      delete process.env.LINEAR_API_KEY
    }
  })

  test('normalizes active milestone slices and tasks into canonical columns', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: {
                id: 'project-1',
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    id: 'slice-a',
                    identifier: 'KAT-100',
                    title: '[S01] Active milestone slice',
                    parent: null,
                    state: { name: 'In Progress', type: 'started' },
                    projectMilestone: {
                      id: 'milestone-active',
                      name: '[M003] Workflow Kanban',
                      sortOrder: 1,
                    },
                    children: {
                      nodes: [
                        {
                          id: 'task-a1',
                          identifier: 'KAT-101',
                          title: 'Task in review',
                          state: { name: 'Agent Review', type: 'started' },
                        },
                      ],
                    },
                  },
                  {
                    id: 'slice-b',
                    identifier: 'KAT-200',
                    title: '[S02] Older milestone slice',
                    parent: null,
                    state: { name: 'Todo', type: 'unstarted' },
                    projectMilestone: {
                      id: 'milestone-old',
                      name: '[M002] Planning View',
                      sortOrder: 0,
                    },
                    children: {
                      nodes: [],
                    },
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const snapshot = await client.fetchActiveMilestoneSnapshot({ projectRef: 'desktop-project' })

    expect(snapshot.activeMilestone).toEqual({
      id: 'milestone-active',
      name: '[M003] Workflow Kanban',
    })

    const inProgressColumn = snapshot.columns.find((column) => column.id === 'in_progress')
    expect(inProgressColumn?.cards).toHaveLength(1)
    expect(inProgressColumn?.cards[0]?.identifier).toBe('KAT-100')

    const todoCards = snapshot.columns.find((column) => column.id === 'todo')?.cards ?? []
    expect(todoCards).toHaveLength(0)

    expect(inProgressColumn?.cards[0]?.tasks[0]).toMatchObject({
      id: 'task-a1',
      identifier: 'KAT-101',
      columnId: 'agent_review',
    })
  })

  test('maps missing key to MISSING_API_KEY', async () => {
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'desktop-project' })).rejects.toMatchObject(
      {
        code: 'MISSING_API_KEY',
      },
    )
  })

  test('exposes structured workflow error codes', () => {
    const mapped = LinearWorkflowClient.toWorkflowError(
      new LinearWorkflowClientError('UNAUTHORIZED', 'bad key', 401),
    )

    expect(mapped).toEqual({
      code: 'UNAUTHORIZED',
      message: 'bad key',
    })
  })
})

describe('mapLinearStateToColumnId', () => {
  test('uses exact Kata state names before state type fallback', () => {
    expect(mapLinearStateToColumnId('Human Review', 'started')).toBe('human_review')
    expect(mapLinearStateToColumnId('Unknown', 'backlog')).toBe('backlog')
    expect(mapLinearStateToColumnId(undefined, 'completed')).toBe('done')
    expect(mapLinearStateToColumnId('Unexpected', 'unexpected')).toBe('todo')
  })
})

describe('normalizeLinearBoard', () => {
  test('returns empty snapshot when no active milestone slices exist', () => {
    const snapshot = normalizeLinearBoard({
      projectId: 'project-1',
      issues: [],
      milestoneId: undefined,
      milestoneName: undefined,
    })

    expect(snapshot.status).toBe('empty')
    expect(snapshot.emptyReason).toContain('No slices found')
  })
})
