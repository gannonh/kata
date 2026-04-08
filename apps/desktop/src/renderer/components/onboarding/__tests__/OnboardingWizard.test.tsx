import { describe, expect, test } from 'vitest'
import { getOnboardingAccessibilityBaseline } from '../OnboardingWizard'

describe('OnboardingWizard accessibility baseline', () => {
  test('defines severity-gated checkpoints for onboarding flow', () => {
    const baseline = getOnboardingAccessibilityBaseline()

    expect(baseline).toHaveLength(3)
    expect(baseline[0]?.id).toBe('onboarding-heading')
    expect(baseline[0]?.severity).toBe('critical')
    expect(baseline.some((checkpoint) => checkpoint.id === 'onboarding-primary-action')).toBe(true)
    expect(baseline.every((checkpoint) => checkpoint.expectation.length > 0)).toBe(true)
  })
})
