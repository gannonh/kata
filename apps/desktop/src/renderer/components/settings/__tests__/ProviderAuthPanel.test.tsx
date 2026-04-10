import { describe, expect, test } from 'vitest'
import {
  buildProviderAuthReadinessNotice,
  buildProviderAuthRecoveryAction,
} from '../ProviderAuthPanel'
import type { FirstRunReadinessSnapshot, ProviderInfo } from '@shared/types'
import { OAUTH_PROVIDERS } from '@shared/types'

function createReadiness(
  overrides: Partial<FirstRunReadinessSnapshot['checkpoints']> = {},
): FirstRunReadinessSnapshot {
  return {
    generatedAt: '2026-04-08T00:00:00.000Z',
    selectedProvider: 'openai',
    selectedModel: 'openai/gpt-4.1',
    availableModelCount: 1,
    completedFirstTurn: false,
    blockedCheckpoint: 'first_turn',
    overallStatus: 'blocked',
    providers: {
      anthropic: { provider: 'anthropic', status: 'missing', configured: false, requiresKey: true },
      openai: { provider: 'openai', status: 'valid', configured: true, requiresKey: false },
      google: { provider: 'google', status: 'missing', configured: false, requiresKey: true },
      mistral: { provider: 'mistral', status: 'missing', configured: false, requiresKey: true },
      bedrock: { provider: 'bedrock', status: 'missing', configured: false, requiresKey: true },
      azure: { provider: 'azure', status: 'missing', configured: false, requiresKey: true },
      'github-copilot': { provider: 'github-copilot', status: 'missing', configured: false, requiresKey: false },
    },
    checkpoints: {
      auth: { checkpoint: 'auth', status: 'pass' },
      model: { checkpoint: 'model', status: 'pass' },
      startup: { checkpoint: 'startup', status: 'pass' },
      first_turn: {
        checkpoint: 'first_turn',
        status: 'fail',
        failure: {
          class: 'stale',
          severity: 'info',
          code: 'FIRST_TURN_PENDING',
          message: 'Send your first message to verify end-to-end readiness.',
          recoveryAction: 'inspect',
          recoverable: true,
          timestamp: '2026-04-08T00:00:00.000Z',
        },
      },
      ...overrides,
    },
  }
}

describe('ProviderAuthPanel first-run readiness helpers', () => {
  test('prefers auth checkpoint message when auth is blocked', () => {
    const readiness = createReadiness({
      auth: {
        checkpoint: 'auth',
        status: 'fail',
        failure: {
          class: 'auth',
          severity: 'error',
          code: 'AUTH_PROVIDER_KEY_REQUIRED',
          message: 'Add a valid OpenAI key.',
          recoveryAction: 'reauthenticate',
          recoverable: true,
          timestamp: '2026-04-08T00:00:00.000Z',
        },
      },
    })

    expect(buildProviderAuthReadinessNotice(readiness)).toBe('Add a valid OpenAI key.')
    expect(buildProviderAuthRecoveryAction(readiness.checkpoints.auth)).toBe('Update credentials')
  })

  test('falls back to model checkpoint message when auth passes', () => {
    const readiness = createReadiness({
      model: {
        checkpoint: 'model',
        status: 'fail',
        failure: {
          class: 'config',
          severity: 'warning',
          code: 'MODEL_SELECTION_REQUIRED',
          message: 'Select a model before starting your first productive turn.',
          recoveryAction: 'inspect',
          recoverable: true,
          timestamp: '2026-04-08T00:00:00.000Z',
        },
      },
    })

    expect(buildProviderAuthReadinessNotice(readiness)).toBe(
      'Select a model before starting your first productive turn.',
    )
  })

  test('returns null when no blocked auth/model checkpoints exist', () => {
    const readiness = createReadiness()
    expect(buildProviderAuthReadinessNotice(readiness)).toBeNull()
    expect(buildProviderAuthRecoveryAction(null)).toBeNull()
  })
})

describe('OAuth provider rendering logic', () => {
  test('OAUTH_PROVIDERS contains github-copilot', () => {
    expect(OAUTH_PROVIDERS.has('github-copilot')).toBe(true)
  })

  test('OAuth provider with valid status should not show API key input', () => {
    const oauthValidProvider: ProviderInfo = {
      provider: 'github-copilot',
      status: 'valid',
      authType: 'oauth',
    }

    // OAuth provider should be rendered as authenticated row — no maskedKey, no API-key input
    expect(OAUTH_PROVIDERS.has(oauthValidProvider.provider)).toBe(true)
    expect(oauthValidProvider.authType).toBe('oauth')
    expect(oauthValidProvider.status).toBe('valid')
    expect(oauthValidProvider.maskedKey).toBeUndefined()
  })

  test('OAuth provider with missing status should show CLI guidance', () => {
    const oauthMissingProvider: ProviderInfo = {
      provider: 'github-copilot',
      status: 'missing',
      authType: 'oauth',
    }

    expect(OAUTH_PROVIDERS.has(oauthMissingProvider.provider)).toBe(true)
    expect(oauthMissingProvider.status).toBe('missing')
    expect(oauthMissingProvider.authType).toBe('oauth')
  })

  test('API-key provider is not in OAUTH_PROVIDERS', () => {
    expect(OAUTH_PROVIDERS.has('anthropic')).toBe(false)
    expect(OAUTH_PROVIDERS.has('openai')).toBe(false)
  })

  test('mixed provider list has correct auth types', () => {
    const providers: Record<string, ProviderInfo> = {
      anthropic: { provider: 'anthropic', status: 'valid', authType: 'api_key', maskedKey: '••••1234' },
      openai: { provider: 'openai', status: 'missing', authType: 'api_key' },
      'github-copilot': { provider: 'github-copilot', status: 'valid', authType: 'oauth' },
    }

    // API-key providers should have api_key authType
    expect(providers.anthropic!.authType).toBe('api_key')
    expect(providers.openai!.authType).toBe('api_key')
    // OAuth providers should have oauth authType
    expect(providers['github-copilot']!.authType).toBe('oauth')

    // Only github-copilot is OAuth
    for (const [key, info] of Object.entries(providers)) {
      if (OAUTH_PROVIDERS.has(key as 'github-copilot')) {
        expect(info.authType).toBe('oauth')
      } else {
        expect(info.authType).toBe('api_key')
      }
    }
  })
})
