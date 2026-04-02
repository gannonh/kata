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
