import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GithubWorkflowClient, extractPrMetadataFromGithubIssue } from '../github-workflow-client'

const originalFetch = globalThis.fetch
const originalGhToken = process.env.GH_TOKEN
const originalGithubToken = process.env.GITHUB_TOKEN

describe('GithubWorkflowClient', () => {
  beforeEach(() => {
    delete process.env.GH_TOKEN
    delete process.env.GITHUB_TOKEN
  })

  afterEach(() => {
    globalThis.fetch = originalFetch

    if (originalGhToken) {
      process.env.GH_TOKEN = originalGhToken
    } else {
      delete process.env.GH_TOKEN
    }

    if (originalGithubToken) {
      process.env.GITHUB_TOKEN = originalGithubToken
    } else {
      delete process.env.GITHUB_TOKEN
    }
  })

  test('normalizes label mode issues into canonical board columns', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1001,
            number: 2249,
            title: '[S02] GitHub Workflow Board Parity',
            html_url: 'https://github.com/kata-sh/kata/issues/2249',
            labels: [{ name: 'symphony:in-progress' }],
          },
          {
            id: 1002,
            number: 2250,
            title: '[S03] Workflow Context Switching',
            labels: [{ name: 'bug' }],
          },
          {
            id: 1003,
            number: 2251,
            title: 'PR item',
            pull_request: { url: 'https://api.github.com/repos/kata-sh/kata/pulls/2251' },
            labels: [{ name: 'symphony:todo' }],
          },
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const snapshot = await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'labels',
        labelPrefix: 'symphony',
      },
    })

    expect(snapshot.backend).toBe('github')
    expect(snapshot.source.githubStateMode).toBe('labels')
    expect(snapshot.columns.find((column) => column.id === 'in_progress')?.cards[0]).toMatchObject({
      id: '2249',
      identifier: '#2249',
      stateName: 'In Progress',
    })
    expect(snapshot.columns.find((column) => column.id === 'todo')?.cards).toHaveLength(0)
  })

  test('accepts labelPrefix with trailing colon', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1001,
            number: 2249,
            title: '[S02] GitHub Workflow Board Parity',
            html_url: 'https://github.com/kata-sh/kata/issues/2249',
            labels: [{ name: 'symphony:in-progress' }],
          },
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const snapshot = await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'labels',
        labelPrefix: 'symphony:',
      },
    })

    expect(snapshot.columns.find((column) => column.id === 'in_progress')?.cards).toHaveLength(1)
    expect(snapshot.columns.find((column) => column.id === 'in_progress')?.cards[0]?.stateName).toBe('In Progress')
  })

  test('normalizes projects v2 status into canonical board columns', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              repository: {
                owner: {
                  __typename: 'User',
                  login: 'kata-sh',
                  projectV2: {
                    id: 'PVT_kwDOG7',
                    field: { id: 'PVTSSF_kwDOG7_status' },
                  },
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
              node: {
                items: {
                  nodes: [
                    {
                      id: 'PVTI_1',
                      content: {
                        id: 'I_kwDOA',
                        number: 2249,
                        title: '[S02] GitHub Workflow Board Parity',
                        url: 'https://github.com/kata-sh/kata/issues/2249',
                      },
                      fieldValueByName: {
                        name: 'Agent Review',
                        optionId: 'opt_1',
                      },
                    },
                    {
                      id: 'PVTI_2',
                      content: {
                        id: 'I_kwDOB',
                        number: 2250,
                        title: '[T01] Subtask on board',
                        url: 'https://github.com/kata-sh/kata/issues/2250',
                        labels: {
                          nodes: [{ name: 'kata:task' }],
                        },
                        parent: {
                          number: 2249,
                        },
                      },
                      fieldValueByName: {
                        name: 'Done',
                        optionId: 'opt_done',
                      },
                    },
                    {
                      id: 'PVTI_3',
                      content: {
                        id: 'I_kwDOC',
                        number: 2249,
                        title: '[S99] Foreign Repo Item',
                        url: 'https://github.com/other-org/other-repo/issues/2249',
                      },
                      fieldValueByName: {
                        name: 'Agent Review',
                        optionId: 'opt_1',
                      },
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 340,
              title: '[M001] Desktop Slash Autocomplete Parity',
              labels: [{ name: 'kata:milestone' }],
            },
          ]),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    const snapshot = await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'projects_v2',
        githubProjectNumber: 7,
      },
    })

    expect(snapshot.backend).toBe('github')
    expect(snapshot.source.githubStateMode).toBe('projects_v2')
    expect(snapshot.activeMilestone?.name).toBe('GitHub Project #7')
    const agentReviewCards = snapshot.columns.find((column) => column.id === 'agent_review')?.cards ?? []
    expect(agentReviewCards).toHaveLength(1)
    expect(agentReviewCards[0]).toMatchObject({
      id: '2249',
      identifier: '#2249',
      stateName: 'Agent Review',
      milestoneName: '[M001] Desktop Slash Autocomplete Parity',
      taskCounts: {
        total: 1,
        done: 1,
      },
    })
    expect(agentReviewCards[0]?.tasks).toEqual([
      expect.objectContaining({
        id: '2250',
        identifier: '#2250',
        title: '[T01] Subtask on board',
        columnId: 'done',
        parentSliceId: '2249',
        stateType: 'projects_v2',
      }),
    ])
  })

  test('projects_v2 owner resolution uses repository owner union (no org-only lookup)', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              repository: {
                owner: {
                  __typename: 'User',
                  login: 'gannonh',
                  projectV2: {
                    id: 'PVT_user_17',
                    field: { id: 'PVTSSF_status' },
                  },
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
              node: {
                items: {
                  nodes: [],
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
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch

    globalThis.fetch = fetchMock

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'gannonh',
        repoName: 'kata',
        stateMode: 'projects_v2',
        githubProjectNumber: 17,
      },
    })

    const firstCallInit = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
    const body = String(firstCallInit?.body ?? '')

    expect(body).toContain('repository(owner: $owner, name: $repo)')
    expect(body).not.toContain('organization(login: $owner)')
    expect(body).not.toContain('user(login: $owner)')
  })

  test('paginates label mode issue requests and returns empty state when no mapped labels are present', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            Array.from({ length: 100 }, (_value, index) => ({
              id: 2000 + index,
              number: 3000 + index,
              title: `Issue ${index}`,
              labels: [{ name: 'bug' }],
            })),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const snapshot = await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'labels',
      },
    })

    expect(snapshot.status).toBe('empty')
    expect(snapshot.emptyReason).toContain('symphony:')
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  test('treats empty REST response body as empty issue list', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 })) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const snapshot = await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'labels',
      },
    })

    expect(snapshot.status).toBe('empty')
  })

  test('uses authBridge token fallback when GH_TOKEN is absent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => 'bridge_token') } as never)
    await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'labels',
      },
    })

    const request = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(request?.[1]?.headers?.authorization).toBe('Bearer bridge_token')
  })

  test('maps GitHub HTTP and GraphQL failures to structured errors', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 })) as unknown as typeof fetch
    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    await expect(
      client.fetchSnapshot({
        config: {
          kind: 'github',
          repoOwner: 'kata-sh',
          repoName: 'kata',
          stateMode: 'labels',
        },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 404 })) as unknown as typeof fetch
    await expect(
      client.fetchSnapshot({
        config: {
          kind: 'github',
          repoOwner: 'kata-sh',
          repoName: 'kata',
          stateMode: 'labels',
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              repository: {
                owner: {
                  __typename: 'User',
                  login: 'kata-sh',
                  projectV2: { id: 'p1', field: { id: 'f1' } },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'bad graphql' }] }), { status: 200 })) as unknown as typeof fetch

    await expect(
      client.fetchSnapshot({
        config: {
          kind: 'github',
          repoOwner: 'kata-sh',
          repoName: 'kata',
          stateMode: 'projects_v2',
          githubProjectNumber: 7,
        },
      }),
    ).rejects.toMatchObject({ code: 'GRAPHQL' })
  })

  test('maps invalid projects v2 config and missing project to explicit errors', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.fetchSnapshot({
        config: {
          kind: 'github',
          repoOwner: 'kata-sh',
          repoName: 'kata',
          stateMode: 'projects_v2',
        } as any,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            repository: {
              owner: {
                __typename: 'User',
                login: 'kata-sh',
                projectV2: null,
              },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(
      client.fetchSnapshot({
        config: {
          kind: 'github',
          repoOwner: 'kata-sh',
          repoName: 'kata',
          stateMode: 'projects_v2',
          githubProjectNumber: 7,
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('maps missing token to MISSING_API_KEY', async () => {
    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.fetchSnapshot({
        config: {
          kind: 'github',
          repoOwner: 'kata-sh',
          repoName: 'kata',
          stateMode: 'labels',
        },
      }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })

  test('maps unknown errors through toWorkflowError helper', () => {
    expect(GithubWorkflowClient.toWorkflowError(new TypeError('network fail'))).toEqual({
      code: 'NETWORK',
      message: 'network fail',
    })

    expect(GithubWorkflowClient.toWorkflowError(new Error('boom'))).toEqual({
      code: 'UNKNOWN',
      message: 'boom',
    })
  })

  test('populates prMetadata on label-mode cards from issue body PR references', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1001,
            number: 10,
            title: 'Issue with PR link',
            body: 'Related PR: https://github.com/kata-sh/kata/pull/42',
            html_url: 'https://github.com/kata-sh/kata/issues/10',
            labels: [{ name: 'symphony:in-progress' }],
          },
          {
            id: 1002,
            number: 11,
            title: 'Issue without PR link',
            body: 'No PR reference here',
            html_url: 'https://github.com/kata-sh/kata/issues/11',
            labels: [{ name: 'symphony:todo' }],
          },
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const snapshot = await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'labels',
        labelPrefix: 'symphony',
      },
    })

    const inProgressCard = snapshot.columns.find((c) => c.id === 'in_progress')?.cards[0]
    expect(inProgressCard?.prMetadata).toEqual({
      number: 42,
      url: 'https://github.com/kata-sh/kata/pull/42',
    })

    const todoCard = snapshot.columns.find((c) => c.id === 'todo')?.cards[0]
    expect(todoCard?.prMetadata).toBeUndefined()
  })

  test('filters out PR-type issues while still extracting PR references from regular issues', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1001,
            number: 10,
            title: 'Regular issue',
            body: 'See https://github.com/kata-sh/kata/pull/42',
            html_url: 'https://github.com/kata-sh/kata/issues/10',
            labels: [{ name: 'symphony:todo' }],
          },
          {
            id: 1002,
            number: 42,
            title: 'This is a PR',
            pull_request: { url: 'https://api.github.com/repos/kata-sh/kata/pulls/42' },
            labels: [{ name: 'symphony:in-progress' }],
          },
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => null) } as never)
    const snapshot = await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'labels',
        labelPrefix: 'symphony',
      },
    })

    // PR-type issue should be filtered out
    const allCards = snapshot.columns.flatMap((c) => c.cards)
    expect(allCards).toHaveLength(1)
    expect(allCards[0]?.identifier).toBe('#10')
    expect(allCards[0]?.prMetadata?.number).toBe(42)
  })
})

describe('extractPrMetadataFromGithubIssue', () => {
  test('returns undefined for empty or missing body', () => {
    expect(extractPrMetadataFromGithubIssue(undefined, 'owner', 'repo')).toBeUndefined()
    expect(extractPrMetadataFromGithubIssue('', 'owner', 'repo')).toBeUndefined()
  })

  test('extracts PR metadata from a full GitHub PR URL in body', () => {
    const result = extractPrMetadataFromGithubIssue(
      'Related: https://github.com/kata-sh/kata/pull/99',
      'kata-sh',
      'kata',
    )

    expect(result).toEqual({
      number: 99,
      url: 'https://github.com/kata-sh/kata/pull/99',
    })
  })

  test('extracts first PR URL when multiple are present', () => {
    const result = extractPrMetadataFromGithubIssue(
      'See https://github.com/org/repo/pull/10 and https://github.com/org/repo/pull/20',
      'org',
      'repo',
    )

    expect(result).toEqual({
      number: 10,
      url: 'https://github.com/org/repo/pull/10',
    })
  })

  test('returns undefined when body has no PR references', () => {
    const result = extractPrMetadataFromGithubIssue(
      'This is a regular issue body with no PR links',
      'owner',
      'repo',
    )

    expect(result).toBeUndefined()
  })

  test('returns undefined for standalone #N without a PR hint (issue reference)', () => {
    // #123 in a plain body could be an issue, not a PR — guard prevents false positives
    const result = extractPrMetadataFromGithubIssue(
      'Closes #123 and fixes #456',
      'owner',
      'repo',
    )

    expect(result).toBeUndefined()
  })

  test('extracts PR metadata from shorthand #N when body contains a PR hint', () => {
    const result = extractPrMetadataFromGithubIssue(
      'Linked PR #42 closes this issue',
      'owner',
      'repo',
    )

    expect(result).toEqual({
      number: 42,
      url: 'https://github.com/owner/repo/pull/42',
    })
  })

  test('extracts PR metadata from shorthand #N when body says "pull request"', () => {
    const result = extractPrMetadataFromGithubIssue(
      'Fixed by pull request #99',
      'owner',
      'repo',
    )

    expect(result).toEqual({
      number: 99,
      url: 'https://github.com/owner/repo/pull/99',
    })
  })
})
