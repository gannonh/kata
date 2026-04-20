import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GithubPlanningClient } from '../github-planning-client'

const originalFetch = globalThis.fetch
const originalGhToken = process.env.GH_TOKEN
const originalGithubToken = process.env.GITHUB_TOKEN

describe('GithubPlanningClient', () => {
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

  test('lists planning artifacts from GitHub issues (kata:artifact + kata:milestone only)', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 338,
              title: 'KATA-DOC: REQUIREMENTS',
              body: 'Requirements body',
              updated_at: '2026-04-19T18:00:00.000Z',
              labels: [{ name: 'kata:artifact' }],
            },
            {
              number: 339,
              title: 'KATA-DOC: DECISIONS',
              body: 'Decisions body',
              updated_at: '2026-04-19T20:00:00.000Z',
              labels: [{ name: 'kata:artifact' }],
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 340,
              title: '[M001] Desktop Slash Autocomplete Parity',
              body: 'Milestone body',
              updated_at: '2026-04-19T19:00:00.000Z',
              labels: [{ name: 'kata:milestone' }],
            },
            {
              number: 2,
              title: 'PR wrapper',
              body: 'Should be filtered',
              updated_at: '2026-04-19T17:00:00.000Z',
              labels: [{ name: 'kata:milestone' }],
              pull_request: { url: 'https://api.github.com/repos/gannonh/kata/pulls/2' },
            },
          ]),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    globalThis.fetch = fetchMock

    const client = new GithubPlanningClient({ getApiKey: vi.fn(async () => null) } as never)
    const artifacts = await client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })

    expect(artifacts).toHaveLength(3)
    expect(artifacts[0]).toMatchObject({
      title: 'KATA-DOC: DECISIONS',
      issueId: '339',
      projectId: 'github:gannonh/kata',
      scope: 'issue',
    })
    expect(artifacts[1]).toMatchObject({
      title: '[M001] Desktop Slash Autocomplete Parity',
      issueId: '340',
      projectId: 'github:gannonh/kata',
      scope: 'issue',
    })
    expect(artifacts[2]).toMatchObject({
      title: 'KATA-DOC: REQUIREMENTS',
      issueId: '338',
      projectId: 'github:gannonh/kata',
      scope: 'issue',
    })

    const firstRequest = String((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])
    const secondRequest = String((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[1]?.[0])
    expect(firstRequest).toContain('labels=kata%3Aartifact')
    expect(secondRequest).toContain('labels=kata%3Amilestone')
  })

  test('fetches planning artifact by issue id when provided', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          number: 339,
          title: 'KATA-DOC: DECISIONS',
          body: 'Decisions body',
          updated_at: '2026-04-19T20:00:00.000Z',
          labels: [{ name: 'kata:artifact' }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    globalThis.fetch = fetchMock

    const client = new GithubPlanningClient({ getApiKey: vi.fn(async () => null) } as never)
    const artifact = await client.fetchByTitle({
      title: 'KATA-DOC: DECISIONS',
      issueId: '339',
      repoOwner: 'gannonh',
      repoName: 'kata',
    })

    expect(artifact).toMatchObject({
      title: 'KATA-DOC: DECISIONS',
      issueId: '339',
      projectId: 'github:gannonh/kata',
      scope: 'issue',
    })

    const requestPath = String((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])
    expect(requestPath).toContain('/repos/gannonh/kata/issues/339')
  })

  test('returns missing api key when token is unavailable', async () => {
    const client = new GithubPlanningClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(
      client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })
})
