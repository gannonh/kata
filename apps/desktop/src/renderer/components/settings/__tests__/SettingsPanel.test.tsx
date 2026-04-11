import { describe, expect, test } from 'vitest'
import { formatFirstRunStartupGuidance } from '../SettingsPanel'

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
