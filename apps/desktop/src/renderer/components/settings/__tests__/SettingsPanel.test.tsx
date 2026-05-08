import { describe, expect, test } from 'vitest'
import { formatFirstRunStartupGuidance } from '../SettingsPanel'
import { computeActiveIsOAuth } from '../ProviderAuthPanel'
import type { ProviderInfo } from '@shared/types'

describe('computeActiveIsOAuth', () => {
  test('returns true when activeInfo.authType is "oauth" regardless of loading', () => {
    const info: ProviderInfo = { provider: 'anthropic', status: 'valid', authType: 'oauth' }
    expect(computeActiveIsOAuth(info, 'anthropic', false)).toBe(true)
    expect(computeActiveIsOAuth(info, 'anthropic', true)).toBe(true)
  })

  test('returns false when activeInfo.authType is "api_key" even for OAuth-only provider ids', () => {
    // Pathological: the static OAUTH_PROVIDERS set would say github-copilot
    // is OAuth-only, but if the bridge has somehow reported api_key for it,
    // the runtime record wins. This keeps the contract single-sourced once
    // the bridge has responded.
    const info: ProviderInfo = { provider: 'github-copilot', status: 'valid', authType: 'api_key' }
    expect(computeActiveIsOAuth(info, 'github-copilot', false)).toBe(false)
  })

  test('falls back to OAUTH_PROVIDERS set only during the initial loading tick', () => {
    // activeInfo undefined, loading → fall back for OAuth-only providers.
    expect(computeActiveIsOAuth(undefined, 'github-copilot', true)).toBe(true)
    // Dual-mode providers don't get the fallback; they wait for the real record.
    expect(computeActiveIsOAuth(undefined, 'anthropic', true)).toBe(false)
    expect(computeActiveIsOAuth(undefined, 'openai', true)).toBe(false)
  })

  test('after loading completes with no data, does NOT fall back so API-key form stays reachable', () => {
    // Regression for PR #313 CodeRabbit second-pass review: a failed
    // getProviders() leaves providers=null permanently. The fallback used
    // to persist forever, hiding the API-key entry form even for
    // github-copilot. Now the fallback is gated on `loading`, so once the
    // initial fetch resolves (success or failure), the API-key form
    // becomes reachable for manual key entry.
    expect(computeActiveIsOAuth(undefined, 'github-copilot', false)).toBe(false)
    expect(computeActiveIsOAuth(undefined, 'anthropic', false)).toBe(false)
  })
})

describe('SettingsPanel', () => {
  test('formats startup guidance from first-run readiness checkpoint', () => {
    expect(
      formatFirstRunStartupGuidance({
        generatedAt: '2026-04-08T00:00:00.000Z',
        selectedProvider: 'openai',
        selectedModel: 'openai/gpt-4.1',
        availableModelCount: 1,
        completedFirstTurn: false,
        blockedCheckpoint: 'startup',
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
          startup: {
            checkpoint: 'startup',
            status: 'fail',
            failure: {
              class: 'process',
              severity: 'critical',
              code: 'STARTUP_RUNTIME_CRASHED',
              message: 'Kata runtime failed to start.',
              recoveryAction: 'restart_process',
              recoverable: true,
              timestamp: '2026-04-08T00:00:00.000Z',
            },
          },
          first_turn: {
            checkpoint: 'first_turn',
            status: 'fail',
            blockedBy: 'startup',
            failure: {
              class: 'process',
              severity: 'warning',
              code: 'FIRST_TURN_BLOCKED_BY_STARTUP',
              message: 'First turn blocked by startup.',
              recoveryAction: 'restart_process',
              recoverable: true,
              timestamp: '2026-04-08T00:00:00.000Z',
            },
          },
        },
      }),
    ).toContain('Kata runtime failed to start.')

    expect(formatFirstRunStartupGuidance(null)).toBeNull()
  })
})
