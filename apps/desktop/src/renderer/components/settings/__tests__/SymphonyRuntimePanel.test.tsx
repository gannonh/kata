import { describe, expect, test } from 'vitest'
import {
  deriveSymphonyControlState,
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
})
