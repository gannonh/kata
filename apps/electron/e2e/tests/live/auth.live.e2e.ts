/**
 * E2E-03: Auth verification test
 * Verifies app loads with real credentials, no onboarding wizard appears.
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live Auth', () => {
  test('E2E-03: app loads with real credentials, no onboarding wizard', async ({ mainWindow }) => {
    // Wait for app to fully initialize (live fixture already waits for splash)
    await mainWindow.waitForLoadState('networkidle')

    // Verify no onboarding wizard appears (checks multiple possible headings)
    const onboardingIndicators = [
      mainWindow.getByRole('heading', { name: /welcome/i }),
      mainWindow.getByRole('heading', { name: /get started/i }),
      mainWindow.getByRole('button', { name: /set up/i }),
    ]

    for (const indicator of onboardingIndicators) {
      await expect(indicator).not.toBeVisible({ timeout: 3000 })
    }

    // Verify main app container is visible (indicates successful auth)
    await expect(mainWindow.locator('[data-testid="app-main-content"]')).toBeVisible()

    // Verify we're in authenticated state (sidebar navigation is available)
    // Note: App may restore to settings view from previous session, so we check navigation exists
    await expect(mainWindow.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({ timeout: 10000 })
  })
})
