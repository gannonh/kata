import { describe, expect, test } from 'vitest'
import {
  buildProviderAuthReadinessNotice,
  buildProviderAuthRecoveryAction,
} from '../ProviderAuthPanel'
import type { FirstRunReadinessSnapshot, ProviderInfo } from '@shared/types'

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

// These tests pin the runtime contract the UI depends on: ProviderAuthPanel
// and the onboarding steps pick their rendering (OAuth vs. API-key) from
// info.authType, not from a static whitelist. Providers like Anthropic and
// OpenAI can be authed either way depending on the auth.json record, so the
// rendering must be driven by live data.
describe('Provider rendering is driven by runtime authType', () => {
  test('OAuth-authed dual-mode provider surfaces authType: oauth', () => {
    const anthropicOAuth: ProviderInfo = {
      provider: 'anthropic',
      status: 'valid',
      authType: 'oauth',
      maskedKey: '••••ZAAA',
    }

    expect(anthropicOAuth.authType).toBe('oauth')
    expect(anthropicOAuth.status).toBe('valid')
  })

  test('API-key-authed dual-mode provider surfaces authType: api_key', () => {
    const anthropicKey: ProviderInfo = {
      provider: 'anthropic',
      status: 'valid',
      authType: 'api_key',
      maskedKey: '••••1234',
    }

    expect(anthropicKey.authType).toBe('api_key')
  })

  test('github-copilot always surfaces authType: oauth regardless of status', () => {
    const valid: ProviderInfo = {
      provider: 'github-copilot',
      status: 'valid',
      authType: 'oauth',
    }
    const missing: ProviderInfo = {
      provider: 'github-copilot',
      status: 'missing',
      authType: 'oauth',
    }

    expect(valid.authType).toBe('oauth')
    expect(missing.authType).toBe('oauth')
  })

  test('mixed provider map covers both auth modes without relying on provider id', () => {
    const providers: Record<string, ProviderInfo> = {
      // Anthropic authenticated via Claude Pro/Max OAuth (kata login anthropic)
      anthropic: { provider: 'anthropic', status: 'valid', authType: 'oauth', maskedKey: '••••ZAAA' },
      // OpenAI authenticated via Codex subscription OAuth (kata login openai-codex, aliased to openai)
      openai: { provider: 'openai', status: 'valid', authType: 'oauth', maskedKey: '••••Geqo' },
      // Google unconfigured
      google: { provider: 'google', status: 'missing', authType: 'api_key' },
      // Copilot OAuth
      'github-copilot': { provider: 'github-copilot', status: 'valid', authType: 'oauth' },
    }

    const oauthRows = Object.values(providers).filter((info) => info.authType === 'oauth')
    const apiKeyRows = Object.values(providers).filter((info) => info.authType === 'api_key')

    expect(oauthRows.map((row) => row.provider).sort()).toEqual(
      ['anthropic', 'github-copilot', 'openai'].sort(),
    )
    expect(apiKeyRows.map((row) => row.provider)).toEqual(['google'])
  })
})
