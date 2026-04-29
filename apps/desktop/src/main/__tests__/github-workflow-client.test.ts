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
                        body: '<!-- KATA:GITHUB_ARTIFACT {"schema":"kata/github-artifact/v1","kind":"slice","kataId":"S02","milestoneId":"M001"} -->\n\nPR: https://github.com/kata-sh/kata/pull/77',
                        url: 'https://github.com/kata-sh/kata/issues/2249',
                        subIssues: {
                          nodes: [
                            {
                              number: 2250,
                              title: '[T01] Subtask on board',
                              url: 'https://github.com/kata-sh/kata/issues/2250',
                              state: 'CLOSED',
                            },
                            {
                              number: 991,
                              title: '[T99] Foreign sub-issue',
                              url: 'https://github.com/other-org/other-repo/issues/991',
                              state: 'OPEN',
                            },
                            {
                              number: 992,
                              title: '[T98] Missing URL sub-issue',
                              state: 'OPEN',
                            },
                          ],
                        },
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
    expect(snapshot.source.activeMilestoneId).toBe('M001')
    expect(snapshot.activeMilestone?.name).toBe('GitHub Project #7')
    const agentReviewCards = snapshot.columns.find((column) => column.id === 'agent_review')?.cards ?? []
    expect(agentReviewCards).toHaveLength(1)
    expect(agentReviewCards[0]).toMatchObject({
      id: '2249',
      identifier: '#2249',
      stateName: 'Agent Review',
      milestoneId: 'M001',
      milestoneName: '[M001] Desktop Slash Autocomplete Parity',
      taskCounts: {
        total: 1,
        done: 1,
      },
      prMetadata: {
        number: 77,
        url: 'https://github.com/kata-sh/kata/pull/77',
      },
    })
    expect(agentReviewCards[0]?.tasks).toEqual([
      expect.objectContaining({
        id: '2250',
        identifier: '#2250',
        title: '[T01] Subtask on board',
        columnId: 'done',
        parentSliceId: '2249',
        stateType: 'issue_state',
      }),
    ])
  })

  test('projects v2 snapshot prefers the earliest open kata milestone to match CLI active-milestone selection', async () => {
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 402,
              title: '[M002] Newer open milestone',
              labels: [{ name: 'kata:milestone' }],
            },
            {
              number: 401,
              title: '[M001] Earlier open milestone',
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

    expect(snapshot.source.activeMilestoneId).toBe('M001')
  })

  test('projects_v2 never renders orphan task items without a parent relationship', async () => {
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
                      id: 'PVTI_slice',
                      content: {
                        id: 'I_kwDOA',
                        number: 2249,
                        title: '[S02] GitHub Workflow Board Parity',
                        url: 'https://github.com/kata-sh/kata/issues/2249',
                        subIssues: { nodes: [] },
                      },
                      fieldValueByName: {
                        name: 'Backlog',
                        optionId: 'opt_backlog',
                      },
                    },
                    {
                      id: 'PVTI_task_orphan',
                      content: {
                        id: 'I_kwDOT',
                        number: 2255,
                        title: '[T99] Orphan task item',
                        url: 'https://github.com/kata-sh/kata/issues/2255',
                        labels: {
                          nodes: [{ name: 'kata:task' }],
                        },
                      },
                      fieldValueByName: {
                        name: 'Done',
                        optionId: 'opt_done',
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
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch

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

    const allCards = snapshot.columns.flatMap((column) => column.cards)
    expect(allCards).toHaveLength(1)
    expect(allCards[0]?.id).toBe('2249')
    expect(allCards[0]?.tasks).toEqual([])
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

  test('uses authBridge token fallback when GH_TOKEN is absent', async () => {
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              node: {
                items: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch

    const client = new GithubWorkflowClient({ getApiKey: vi.fn(async () => 'bridge_token') } as never)
    await client.fetchSnapshot({
      config: {
        kind: 'github',
        repoOwner: 'kata-sh',
        repoName: 'kata',
        stateMode: 'projects_v2',
        githubProjectNumber: 7,
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
          stateMode: 'projects_v2',
          githubProjectNumber: 7,
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
          stateMode: 'projects_v2',
          githubProjectNumber: 7,
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
          stateMode: 'projects_v2',
          githubProjectNumber: 7,
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
