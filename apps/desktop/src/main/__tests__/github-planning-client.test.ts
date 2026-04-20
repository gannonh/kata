import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GithubPlanningClient } from '../github-planning-client'

const originalFetch = globalThis.fetch
const originalGhToken = process.env.GH_TOKEN
const originalGithubToken = process.env.GITHUB_TOKEN

function createClient(getApiKey = vi.fn(async () => null)) {
  return new GithubPlanningClient({ getApiKey } as never)
}

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

    const client = createClient()
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

    const client = createClient()
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

  test('fetchByTitle accepts scoped hash issue ids', async () => {
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

    const client = createClient()
    const artifact = await client.fetchByTitle({
      title: 'KATA-DOC: DECISIONS',
      issueId: 'gannonh/kata#339',
      repoOwner: 'gannonh',
      repoName: 'kata',
    })

    expect(artifact?.issueId).toBe('339')
  })

  test('fetchByTitle falls back to title lookup and picks latest updated issue', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 338,
              title: 'KATA-DOC: REQUIREMENTS',
              body: 'Older body',
              updated_at: '2026-04-19T10:00:00.000Z',
              labels: [{ name: 'kata:artifact' }],
            },
            {
              number: 341,
              title: 'KATA-DOC: REQUIREMENTS',
              body: 'Newer body',
              updated_at: '2026-04-19T21:00:00.000Z',
              labels: [{ name: 'kata:artifact' }],
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch

    globalThis.fetch = fetchMock

    const client = createClient()
    const artifact = await client.fetchByTitle({
      title: 'KATA-DOC: REQUIREMENTS',
      repoOwner: 'gannonh',
      repoName: 'kata',
    })

    expect(artifact).toMatchObject({
      title: 'KATA-DOC: REQUIREMENTS',
      issueId: '341',
      content: 'Newer body',
    })
  })

  test('fetchByTitle returns null when no matching planning issue exists', async () => {
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
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch

    globalThis.fetch = fetchMock

    const client = createClient()
    const artifact = await client.fetchByTitle({
      title: 'KATA-DOC: DOES-NOT-EXIST',
      repoOwner: 'gannonh',
      repoName: 'kata',
    })

    expect(artifact).toBeNull()
  })

  test('fetchByTitle returns null for issue ids that are not planning artifacts', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          number: 777,
          title: '[S01] Slice issue',
          body: 'Slice body',
          updated_at: '2026-04-19T20:00:00.000Z',
          labels: [{ name: 'kata:slice' }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = createClient()
    const artifact = await client.fetchByTitle({
      title: '[S01] Slice issue',
      issueId: '777',
      repoOwner: 'gannonh',
      repoName: 'kata',
    })

    expect(artifact).toBeNull()
  })

  test('uses auth bridge token when env token is absent', async () => {
    const getApiKey = vi.fn(async () => 'ghp_from_auth')
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 })) as unknown as typeof fetch

    const client = createClient(getApiKey)
    const artifacts = await client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })

    expect(getApiKey).toHaveBeenCalledWith('github')
    expect(artifacts).toEqual([])
  })

  test('returns missing api key when token is unavailable', async () => {
    const client = createClient()

    await expect(client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
    })
  })

  test('validates required inputs before API calls', async () => {
    const client = createClient()

    await expect(client.listByRepository({ repoOwner: ' ', repoName: 'kata' })).rejects.toMatchObject({
      code: 'UNKNOWN',
    })

    await expect(
      client.fetchByTitle({ title: ' ', repoOwner: 'gannonh', repoName: 'kata' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN' })
  })

  test('maps GitHub API auth and not-found statuses to structured errors', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('denied', { status: 401 })) as unknown as typeof fetch
    const client = createClient()
    await expect(client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('missing', { status: 404 })) as unknown as typeof fetch
    await expect(client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  test('maps rate limits, invalid JSON, and network errors', async () => {
    process.env.GH_TOKEN = 'ghp_test'

    const client = createClient()

    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('slow down', { status: 429 })) as unknown as typeof fetch
    await expect(client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })

    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('{bad json', { status: 200 })) as unknown as typeof fetch
    await expect(client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })).rejects.toMatchObject({
      code: 'UNKNOWN',
    })

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('connection reset')) as unknown as typeof fetch
    await expect(client.listByRepository({ repoOwner: 'gannonh', repoName: 'kata' })).rejects.toMatchObject({
      code: 'NETWORK',
    })
  })

  test('toPlanningArtifactError normalizes timeout errors', () => {
    const error = GithubPlanningClient.toPlanningArtifactError(new DOMException('timeout', 'AbortError'))
    expect(error).toEqual({
      code: 'NETWORK',
      message: 'GitHub API request timed out',
    })
  })
})
