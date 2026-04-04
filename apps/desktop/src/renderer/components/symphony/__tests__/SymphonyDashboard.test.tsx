import { describe, expect, test } from 'vitest'
import { connectionBadgeVariant } from '../SymphonyDashboard'

describe('SymphonyDashboard helpers', () => {
  test('maps connection states to expected badge variants', () => {
    expect(connectionBadgeVariant('connected')).toBe('default')
    expect(connectionBadgeVariant('reconnecting')).toBe('secondary')
    expect(connectionBadgeVariant('disconnected')).toBe('destructive')
  })
})
