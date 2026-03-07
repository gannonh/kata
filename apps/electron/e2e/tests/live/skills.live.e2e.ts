/**
 * Skills Live E2E Tests
 * Tests skill loading, display, and management.
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live Skills', () => {
  test.setTimeout(60_000)

  test('skills panel is accessible from sidebar', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')
    await mainWindow.waitForTimeout(2000)

    // Look for skills section in sidebar
    const skillsSection = mainWindow.getByText(/skills/i)
      .or(mainWindow.locator('[class*="skill"]'))

    const hasSkills = await skillsSection.first().isVisible({ timeout: 5000 }).catch(() => false)

    // Skills section should be visible in sidebar
    expect(hasSkills).toBeTruthy()
  })

  test('skills list shows workspace skills', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Navigate to skills panel/page
    const skillsNav = mainWindow.getByRole('button', { name: /skills/i })
      .or(mainWindow.getByText(/skills/i).first())

    if (await skillsNav.isVisible({ timeout: 5000 })) {
      await skillsNav.click()
      await mainWindow.waitForTimeout(1000)

      // Look for skill items or empty state
      const skillItem = mainWindow.locator('[class*="skill-item"]')
        .or(mainWindow.locator('[class*="skill"]'))
      const emptyState = mainWindow.getByText(/no skills|add skill/i)

      const hasItems = await skillItem.first().isVisible({ timeout: 3000 }).catch(() => false)
      const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false)

      // Should see either skills or empty state
      expect(hasItems || hasEmpty).toBeTruthy()
    }
  })

  test('add skill button exists', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Navigate to skills - use the sidebar nav button which has format "Skills N"
    const skillsNav = mainWindow.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: /^Skills \d+$/i })

    if (await skillsNav.isVisible({ timeout: 5000 })) {
      await skillsNav.click()
      await mainWindow.waitForTimeout(1000)

      // Look for add skill button via data-tutorial attribute
      const addButton = mainWindow.locator('[data-tutorial="add-skill-button"]')
        .or(mainWindow.getByRole('button', { name: /add skill/i }))

      const hasAdd = await addButton.first().isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasAdd).toBeTruthy()
    }
  })

  test('skill info page loads when skill selected', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Navigate to skills - use the sidebar nav button which has format "Skills N"
    const skillsNav = mainWindow.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: /^Skills \d+$/i })

    if (await skillsNav.isVisible({ timeout: 5000 })) {
      await skillsNav.click()
      await mainWindow.waitForTimeout(1000)

      // Look for any skill item to click - skill items are in the skills list panel
      // They have a description text that identifies them
      const skillItem = mainWindow.locator('button').filter({ hasText: /Use this skill when/i }).first()

      if (await skillItem.isVisible({ timeout: 3000 })) {
        await skillItem.click()
        await mainWindow.waitForTimeout(1000)

        // Should see skill info/details
        const skillInfo = mainWindow.getByText(/description|instructions|permissions/i)
        const hasInfo = await skillInfo.first().isVisible({ timeout: 3000 }).catch(() => false)

        expect(hasInfo).toBeTruthy()
      }
    }
  })
})
