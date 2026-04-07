import { describe, expect, test } from 'vitest'
import { connectionBadgeVariant, formatSymphonyReliabilityNotice } from '../SymphonyDashboard'
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
})
