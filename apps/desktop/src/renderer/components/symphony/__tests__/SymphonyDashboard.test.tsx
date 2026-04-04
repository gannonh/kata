import { describe, expect, test } from 'vitest'
import { connectionBadgeVariant } from '../SymphonyDashboard'
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
})
