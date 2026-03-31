import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
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
})
