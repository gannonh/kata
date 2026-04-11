import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AuthBridge, normalizeFirstRunAuthReadiness, parseOAuthExpires } from '../auth-bridge'

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

  test('getApiKey reads canonical and custom provider keys', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          openai: { type: 'api_key', key: '  sk-openai-live  ' },
          linear: { type: 'api_key', key: '  lin_api_test_123  ' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)

    await expect(bridge.getApiKey('openai')).resolves.toBe('sk-openai-live')
    await expect(bridge.getApiKey('linear')).resolves.toBe('lin_api_test_123')
  })

  test('getApiKey returns null for non-api-key records and missing provider names', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          google: { type: 'oauth', access: 'token-123' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)

    await expect(bridge.getApiKey('google')).resolves.toBeNull()
    await expect(bridge.getApiKey('')).resolves.toBeNull()
    await expect(bridge.getApiKey('linear')).resolves.toBeNull()
  })

  test('normalizes auth checkpoint as pass when a provider is configured', () => {
    const normalized = normalizeFirstRunAuthReadiness({
      providers: {
        anthropic: { provider: 'anthropic', status: 'missing', authType: 'api_key' },
        openai: { provider: 'openai', status: 'valid', authType: 'api_key', maskedKey: '••••1234' },
        google: { provider: 'google', status: 'missing', authType: 'api_key' },
        mistral: { provider: 'mistral', status: 'missing', authType: 'api_key' },
        bedrock: { provider: 'bedrock', status: 'missing', authType: 'api_key' },
        azure: { provider: 'azure', status: 'missing', authType: 'api_key' },
        'github-copilot': { provider: 'github-copilot', status: 'missing', authType: 'oauth' },
      },
      selectedProvider: 'openai',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(normalized.providers.openai.configured).toBe(true)
    expect(normalized.providers.openai.requiresKey).toBe(false)
    expect(normalized.checkpoint.status).toBe('pass')
  })

  test('fails auth checkpoint when selected provider requires key', () => {
    const normalized = normalizeFirstRunAuthReadiness({
      providers: {
        anthropic: { provider: 'anthropic', status: 'valid', authType: 'api_key', maskedKey: '••••1234' },
        openai: { provider: 'openai', status: 'missing', authType: 'api_key' },
        google: { provider: 'google', status: 'missing', authType: 'api_key' },
        mistral: { provider: 'mistral', status: 'missing', authType: 'api_key' },
        bedrock: { provider: 'bedrock', status: 'missing', authType: 'api_key' },
        azure: { provider: 'azure', status: 'missing', authType: 'api_key' },
        'github-copilot': { provider: 'github-copilot', status: 'missing', authType: 'oauth' },
      },
      selectedProvider: 'openai',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(normalized.checkpoint.status).toBe('fail')
    expect(normalized.checkpoint.failure?.code).toBe('AUTH_PROVIDER_KEY_REQUIRED')
    expect(normalized.checkpoint.failure?.recoveryAction).toBe('reauthenticate')
  })

  test('includes github-copilot in provider list with authType oauth', async () => {
    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.success).toBe(true)
    expect(response.providers['github-copilot']).toBeDefined()
    expect(response.providers['github-copilot'].authType).toBe('oauth')
    expect(response.providers['github-copilot'].provider).toBe('github-copilot')
  })

  test('authType is always populated for all providers', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify({ anthropic: { type: 'api_key', key: 'test-key' } }, null, 2),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.success).toBe(true)
    for (const provider of Object.values(response.providers)) {
      expect(provider.authType).toBeDefined()
      expect(['api_key', 'oauth']).toContain(provider.authType)
    }
  })

  test('detects github-copilot as valid when token file exists', async () => {
    // Create a mock token file for GitHub Copilot
    const copilotDir = path.join(tempDir, '.config', 'github-copilot')
    await fs.mkdir(copilotDir, { recursive: true })
    await fs.writeFile(path.join(copilotDir, 'hosts.json'), '{}', 'utf8')

    // Override HOME so the bridge finds our mock token
    const originalHome = process.env.HOME
    process.env.HOME = tempDir
    try {
      const bridge = new AuthBridge(authFilePath)
      const response = await bridge.getProviders()

      expect(response.providers['github-copilot']).toMatchObject({
        provider: 'github-copilot',
        status: 'valid',
        authType: 'oauth',
      })
    } finally {
      process.env.HOME = originalHome
    }
  })

  test('detects github-copilot as missing when no token file exists', async () => {
    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.providers['github-copilot']).toMatchObject({
      provider: 'github-copilot',
      status: 'missing',
      authType: 'oauth',
    })
  })

  // Regression: KAT-2498 — Desktop must read `kata login`'s OAuth record from
  // auth.json, not just probe the GitHub Copilot CLI's token store. Without this
  // precedence, users who only authenticate through `kata login github-copilot`
  // see "Not connected" even though the CLI recognizes them.
  test('detects github-copilot as valid from auth.json oauth record', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          'github-copilot': {
            type: 'oauth',
            refresh: 'ghu_refresh_token_fixture',
            access: 'tid=copilot_access_token_fixture',
            expires: Date.now() + 60 * 60 * 1000,
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.providers['github-copilot']).toMatchObject({
      provider: 'github-copilot',
      status: 'valid',
      authType: 'oauth',
    })
    expect(response.providers['github-copilot'].maskedKey).toMatch(/^••••/)
  })

  // A stale access token does NOT mean the session is dead: as long as the
  // refresh token is present, the orchestrator will swap in a fresh access
  // token on the next request. KAT-2498: Desktop was falsely flagging
  // Anthropic + Copilot as "expired" whenever their access tokens aged out,
  // even though `kata login` still considered them authenticated.
  test('treats oauth record as valid when refresh is present even if access token expiry is past', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          'github-copilot': {
            type: 'oauth',
            refresh: 'ghu_refresh_token_fixture',
            access: 'tid=copilot_access_token_fixture',
            expires: Date.now() - 60 * 1000,
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.providers['github-copilot']).toMatchObject({
      provider: 'github-copilot',
      status: 'valid',
      authType: 'oauth',
    })
  })

  test('parseOAuthExpires accepts numeric, numeric-string, and ISO-8601 forms', () => {
    const now = Date.now()
    expect(parseOAuthExpires(now)).toBe(now)
    expect(parseOAuthExpires(String(now))).toBe(now)
    expect(parseOAuthExpires('2026-04-08T00:00:00Z')).toBe(Date.parse('2026-04-08T00:00:00Z'))
    expect(parseOAuthExpires(undefined)).toBeNull()
    expect(parseOAuthExpires(null)).toBeNull()
    expect(parseOAuthExpires('')).toBeNull()
    expect(parseOAuthExpires('not-a-date')).toBeNull()
    expect(parseOAuthExpires(Number.NaN)).toBeNull()
  })

  test('marks oauth record as expired when expires is an ISO string and no refresh token', async () => {
    // Regression for CodeRabbit #10: earlier path used Number(record.expires),
    // which returned NaN for ISO strings and silently treated expired sessions
    // as valid. parseOAuthExpires routes string timestamps through Date.parse
    // so the stale-access-token check fires correctly.
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          'github-copilot': {
            type: 'oauth',
            access: 'tid=copilot_access_token_fixture',
            expires: new Date(Date.now() - 60 * 1000).toISOString(),
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.providers['github-copilot']).toMatchObject({
      provider: 'github-copilot',
      status: 'expired',
      authType: 'oauth',
    })
  })

  test('detects oauth record as expired only when no refresh token and access has lapsed', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          'github-copilot': {
            type: 'oauth',
            access: 'tid=copilot_access_token_fixture',
            expires: Date.now() - 60 * 1000,
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.providers['github-copilot']).toMatchObject({
      provider: 'github-copilot',
      status: 'expired',
      authType: 'oauth',
    })
  })

  test('auth.json oauth record takes precedence over filesystem token fallback', async () => {
    // Both sources present — auth.json wins because `kata login` is the source of truth.
    // The filesystem fallback exists for users who authed outside kata entirely.
    const copilotDir = path.join(tempDir, '.config', 'github-copilot')
    await fs.mkdir(copilotDir, { recursive: true })
    await fs.writeFile(path.join(copilotDir, 'hosts.json'), '{}', 'utf8')

    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          'github-copilot': {
            type: 'oauth',
            access: 'tid=kata_managed_token',
            expires: Date.now() + 60 * 60 * 1000,
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const originalHome = process.env.HOME
    process.env.HOME = tempDir
    try {
      const bridge = new AuthBridge(authFilePath)
      const response = await bridge.getProviders()

      expect(response.providers['github-copilot']).toMatchObject({
        provider: 'github-copilot',
        status: 'valid',
        authType: 'oauth',
      })
      // maskedKey proves the auth.json record was used, not the filesystem probe.
      expect(response.providers['github-copilot'].maskedKey).toBe('••••oken')
    } finally {
      process.env.HOME = originalHome
    }
  })

  test('rejects setProviderKey for OAuth providers', async () => {
    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.setProviderKey('github-copilot', 'some-key')

    expect(result.success).toBe(false)
    expect(result.error).toContain('OAuth authentication')
    expect(result.error).toContain('cannot be configured with an API key')
  })

  test('rejects removeProviderKey for OAuth providers', async () => {
    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.removeProviderKey('github-copilot')

    expect(result.success).toBe(false)
    expect(result.error).toContain('OAuth authentication')
    expect(result.error).toContain('cannot be removed here')
  })

  test('rejects validateKey for OAuth providers', async () => {
    const bridge = new AuthBridge(authFilePath)
    const result = await bridge.validateKey('github-copilot', 'some-key')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('OAuth authentication')
  })

  test('mixed provider map returns correct types for API-key and OAuth providers', async () => {
    await fs.writeFile(
      authFilePath,
      JSON.stringify(
        {
          anthropic: { type: 'api_key', key: 'anthropic-key' },
          openai: { type: 'api_key', key: 'openai-key' },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new AuthBridge(authFilePath)
    const response = await bridge.getProviders()

    expect(response.success).toBe(true)

    // API-key providers
    expect(response.providers.anthropic.authType).toBe('api_key')
    expect(response.providers.anthropic.status).toBe('valid')
    expect(response.providers.openai.authType).toBe('api_key')
    expect(response.providers.openai.status).toBe('valid')

    // Unconfigured API-key providers
    expect(response.providers.google.authType).toBe('api_key')
    expect(response.providers.google.status).toBe('missing')

    // OAuth providers
    expect(response.providers['github-copilot'].authType).toBe('oauth')
    expect(['valid', 'missing']).toContain(response.providers['github-copilot'].status)
  })
})
