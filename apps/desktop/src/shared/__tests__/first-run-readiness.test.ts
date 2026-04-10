import { describe, expect, test } from 'vitest'
import { buildFirstRunReadinessSnapshot } from '../first-run-readiness'
import type { ProviderStatusMap } from '../types'

function createProviders(overrides: Partial<ProviderStatusMap> = {}): ProviderStatusMap {
  return {
    anthropic: { provider: 'anthropic', status: 'missing', authType: 'api_key' },
    openai: { provider: 'openai', status: 'missing', authType: 'api_key' },
    google: { provider: 'google', status: 'missing', authType: 'api_key' },
    mistral: { provider: 'mistral', status: 'missing', authType: 'api_key' },
    bedrock: { provider: 'bedrock', status: 'missing', authType: 'api_key' },
    azure: { provider: 'azure', status: 'missing', authType: 'api_key' },
    'github-copilot': { provider: 'github-copilot', status: 'missing', authType: 'oauth' },
    ...overrides,
  }
}

describe('buildFirstRunReadinessSnapshot', () => {
  test('configured API-key provider passes auth checkpoint', () => {
    const providers = createProviders({
      openai: { provider: 'openai', status: 'valid', authType: 'api_key', maskedKey: '••••1234' },
    })

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      selectedProvider: 'openai',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.checkpoints.auth.status).toBe('pass')
    expect(snapshot.providers.openai.configured).toBe(true)
    expect(snapshot.providers.openai.requiresKey).toBe(false)
  })

  test('configured OAuth provider passes auth checkpoint', () => {
    const providers = createProviders({
      'github-copilot': { provider: 'github-copilot', status: 'valid', authType: 'oauth' },
    })

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      selectedProvider: 'github-copilot',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.checkpoints.auth.status).toBe('pass')
    expect(snapshot.providers['github-copilot'].configured).toBe(true)
    expect(snapshot.providers['github-copilot'].requiresKey).toBe(false)
  })

  test('missing OAuth provider does not require key', () => {
    const providers = createProviders()

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.providers['github-copilot'].status).toBe('missing')
    expect(snapshot.providers['github-copilot'].configured).toBe(false)
    expect(snapshot.providers['github-copilot'].requiresKey).toBe(false)
  })

  test('unconfigured API-key provider requires key', () => {
    const providers = createProviders({
      openai: { provider: 'openai', status: 'valid', authType: 'api_key', maskedKey: '••••1234' },
    })

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.providers.anthropic.requiresKey).toBe(true)
    expect(snapshot.providers.google.requiresKey).toBe(true)
    expect(snapshot.providers['github-copilot'].requiresKey).toBe(false)
  })

  test('skip-key-entry transition: configured provider makes auth pass', () => {
    const providers = createProviders({
      anthropic: { provider: 'anthropic', status: 'valid', authType: 'api_key', maskedKey: '••••5678' },
    })

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      selectedProvider: 'anthropic',
      now: '2026-04-08T00:00:00.000Z',
    })

    // Auth passes — onboarding should skip key entry
    expect(snapshot.checkpoints.auth.status).toBe('pass')
    expect(snapshot.providers.anthropic.configured).toBe(true)
  })

  test('mixed providers: API-key configured + OAuth missing = auth passes', () => {
    const providers = createProviders({
      openai: { provider: 'openai', status: 'valid', authType: 'api_key', maskedKey: '••••1234' },
      // github-copilot remains missing (default)
    })

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      selectedProvider: 'openai',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.checkpoints.auth.status).toBe('pass')
    expect(snapshot.providers.openai.configured).toBe(true)
    expect(snapshot.providers['github-copilot'].configured).toBe(false)
    expect(snapshot.providers['github-copilot'].requiresKey).toBe(false)
  })

  test('no configured providers fails auth checkpoint', () => {
    const providers = createProviders()

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.checkpoints.auth.status).toBe('fail')
    expect(snapshot.checkpoints.auth.failure?.code).toBe('AUTH_PROVIDER_NOT_CONFIGURED')
  })

  test('selected provider requiring key fails auth checkpoint', () => {
    const providers = createProviders({
      anthropic: { provider: 'anthropic', status: 'valid', authType: 'api_key', maskedKey: '••••5678' },
    })

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      selectedProvider: 'openai',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.checkpoints.auth.status).toBe('fail')
    expect(snapshot.checkpoints.auth.failure?.code).toBe('AUTH_PROVIDER_KEY_REQUIRED')
  })

  test('selected missing OAuth provider fails auth with OAuth-specific code', () => {
    const providers = createProviders()
    // github-copilot is missing (default), but it is selected

    const snapshot = buildFirstRunReadinessSnapshot({
      providers,
      selectedProvider: 'github-copilot',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(snapshot.checkpoints.auth.status).toBe('fail')
    expect(snapshot.checkpoints.auth.failure?.code).toBe('AUTH_OAUTH_PROVIDER_NOT_CONNECTED')
    // requiresKey must remain false — OAuth providers never ask for a key
    expect(snapshot.providers['github-copilot'].requiresKey).toBe(false)
  })
})
