import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  LinearWorkflowClient,
  LinearWorkflowClientError,
  extractPrMetadataFromAttachments,
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

  test('returns NOT_FOUND when project cannot be resolved', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: null,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              projects: {
                nodes: [],
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'missing-project' })).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    )
  })

  test('resolves project by slug when id lookup misses', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: null,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              projects: {
                nodes: [{ id: 'project-from-slug' }],
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
                nodes: [],
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null,
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const snapshot = await client.fetchActiveMilestoneSnapshot({ projectRef: 'desktop-project' })
    expect(snapshot.source.projectId).toBe('project-from-slug')
  })

  test('paginates issues and child tasks before normalization', async () => {
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
                    title: '[S01] Paged slice',
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
                          title: 'Task page 1',
                          state: { name: 'Todo', type: 'unstarted' },
                        },
                      ],
                      pageInfo: {
                        hasNextPage: true,
                        endCursor: 'child-cursor-1',
                      },
                    },
                  },
                ],
                pageInfo: {
                  hasNextPage: true,
                  endCursor: 'issues-cursor-1',
                },
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
                    id: 'slice-b',
                    identifier: 'KAT-102',
                    title: '[S02] Paged slice 2',
                    parent: null,
                    state: { name: 'Todo', type: 'unstarted' },
                    projectMilestone: {
                      id: 'milestone-active',
                      name: '[M003] Workflow Kanban',
                      sortOrder: 1,
                    },
                    children: {
                      nodes: [],
                      pageInfo: {
                        hasNextPage: false,
                        endCursor: null,
                      },
                    },
                  },
                ],
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null,
                },
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
              issue: {
                children: {
                  nodes: [
                    {
                      id: 'task-a2',
                      identifier: 'KAT-103',
                      title: 'Task page 2',
                      state: { name: 'Done', type: 'completed' },
                    },
                  ],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const snapshot = await client.fetchActiveMilestoneSnapshot({ projectRef: 'project-1' })
    const inProgressColumn = snapshot.columns.find((column) => column.id === 'in_progress')
    expect(inProgressColumn?.cards[0]?.tasks).toHaveLength(2)
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4)
  })

  test('maps unauthorized and rate-limited backend responses', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'project-ref' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

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
      .mockResolvedValueOnce(new Response('{}', { status: 429 })) as unknown as typeof fetch

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'project-ref' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
  })

  test('maps GraphQL error payloads to structured codes', async () => {
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
            errors: [{ message: 'rate limit hit' }],
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'project-ref' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
  })

  test('maps non-classified GraphQL payload errors to GRAPHQL', async () => {
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
            errors: [{ message: 'workflow exploded' }],
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'project-ref' })).rejects.toMatchObject({
      code: 'GRAPHQL',
      message: 'workflow exploded',
    })
  })

  test('moves an issue to a canonical column through team workflow-state mapping', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'issue-1',
                identifier: 'KAT-100',
                title: 'Slice title',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              team: {
                states: {
                  nodes: [
                    { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                    { id: 'state-progress', name: 'In Progress', type: 'started' },
                  ],
                },
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
              issueUpdate: {
                success: true,
                issue: {
                  id: 'issue-1',
                  identifier: 'KAT-100',
                  title: 'Slice title',
                  team: { id: 'team-1' },
                  project: { id: 'project-1' },
                  state: { id: 'state-progress', name: 'In Progress', type: 'started' },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const result = await client.moveIssueToColumn({
      issueId: 'issue-1',
      targetColumnId: 'in_progress',
    })

    expect(result).toMatchObject({
      id: 'issue-1',
      stateName: 'In Progress',
      stateType: 'started',
      teamId: 'team-1',
      projectId: 'project-1',
    })

    const mutationVariables = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? '{}')).variables
    expect(mutationVariables).toMatchObject({
      issueId: 'issue-1',
      input: {
        stateId: 'state-progress',
      },
    })
  })

  test('returns NOT_FOUND when no team state maps to the target column', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'issue-1',
                identifier: 'KAT-100',
                title: 'Slice title',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              team: {
                states: {
                  nodes: [{ id: 'state-progress', name: 'Doing', type: 'started' }],
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.moveIssueToColumn({
        issueId: 'issue-1',
        targetColumnId: 'agent_review',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  test('creates a child task using parent slice metadata and mapped initial column state', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'slice-1',
                identifier: 'KAT-100',
                title: 'Slice title',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              team: {
                states: {
                  nodes: [
                    { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                    { id: 'state-progress', name: 'In Progress', type: 'started' },
                  ],
                },
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
              issueCreate: {
                success: true,
                issue: {
                  id: 'task-1',
                  identifier: 'KAT-101',
                  title: 'New task',
                  team: { id: 'team-1' },
                  project: { id: 'project-1' },
                  parent: { id: 'slice-1' },
                  state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const result = await client.createChildTask({
      parentIssueId: 'slice-1',
      title: 'New task',
      description: 'Task details',
      initialColumnId: 'todo',
    })

    expect(result).toMatchObject({
      id: 'task-1',
      identifier: 'KAT-101',
      title: 'New task',
      stateName: 'Todo',
      stateType: 'unstarted',
    })

    const mutationVariables = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? '{}')).variables
    expect(mutationVariables).toMatchObject({
      input: {
        title: 'New task',
        description: 'Task details',
        parentId: 'slice-1',
        teamId: 'team-1',
        projectId: 'project-1',
        stateId: 'state-todo',
      },
    })
  })

  test('requires a task title for child task creation', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.createChildTask({
        parentIssueId: 'slice-1',
        title: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })
  })

  test('requires a parent issue id for child task creation', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.createChildTask({
        parentIssueId: '   ',
        title: 'Valid title',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })
  })

  test('validates issue id inputs for move/detail/update mutations', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.moveIssueToColumn({
        issueId: '   ',
        targetColumnId: 'todo',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })

    await expect(
      client.fetchIssueDetail({
        issueId: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })

    await expect(
      client.updateTask({
        issueId: '   ',
        title: 'Edited title',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })

    await expect(
      client.updateTask({
        issueId: 'task-1',
        title: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })
  })

  test('returns INVALID_CONFIG when move target issue is missing team metadata', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: {
              id: 'issue-1',
              identifier: 'KAT-100',
              title: 'Slice title',
              project: { id: 'project-1' },
              state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.moveIssueToColumn({
        issueId: 'issue-1',
        targetColumnId: 'in_progress',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    })
  })

  test('skips mutation when target column already matches current state id', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'issue-1',
                identifier: 'KAT-100',
                title: 'Slice title',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-progress', name: 'In Progress', type: 'started' },
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
              team: {
                states: {
                  nodes: [{ id: 'state-progress', name: 'In Progress', type: 'started' }],
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    globalThis.fetch = fetchMock
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const result = await client.moveIssueToColumn({
      issueId: 'issue-1',
      targetColumnId: 'in_progress',
    })

    expect(result.id).toBe('issue-1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('applies mutation-result fallbacks when optional issue fields are missing', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'issue-1',
                team: { id: 'team-1' },
                state: { id: 'state-todo' },
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
              team: {
                states: {
                  nodes: [{ id: 'state-todo', name: 'Todo', type: 'unstarted' }],
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const result = await client.moveIssueToColumn({
      issueId: 'issue-1',
      targetColumnId: 'todo',
    })

    expect(result).toMatchObject({
      id: 'issue-1',
      teamId: 'team-1',
      identifier: undefined,
      title: undefined,
      projectId: undefined,
      stateName: 'Unknown',
      stateType: 'unknown',
    })
  })

  test('uses current state fallback when target column already matches and no state mapping exists', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'issue-1',
                identifier: 'KAT-100',
                title: 'Slice title',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              team: {
                states: {
                  nodes: [{ id: 'state-progress', name: 'Doing', type: 'started' }],
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    globalThis.fetch = fetchMock
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const result = await client.moveIssueToColumn({
      issueId: 'issue-1',
      targetColumnId: 'todo',
    })

    expect(result.stateId).toBe('state-todo')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('maps graphql not-found payloads and non-ok responses to workflow errors', async () => {
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
            errors: [{ message: 'project not found in workspace' }],
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'project-ref' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

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
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 })) as unknown as typeof fetch

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: 'project-ref' })).rejects.toMatchObject({
      code: 'NETWORK',
      message: 'Linear API request failed with status 500',
    })
  })

  test('returns INVALID_CONFIG when parent slice metadata is incomplete', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: {
              id: 'slice-1',
              identifier: 'KAT-100',
              title: 'Slice title',
              project: { id: 'project-1' },
              state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.createChildTask({
        parentIssueId: 'slice-1',
        title: 'Task title',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    })

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: {
              id: 'slice-1',
              identifier: 'KAT-100',
              title: 'Slice title',
              team: { id: 'team-1' },
              state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(
      client.createChildTask({
        parentIssueId: 'slice-1',
        title: 'Task title',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    })
  })

  test('returns NOT_FOUND when task update target column cannot be mapped', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'task-1',
                identifier: 'KAT-101',
                title: 'Task title',
                description: 'Task description',
                parent: { id: 'slice-1' },
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              team: {
                states: {
                  nodes: [{ id: 'state-progress', name: 'Doing', type: 'started' }],
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.updateTask({
        issueId: 'task-1',
        title: 'Task title',
        targetColumnId: 'agent_review',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  test('fetches task detail for edit dialogs on demand', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: {
              id: 'task-1',
              identifier: 'KAT-101',
              title: 'Task title',
              description: 'Task description',
              parent: { id: 'slice-1' },
              team: { id: 'team-1' },
              project: { id: 'project-1' },
              state: { id: 'state-progress', name: 'In Progress', type: 'started' },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const detail = await client.fetchIssueDetail({ issueId: 'task-1' })

    expect(detail).toMatchObject({
      id: 'task-1',
      parentId: 'slice-1',
      title: 'Task title',
      description: 'Task description',
      columnId: 'in_progress',
    })
  })

  test('updates task title/description/state through the Linear update path', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'task-1',
                identifier: 'KAT-101',
                title: 'Task title',
                description: 'Task description',
                parent: { id: 'slice-1' },
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              team: {
                states: {
                  nodes: [
                    { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                    { id: 'state-progress', name: 'In Progress', type: 'started' },
                  ],
                },
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
              issueUpdate: {
                success: true,
                issue: {
                  id: 'task-1',
                  identifier: 'KAT-101',
                  title: 'Updated task',
                  description: 'Updated description',
                  parent: { id: 'slice-1' },
                  team: { id: 'team-1' },
                  project: { id: 'project-1' },
                  state: { id: 'state-progress', name: 'In Progress', type: 'started' },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const result = await client.updateTask({
      issueId: 'task-1',
      title: 'Updated task',
      description: 'Updated description',
      targetColumnId: 'in_progress',
    })

    expect(result).toMatchObject({
      id: 'task-1',
      title: 'Updated task',
      description: 'Updated description',
      columnId: 'in_progress',
    })

    const mutationVariables = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? '{}')).variables
    expect(mutationVariables).toMatchObject({
      issueId: 'task-1',
      input: {
        title: 'Updated task',
        description: 'Updated description',
        stateId: 'state-progress',
      },
    })
  })

  test('omits description from update payload when callers do not provide it', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'task-1',
                identifier: 'KAT-101',
                title: 'Task title',
                description: 'Existing description',
                parent: { id: 'slice-1' },
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              issueUpdate: {
                success: true,
                issue: {
                  id: 'task-1',
                  identifier: 'KAT-101',
                  title: 'Title-only update',
                  description: 'Existing description',
                  parent: { id: 'slice-1' },
                  team: { id: 'team-1' },
                  project: { id: 'project-1' },
                  state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const result = await client.updateTask({
      issueId: 'task-1',
      title: 'Title-only update',
    })

    expect(result).toMatchObject({
      id: 'task-1',
      title: 'Title-only update',
      description: 'Existing description',
      columnId: 'todo',
    })

    const mutationVariables = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}')).variables
    expect(mutationVariables).toMatchObject({
      issueId: 'task-1',
      input: {
        title: 'Title-only update',
      },
    })
    expect(mutationVariables.input).not.toHaveProperty('description')
  })

  test('requires a project reference for both active-milestone and project snapshots', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchActiveMilestoneSnapshot({ projectRef: '   ' })).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    })

    await expect(client.fetchProjectSnapshot({ projectRef: '   ' })).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    })
  })

  test('returns NOT_FOUND when project snapshot cannot resolve the project id or slug', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: null,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              projects: {
                nodes: [],
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchProjectSnapshot({ projectRef: 'missing-project' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  test('returns NOT_FOUND for move and detail flows when target issue does not exist', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: null,
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(
      client.moveIssueToColumn({
        issueId: 'missing-issue',
        targetColumnId: 'todo',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: null,
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(client.fetchIssueDetail({ issueId: 'missing-issue' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  test('defaults child-task initial column to todo and strips blank descriptions', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'slice-1',
                identifier: 'KAT-100',
                title: 'Slice title',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              team: {
                states: {
                  nodes: [{ id: 'state-todo', name: 'Todo', type: 'unstarted' }],
                },
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
              issueCreate: {
                success: true,
                issue: {
                  id: 'task-1',
                  identifier: 'KAT-101',
                  title: 'Created task',
                  team: { id: 'team-1' },
                  project: { id: 'project-1' },
                  parent: { id: 'slice-1' },
                  state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    await client.createChildTask({
      parentIssueId: 'slice-1',
      title: 'Created task',
      description: '   ',
    })

    const mutationVariables = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? '{}')).variables
    expect(mutationVariables.input.stateId).toBe('state-todo')
    expect(mutationVariables.input).not.toHaveProperty('description')
  })

  test('returns NOT_FOUND when child-task parent is missing or no initial state maps to target column', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: null,
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(
      client.createChildTask({
        parentIssueId: 'missing-parent',
        title: 'Task title',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'slice-1',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
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
              team: {
                states: {
                  nodes: [],
                },
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    await expect(
      client.createChildTask({
        parentIssueId: 'slice-1',
        title: 'Task title',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  test('returns UNKNOWN when child-task creation mutation does not return a created issue', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'slice-1',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
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
              team: {
                states: {
                  nodes: [{ id: 'state-todo', name: 'Todo', type: 'unstarted' }],
                },
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
              issueCreate: {
                success: false,
                issue: null,
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.createChildTask({
        parentIssueId: 'slice-1',
        title: 'Task title',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })
  })

  test('returns NOT_FOUND/INVALID_CONFIG for updateTask preconditions and UNKNOWN for failed mutation', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'
    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: null,
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(
      client.updateTask({
        issueId: 'missing-task',
        title: 'Updated task',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            issue: {
              id: 'task-1',
              title: 'Task title',
              project: { id: 'project-1' },
              state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(
      client.updateTask({
        issueId: 'task-1',
        title: 'Updated task',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    })

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              issue: {
                id: 'task-1',
                title: 'Task title',
                team: { id: 'team-1' },
                project: { id: 'project-1' },
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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
              issueUpdate: {
                success: false,
                issue: null,
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    await expect(
      client.updateTask({
        issueId: 'task-1',
        title: 'Updated task',
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
    })
  })

  test('uses trimmed auth-bridge Linear API key when env key is missing', async () => {
    const fetchMock = vi
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
                nodes: [],
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null,
                },
              },
            },
          }),
          { status: 200 },
        ),
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = new LinearWorkflowClient({ getApiKey: vi.fn(async () => ' linear-auth-key ') } as never)
    await client.fetchActiveMilestoneSnapshot({ projectRef: 'project-1' })

    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = (firstRequest?.headers ?? {}) as Record<string, string>
    expect(headers.authorization).toBe('linear-auth-key')
  })

  test('exposes structured workflow error codes', () => {
    const mapped = LinearWorkflowClient.toWorkflowError(
      new LinearWorkflowClientError('UNAUTHORIZED', 'bad key', 401),
    )

    expect(mapped).toEqual({
      code: 'UNAUTHORIZED',
      message: 'bad key',
    })

    const networkMapped = LinearWorkflowClient.toWorkflowError(new TypeError('fetch failed'))
    expect(networkMapped).toEqual({
      code: 'NETWORK',
      message: 'fetch failed',
    })

    const timeoutMapped = LinearWorkflowClient.toWorkflowError(new DOMException('Aborted', 'AbortError'))
    expect(timeoutMapped).toEqual({
      code: 'NETWORK',
      message: 'Linear API request timed out',
    })

    const errorMapped = LinearWorkflowClient.toWorkflowError(new Error('unexpected failure'))
    expect(errorMapped).toEqual({
      code: 'UNKNOWN',
      message: 'unexpected failure',
    })

    const unknownMapped = LinearWorkflowClient.toWorkflowError(42 as unknown)
    expect(unknownMapped).toEqual({
      code: 'UNKNOWN',
      message: '42',
    })
  })
})

describe('mapLinearStateToColumnId', () => {
  test('uses exact Kata state names before state type fallback', () => {
    expect(mapLinearStateToColumnId('Human Review', 'started')).toBe('human_review')
    expect(mapLinearStateToColumnId('Merging', 'started')).toBe('merging')
    expect(mapLinearStateToColumnId('Unknown', 'backlog')).toBe('backlog')
    expect(mapLinearStateToColumnId(undefined, 'unstarted')).toBe('todo')
    expect(mapLinearStateToColumnId(undefined, 'started')).toBe('in_progress')
    expect(mapLinearStateToColumnId(undefined, 'completed')).toBe('done')
    expect(mapLinearStateToColumnId(undefined, 'canceled')).toBe('done')
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

  test('normalizes task counts with mixed states', () => {
    const snapshot = normalizeLinearBoard({
      projectId: 'project-1',
      milestoneId: 'milestone-1',
      milestoneName: 'Milestone 1',
      issues: [
        {
          id: 'slice-1',
          identifier: 'KAT-1',
          title: 'Slice',
          state: { name: 'Todo', type: 'unstarted' },
          projectMilestone: { id: 'milestone-1', name: 'Milestone 1' },
          children: {
            nodes: [
              { id: 'task-1', title: 'Task 1', state: { name: 'Done', type: 'completed' } },
              { id: 'task-2', title: 'Task 2', state: { name: 'Todo', type: 'unstarted' } },
            ],
          },
        } as never,
      ],
    })

    const todoColumn = snapshot.columns.find((column) => column.id === 'todo')
    expect(todoColumn?.cards[0]?.taskCounts).toEqual({ total: 2, done: 1 })
  })

  test('populates prMetadata on slices and tasks from attachments', () => {
    const snapshot = normalizeLinearBoard({
      projectId: 'project-1',
      milestoneId: 'milestone-1',
      milestoneName: 'Milestone 1',
      issues: [
        {
          id: 'slice-1',
          identifier: 'KAT-1',
          title: 'Slice with PR',
          branchName: 'feat/my-branch',
          state: { name: 'In Progress', type: 'started' },
          projectMilestone: { id: 'milestone-1', name: 'Milestone 1' },
          attachments: {
            nodes: [
              {
                id: 'att-1',
                url: 'https://github.com/kata-sh/kata/pull/42',
                metadata: JSON.stringify({ title: 'Fix bug', status: 'open' }),
                sourceType: 'github',
              },
            ],
          },
          children: {
            nodes: [
              {
                id: 'task-1',
                title: 'Task with PR',
                branchName: 'feat/task-branch',
                state: { name: 'Todo', type: 'unstarted' },
                attachments: {
                  nodes: [
                    {
                      id: 'att-2',
                      url: 'https://github.com/kata-sh/kata/pull/43',
                      metadata: '{}',
                      sourceType: 'github',
                    },
                  ],
                },
              },
              {
                id: 'task-2',
                title: 'Task without PR',
                state: { name: 'Todo', type: 'unstarted' },
              },
            ],
          },
        } as never,
      ],
    })

    const inProgressColumn = snapshot.columns.find((col) => col.id === 'in_progress')
    const card = inProgressColumn?.cards[0]
    expect(card?.prMetadata).toEqual({
      number: 42,
      url: 'https://github.com/kata-sh/kata/pull/42',
      title: 'Fix bug',
      status: 'open',
      branchName: 'feat/my-branch',
    })

    const taskWithPr = card?.tasks.find((t) => t.id === 'task-1')
    expect(taskWithPr?.prMetadata).toEqual({
      number: 43,
      url: 'https://github.com/kata-sh/kata/pull/43',
      branchName: 'feat/task-branch',
    })

    const taskWithoutPr = card?.tasks.find((t) => t.id === 'task-2')
    expect(taskWithoutPr?.prMetadata).toBeUndefined()
  })
})

describe('extractPrMetadataFromAttachments', () => {
  test('returns undefined when no attachments exist', () => {
    expect(extractPrMetadataFromAttachments(undefined, undefined)).toBeUndefined()
    expect(extractPrMetadataFromAttachments([], undefined)).toBeUndefined()
  })

  test('extracts PR metadata from a GitHub PR URL attachment', () => {
    const result = extractPrMetadataFromAttachments(
      [
        {
          id: 'att-1',
          url: 'https://github.com/kata-sh/kata/pull/42',
          metadata: JSON.stringify({ title: 'My PR', status: 'open' }),
        },
      ],
      'feat/branch',
    )

    expect(result).toEqual({
      number: 42,
      url: 'https://github.com/kata-sh/kata/pull/42',
      title: 'My PR',
      status: 'open',
      branchName: 'feat/branch',
    })
  })

  test('parses metadata as JSON object when it is already an object', () => {
    const result = extractPrMetadataFromAttachments(
      [
        {
          id: 'att-1',
          url: 'https://github.com/org/repo/pull/99',
          metadata: { title: 'Object PR', state: 'merged' } as unknown as string,
        },
      ],
      undefined,
    )

    expect(result).toEqual({
      number: 99,
      url: 'https://github.com/org/repo/pull/99',
      title: 'Object PR',
      status: 'merged',
    })
  })

  test('skips non-PR URL attachments', () => {
    const result = extractPrMetadataFromAttachments(
      [
        {
          id: 'att-1',
          url: 'https://github.com/kata-sh/kata/issues/42',
        },
      ],
      undefined,
    )

    expect(result).toBeUndefined()
  })

  test('skips attachments with empty or missing URL', () => {
    const result = extractPrMetadataFromAttachments(
      [{ id: 'att-1', url: '' }, { id: 'att-2' }],
      undefined,
    )

    expect(result).toBeUndefined()
  })

  test('handles invalid JSON metadata gracefully', () => {
    const result = extractPrMetadataFromAttachments(
      [
        {
          id: 'att-1',
          url: 'https://github.com/org/repo/pull/5',
          metadata: 'not-json',
        },
      ],
      undefined,
    )

    expect(result).toEqual({
      number: 5,
      url: 'https://github.com/org/repo/pull/5',
    })
  })
})
