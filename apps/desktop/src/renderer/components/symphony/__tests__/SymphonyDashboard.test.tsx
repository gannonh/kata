import { describe, expect, test } from 'vitest'
import {
  connectionBadgeVariant,
  formatSymphonyReliabilityNotice,
  formatSymphonyStabilityNotice,
} from '../SymphonyDashboard'
import { formatLastActivity } from '../WorkerTable'

describe('SymphonyDashboard helpers', () => {
  test('maps connection states to expected badge variants', () => {
    expect(connectionBadgeVariant('connected')).toBe('default')
    expect(connectionBadgeVariant('reconnecting')).toBe('secondary')
    expect(connectionBadgeVariant('disconnected')).toBe('destructive')
  })

  test('formats worker activity timestamp safely', () => {
    expect(formatLastActivity(undefined)).toBe('—')
    expect(formatLastActivity('not-a-date')).toBe('—')
    expect(formatLastActivity('2026-04-04T19:00:00.000Z')).not.toBe('—')
  })

  test('formats reliability notice with shared recovery semantics', () => {
    const notice = formatSymphonyReliabilityNotice({
      code: 'REL-SYMPHONY-NETWORK-DISCONNECTED',
      class: 'network',
      severity: 'error',
      sourceSurface: 'symphony',
      recoveryAction: 'reconnect',
      outcome: 'pending',
      message: 'Symphony operator is disconnected.',
      timestamp: '2026-04-07T20:00:00.000Z',
    })

    expect(notice).toContain('Symphony operator is disconnected.')
    expect(notice).toContain('Recommended recovery: Reconnect service.')
  })

  test('formats stability notice with metric-specific recovery guidance', () => {
    const notice = formatSymphonyStabilityNotice({
      code: 'REL-LONGRUN-RECOVERY_LATENCY_MS-BREACH',
      metric: 'recoveryLatencyMs',
      sourceSurface: 'symphony',
      failureClass: 'process',
      severity: 'critical',
      recoveryAction: 'restart_process',
      comparator: 'max',
      observedValue: 42000,
      warningThreshold: 12000,
      breachThreshold: 30000,
      breached: true,
      message: 'Recovery latency exceeded threshold (42000ms vs 30000ms).',
      suggestedRecovery: 'Restart Symphony runtime and validate recovery checkpoints.',
      timestamp: '2026-04-07T20:00:00.000Z',
    })

    expect(notice).toContain('Recovery latency: Recovery latency exceeded threshold')
    expect(notice).toContain('Suggested recovery: Restart Symphony runtime and validate recovery checkpoints.')
  })
})
