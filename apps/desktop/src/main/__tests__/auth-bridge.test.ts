import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AuthBridge } from '../auth-bridge'

const originalFetch = globalThis.fetch

describe('AuthBridge', () => {
  let tempDir: string
  let authFilePath: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-auth-bridge-'))
    authFilePath = path.join(tempDir, 'auth.json')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('returns missing provider status when auth file does not exist', async () => {
    const bridge = new AuthBridge(authFilePath)

    const response = await bridge.getProviders()

    expect(response.success).toBe(true)
    expect(response.providers.openai.status).toBe('missing')
    expect(response.providers.anthropic.status).toBe('missing')
  })

  test('validates and saves provider keys with masking', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch

    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.setProviderKey('openai', 'sk-test-1234567890')

    expect(result.success).toBe(true)
    expect(result.providerInfo?.status).toBe('valid')
    expect(result.providerInfo?.maskedKey).toBe('••••7890')

    const file = await fs.readFile(authFilePath, 'utf8')
    expect(file).toContain('"openai"')
    expect(file).toContain('"type": "api_key"')

    const providers = await bridge.getProviders()
    expect(providers.providers.openai.status).toBe('valid')
    expect(providers.providers.openai.maskedKey).toBe('••••7890')
  })

  test('returns structured validation errors for invalid keys', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch

    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.setProviderKey('openai', 'sk-invalid')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid OpenAI API key')

    const exists = await fs
      .access(authFilePath)
      .then(() => true)
      .catch(() => false)

    expect(exists).toBe(false)
  })

  test('returns provider status for all providers from a populated auth file', async () => {
    const now = Date.now()
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          anthropic: { type: 'api_key', key: 'anthropic-key' },
          openai: { type: 'api_key', key: '   sk-openai-1234   ' },
          google: { type: 'oauth', access: 'google-access-token', expires: now + 60_000 },
          mistral: { type: 'oauth', access: 'mistral-access-token', expires: now - 60_000 },
          bedrock: { type: 'api_key', key: '' },
          azure: { type: 'unknown', value: 'broken' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.success).toBe(true)
    expect(Object.keys(response.providers)).toEqual(
      expect.arrayContaining(['anthropic', 'openai', 'google', 'mistral', 'bedrock', 'azure']),
    )

    expect(response.providers.anthropic).toMatchObject({
      provider: 'anthropic',
      authType: 'api_key',
      status: 'valid',
      maskedKey: '••••-key',
    })

    expect(response.providers.openai).toMatchObject({
      provider: 'openai',
      authType: 'api_key',
      status: 'valid',
      maskedKey: '••••1234',
    })

    expect(response.providers.google).toMatchObject({
      provider: 'google',
      authType: 'oauth',
      status: 'valid',
      maskedKey: '••••oken',
    })

    expect(response.providers.mistral).toMatchObject({
      provider: 'mistral',
      authType: 'oauth',
      status: 'expired',
      maskedKey: '••••oken',
    })

    expect(response.providers.bedrock).toMatchObject({
      provider: 'bedrock',
      authType: 'api_key',
      status: 'missing',
    })

    expect(response.providers.bedrock.maskedKey).toBeUndefined()
    expect(response.providers.azure).toMatchObject({
      provider: 'azure',
      status: 'invalid',
    })
  })

  test('handles malformed auth file JSON', async () => {
    await fs.writeFile(authFilePath, '{not-valid-json', 'utf8')

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.success).toBe(false)
    expect(response.error).toContain('Unable to load credentials from')
    expect(response.providers.openai.status).toBe('missing')
    expect(response.providers.anthropic.status).toBe('missing')
    expect(response.providers.google.status).toBe('missing')
    expect(response.providers.mistral.status).toBe('missing')
    expect(response.providers.bedrock.status).toBe('missing')
    expect(response.providers.azure.status).toBe('missing')
  })

  test('removeProviderKey removes an existing provider and updates auth.json', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          openai: { type: 'api_key', key: 'sk-openai-1234' },
          anthropic: { type: 'api_key', key: 'sk-anthropic-5678' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.removeProviderKey('openai')

    expect(response.success).toBe(true)
    expect(response.provider).toBe('openai')
    expect(response.providerInfo).toMatchObject({
      provider: 'openai',
      status: 'missing',
    })

    const saved = JSON.parse(await fs.readFile(authFilePath, 'utf8')) as Record<string, unknown>
    expect(saved.openai).toBeUndefined()
    expect(saved.anthropic).toBeDefined()
  })

  test('removeProviderKey succeeds when provider does not exist', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          anthropic: { type: 'api_key', key: 'sk-anthropic-5678' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.removeProviderKey('openai')

    expect(response.success).toBe(true)
    expect(response.providerInfo?.status).toBe('missing')

    const saved = JSON.parse(await fs.readFile(authFilePath, 'utf8')) as Record<string, unknown>
    expect(saved.openai).toBeUndefined()
    expect(saved.anthropic).toBeDefined()
  })

  test('uses Anthropic validation endpoint and headers', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 429 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.validateKey('anthropic', 'sk-ant-1234')

    expect(result).toEqual({ valid: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-api-key': 'sk-ant-1234',
      'anthropic-version': '2023-06-01',
    })
  })

  test('uses Google validation endpoint and encoded key in query string', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.validateKey('google', '  g-key +/=  ')

    expect(result).toEqual({ valid: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent('g-key +/=')}`,
    )
    expect(init.method).toBe('GET')
  })

  test('uses Mistral validation endpoint and bearer auth header', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.validateKey('mistral', 'mistral-key-9876')

    expect(result).toEqual({ valid: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.mistral.ai/v1/models')
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({
      authorization: 'Bearer mistral-key-9876',
    })
  })

  test('returns unsupported validation errors for bedrock and azure', async () => {
    const bridge = new AuthBridge(authFilePath)

    await expect(bridge.validateKey('bedrock', 'bedrock-key')).resolves.toEqual({
      valid: false,
      error: 'AWS Bedrock validation requires AWS credentials and region configuration',
    })

    await expect(bridge.validateKey('azure', 'azure-key')).resolves.toEqual({
      valid: false,
      error: 'Azure validation requires both API key and Azure endpoint configuration',
    })
  })

  test('masks short keys and treats empty keys as missing', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          openai: { type: 'api_key', key: 'abc' },
          anthropic: { type: 'api_key', key: '' },
          google: { type: 'oauth', access: '   ' },
          mistral: { type: 'oauth', access: 'z' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.providers.openai.status).toBe('valid')
    expect(response.providers.openai.maskedKey).toBe('••••abc')

    expect(response.providers.anthropic.status).toBe('missing')
    expect(response.providers.anthropic.maskedKey).toBeUndefined()

    expect(response.providers.google.status).toBe('valid')
    expect(response.providers.google.maskedKey).toBeUndefined()

    expect(response.providers.mistral.status).toBe('valid')
    expect(response.providers.mistral.maskedKey).toBe('••••z')
  })

  test('returns auth file path via getAuthFilePath', () => {
    const bridge = new AuthBridge(authFilePath)

    expect(bridge.getAuthFilePath()).toBe(authFilePath)
  })

  test('resolves openai-codex alias to openai provider status', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          'openai-codex': { type: 'api_key', key: 'sk-codex-test-1234567890' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.providers.openai.status).toBe('valid')
    expect(response.providers.openai.maskedKey).toBe('••••7890')
  })
})
