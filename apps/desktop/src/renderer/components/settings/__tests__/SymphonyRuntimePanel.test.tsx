import { describe, expect, test } from 'vitest'
import {
  deriveSymphonyControlState,
  deriveSymphonyRuntimeErrorDetails,
  formatSymphonyPhaseLabel,
  phaseBadgeVariant,
} from '../SymphonyRuntimePanel'

describe('SymphonyRuntimePanel helpers', () => {
  test('maps lifecycle phase labels for user-facing copy', () => {
    expect(formatSymphonyPhaseLabel('ready')).toBe('Ready')
    expect(formatSymphonyPhaseLabel('config_error')).toBe('Config Error')
    expect(formatSymphonyPhaseLabel('disconnected')).toBe('Disconnected')
  })

  test('selects destructive badge for failing phases', () => {
    expect(phaseBadgeVariant('failed')).toBe('destructive')
    expect(phaseBadgeVariant('config_error')).toBe('destructive')
    expect(phaseBadgeVariant('ready')).toBe('default')
  })

  test('enables start/stop/restart controls based on runtime status', () => {
    const stopped = deriveSymphonyControlState({
      phase: 'stopped',
      managedProcessRunning: false,
      pending: false,
    })

    expect(stopped).toEqual({
      canStart: true,
      canStop: false,
      canRestart: false,
    })

    const ready = deriveSymphonyControlState({
      phase: 'ready',
      managedProcessRunning: true,
      pending: false,
    })

    expect(ready).toEqual({
      canStart: false,
      canStop: true,
      canRestart: true,
    })

    const pending = deriveSymphonyControlState({
      phase: 'ready',
      managedProcessRunning: true,
      pending: true,
    })

    expect(pending).toEqual({
      canStart: false,
      canStop: false,
      canRestart: false,
    })
  })

  test('prefers explicit runtime error details when available', () => {
    expect(
      deriveSymphonyRuntimeErrorDetails({
        lastError: {
          code: 'PROCESS_EXITED',
          phase: 'process',
          message: 'Symphony exited unexpectedly (1).',
          details: 'startup validation failed: YAML parse error',
        },
        diagnostics: { stdout: ['ignored stdout'], stderr: ['ignored stderr'] },
      }),
    ).toBe('startup validation failed: YAML parse error')
  })

  test('falls back to recent process diagnostics for process exits', () => {
    expect(
      deriveSymphonyRuntimeErrorDetails({
        lastError: {
          code: 'PROCESS_EXITED',
          phase: 'process',
          message: 'Symphony exited unexpectedly (1).',
        },
        diagnostics: {
          stdout: ['line 1', 'line 2'],
          stderr: ['yaml parse error', 'line 39 column 17'],
        },
      }),
    ).toBe('yaml parse error\nline 39 column 17')
  })
})
