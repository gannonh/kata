import { describe, expect, test } from 'vitest'
import { buildModelSelectorReadinessNotice } from '../ModelSelector'
import type { FirstRunReadinessSnapshot } from '@shared/types'

function createReadiness(
  overrides: Partial<FirstRunReadinessSnapshot['checkpoints']> = {},
): FirstRunReadinessSnapshot {
  return {
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
          message: 'Kata runtime failed to start. Restart the runtime from the chat banner.',
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
          message: 'First turn is blocked until runtime startup completes.',
          recoveryAction: 'restart_process',
          recoverable: true,
          timestamp: '2026-04-08T00:00:00.000Z',
        },
      },
      ...overrides,
    },
  }
}

describe('ModelSelector readiness notice helper', () => {
  test('prefers startup guidance when startup checkpoint is failing', () => {
    const readiness = createReadiness()
    const notice = buildModelSelectorReadinessNotice(readiness)

    expect(notice).toContain('Kata runtime failed to start')
    expect(notice).toContain('Restart runtime')
  })

  test('falls back to model checkpoint guidance when startup is healthy', () => {
    const readiness = createReadiness({
      startup: { checkpoint: 'startup', status: 'pass' },
      model: {
        checkpoint: 'model',
        status: 'fail',
        failure: {
          class: 'config',
          severity: 'warning',
          code: 'MODEL_NOT_AVAILABLE',
          message: 'Selected model is unavailable. Refresh models or choose another model.',
          recoveryAction: 'retry_request',
          recoverable: true,
          timestamp: '2026-04-08T00:00:00.000Z',
        },
      },
    })

    const notice = buildModelSelectorReadinessNotice(readiness)
    expect(notice).toContain('Selected model is unavailable')
    expect(notice).toContain('Retry request')
  })

  test('returns null when no startup/model checkpoint is blocked', () => {
    const readiness = createReadiness({
      startup: { checkpoint: 'startup', status: 'pass' },
      model: { checkpoint: 'model', status: 'pass' },
    })

    expect(buildModelSelectorReadinessNotice(readiness)).toBeNull()
    expect(buildModelSelectorReadinessNotice(null)).toBeNull()
  })
})
