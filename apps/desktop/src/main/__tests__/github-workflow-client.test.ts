import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GithubWorkflowClient } from '../github-workflow-client'

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
      identifier: '#2249',
      stateName: 'In Progress',
    })
    expect(snapshot.columns.find((column) => column.id === 'todo')?.cards).toHaveLength(0)
  })

  test('normalizes projects v2 status into canonical board columns', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              user: {
                projectV2: {
                  id: 'PVT_kwDOG7',
                  field: { id: 'PVTSSF_kwDOG7_status' },
                },
              },
              organization: null,
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
    expect(snapshot.columns.find((column) => column.id === 'agent_review')?.cards[0]).toMatchObject({
      identifier: '#2249',
      stateName: 'Agent Review',
    })
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
})
