import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LinearDocumentClient, LinearDocumentClientError } from '../linear-document-client'

const originalFetch = globalThis.fetch
const originalLinearApiKey = process.env.LINEAR_API_KEY

describe('LinearDocumentClient', () => {
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

  test('throws missing key error when no LINEAR_API_KEY is configured', async () => {
    const authBridge = {
      getApiKey: vi.fn(async () => null),
    }

    const client = new LinearDocumentClient(authBridge as never)

    await expect(client.fetchByTitle({ title: 'M001-ROADMAP' })).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
      message: expect.stringContaining('Linear API key required'),
    })
  })

  test('fetches a document by title and returns planning artifact payload', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            documents: {
              nodes: [
                {
                  title: 'M001-ROADMAP',
                  content: '# Hello planning world',
                  updatedAt: '2026-04-02T10:00:00.000Z',
                  project: { id: 'project-123' },
                  issue: null,
                },
              ],
            },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch

    const authBridge = {
      getApiKey: vi.fn(async () => null),
    }

    const client = new LinearDocumentClient(authBridge as never)
    const artifact = await client.fetchByTitle({
      title: 'M001-ROADMAP',
      projectId: 'project-123',
    })

    expect(artifact).toEqual({
      title: 'M001-ROADMAP',
      artifactKey: 'project:project-123:M001-ROADMAP',
      content: '# Hello planning world',
      updatedAt: '2026-04-02T10:00:00.000Z',
      scope: 'project',
      projectId: 'project-123',
      issueId: undefined,
    })
  })

  test('lists project-scoped planning artifacts with project slug resolution', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: {
                id: 'project-uuid-123',
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
              documents: {
                nodes: [
                  {
                    title: 'DECISIONS',
                    content: '# Decisions',
                    updatedAt: '2026-04-03T00:00:00.000Z',
                    project: { id: 'project-uuid-123' },
                    issue: null,
                  },
                  {
                    title: 'M002B-ROADMAP',
                    content: '# Roadmap',
                    updatedAt: '2026-04-03T01:00:00.000Z',
                    project: { id: 'project-uuid-123' },
                    issue: null,
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch

    const client = new LinearDocumentClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.listByProject('b0f5a7be6537')).resolves.toEqual([
      {
        title: 'M002B-ROADMAP',
        artifactKey: 'project:project-uuid-123:M002B-ROADMAP',
        content: '# Roadmap',
        updatedAt: '2026-04-03T01:00:00.000Z',
        scope: 'project',
        projectId: 'project-uuid-123',
        issueId: undefined,
      },
      {
        title: 'DECISIONS',
        artifactKey: 'project:project-uuid-123:DECISIONS',
        content: '# Decisions',
        updatedAt: '2026-04-03T00:00:00.000Z',
        scope: 'project',
        projectId: 'project-uuid-123',
        issueId: undefined,
      },
    ])
  })

  test('uses ID variable typing when resolving project references', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: {
                id: 'project-uuid-123',
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
              documents: {
                nodes: [],
              },
            },
          }),
          { status: 200 },
        ),
      )

    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const client = new LinearDocumentClient({ getApiKey: vi.fn(async () => null) } as never)
    await client.listByProject('project-ref')

    const firstRequestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    const firstRequestBody = JSON.parse(String(firstRequestInit?.body)) as { query: string }

    expect(firstRequestBody.query).toContain('query ResolveProjectId($projectRef: ID!)')
  })

  test('paginates project documents and requests updatedAt-desc ordering', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: {
                id: 'project-uuid-123',
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
              documents: {
                nodes: [
                  {
                    title: 'ROADMAP',
                    content: '# First page',
                    updatedAt: '2026-04-03T00:00:00.000Z',
                    project: { id: 'project-uuid-123' },
                    issue: null,
                  },
                ],
                pageInfo: {
                  hasNextPage: true,
                  endCursor: 'cursor-page-1',
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
              documents: {
                nodes: [
                  {
                    title: 'DECISIONS',
                    content: '# Second page',
                    updatedAt: '2026-04-03T01:00:00.000Z',
                    project: { id: 'project-uuid-123' },
                    issue: null,
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

    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const client = new LinearDocumentClient({ getApiKey: vi.fn(async () => null) } as never)
    const artifacts = await client.listByProject('project-ref')

    expect(artifacts.map((artifact) => artifact.title)).toEqual(['DECISIONS', 'ROADMAP'])

    const firstDocumentsBody = JSON.parse(
      String((fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    ) as {
      query: string
      variables: Record<string, string>
    }
    expect(firstDocumentsBody.query).toContain('orderBy: { updatedAt: DESC }')
    expect(firstDocumentsBody.variables).toEqual({ projectId: 'project-uuid-123' })

    const secondDocumentsBody = JSON.parse(
      String((fetchSpy.mock.calls[2]?.[1] as RequestInit | undefined)?.body),
    ) as {
      variables: Record<string, string>
    }
    expect(secondDocumentsBody.variables).toEqual({
      projectId: 'project-uuid-123',
      after: 'cursor-page-1',
    })
  })

  test('returns NOT_FOUND when project reference cannot be resolved', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            project: null,
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch

    const client = new LinearDocumentClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.listByProject('missing-project')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('missing-project'),
    })
  })

  test('returns null when Linear responds with no matching documents', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            documents: {
              nodes: [],
            },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch

    const client = new LinearDocumentClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchByTitle({ title: 'NOT-FOUND' })).resolves.toBeNull()
  })

  test('maps unauthorized, endpoint, and rate limit failures to structured errors', async () => {
    process.env.LINEAR_API_KEY = 'linear-test-key'

    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch

    const client = new LinearDocumentClient({ getApiKey: vi.fn(async () => null) } as never)

    await expect(client.fetchByTitle({ title: 'M001-ROADMAP' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    })

    globalThis.fetch = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch

    await expect(client.fetchByTitle({ title: 'M001-ROADMAP' })).rejects.toMatchObject({
      code: 'NETWORK',
      status: 404,
    })

    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch

    await expect(client.fetchByTitle({ title: 'M001-ROADMAP' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    })
  })

  test('converts arbitrary errors to planning artifact errors', () => {
    const networkError = new Error('network down')
    const converted = LinearDocumentClient.toPlanningArtifactError(networkError)

    expect(converted).toEqual({
      code: 'UNKNOWN',
      message: 'network down',
    })

    const structured = LinearDocumentClient.toPlanningArtifactError(
      new LinearDocumentClientError('UNAUTHORIZED', 'bad key', 401),
    )

    expect(structured).toEqual({
      code: 'UNAUTHORIZED',
      message: 'bad key',
    })

    const transportError = LinearDocumentClient.toPlanningArtifactError(new TypeError('fetch failed'))
    expect(transportError).toEqual({
      code: 'NETWORK',
      message: 'fetch failed',
    })
  })
})
