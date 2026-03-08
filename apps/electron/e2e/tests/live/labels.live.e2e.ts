/**
 * Labels Live E2E Tests
 * Tests label management and application to sessions.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { openSettingsSubpage } from './helpers'

test.describe('Live Labels', () => {
  test.setTimeout(60_000)

  test('labels settings page shows label configuration', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'labels')

    await expect(mainWindow.getByRole('heading', { name: 'Labels', level: 1 })).toBeVisible({ timeout: 5000 })
    await expect(
      mainWindow.getByText(/Label Hierarchy|No labels configured\./i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('labels settings page explains auto-apply rules', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'labels')

    await expect(mainWindow.getByText(/Auto-Apply Rules/i)).toBeVisible({ timeout: 5000 })
    await expect(mainWindow.getByText(/regex patterns that automatically apply labels/i)).toBeVisible({ timeout: 5000 })
  })
})
