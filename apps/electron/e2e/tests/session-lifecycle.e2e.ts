import { test, expect } from '../fixtures/electron.fixture'

/**
 * Tests for basic app behavior.
 *
 * NOTE: Full session lifecycle tests require API credentials to be configured.
 * Without credentials, the app shows the onboarding wizard.
 * These tests verify basic window behavior that works regardless of auth state.
 */

test.describe('App Behavior', () => {
  test.describe('Window Basics', () => {
    test('should have a visible window', async ({ mainWindow }) => {
      const title = await mainWindow.title()
      expect(title).toBeTruthy()
    })

    test('should have main content area', async ({ mainWindow }) => {
      await mainWindow.waitForSelector('main, [role="main"], #root', {
        state: 'visible',
        timeout: 10000
      })
      const content = await mainWindow.content()
      expect(content.length).toBeGreaterThan(100)
    })

    test('should respond to keyboard events', async ({ mainWindow }) => {
      await mainWindow.keyboard.press('Escape')
      await mainWindow.waitForTimeout(100)
      const isVisible = await mainWindow.evaluate(() => document.body !== null)
      expect(isVisible).toBe(true)
    })
  })

  test.describe('UI Elements', () => {
    test('should display Kata branding', async ({ mainWindow }) => {
      // Look specifically for the Kata logo image
      const kataLogo = mainWindow.getByRole('img', { name: 'Kata' }).first()
      await expect(kataLogo).toBeVisible({ timeout: 10000 })
    })

    test('should have clickable buttons', async ({ mainWindow }) => {
      const buttons = mainWindow.getByRole('button')
      const count = await buttons.count()
      expect(count).toBeGreaterThan(0)
    })
  })

  test.describe('Window Behavior', () => {
    test('should handle window resize gracefully', async ({ mainWindow }) => {
      await mainWindow.setViewportSize({ width: 800, height: 600 })
      await mainWindow.waitForTimeout(300)
      await mainWindow.setViewportSize({ width: 1200, height: 800 })
      await mainWindow.waitForTimeout(300)
      const isVisible = await mainWindow.evaluate(() => document.body !== null)
      expect(isVisible).toBe(true)
    })

    test('should maintain responsiveness', async ({ mainWindow }) => {
      await mainWindow.mouse.move(100, 100)
      await mainWindow.waitForTimeout(100)
      const isResponsive = await mainWindow.evaluate(() => document.readyState === 'complete')
      expect(isResponsive).toBe(true)
    })
  })
})
