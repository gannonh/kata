import { test, expect } from '../fixtures/electron.fixture'

test.describe('App shell', () => {
  test('shows Kata Desktop branding', async ({ mainWindow }) => {
    await expect(mainWindow.getByRole('heading', { name: /Kata Desktop/i })).toBeVisible()
  })

  test('shows session sidebar with new session action', async ({ mainWindow }) => {
    await expect(mainWindow.getByRole('button', { name: /New Session/i })).toBeVisible()
  })

  test('shows chat input with placeholder text', async ({ mainWindow }) => {
    await expect(mainWindow.getByPlaceholder('Ask Kata to help with your code...')).toBeVisible()
  })

  test('does not render the legacy permission mode selector', async ({ mainWindow }) => {
    await expect(mainWindow.getByText(/Permission mode/i)).toHaveCount(0)
    await expect(mainWindow.getByLabel(/Explore/i)).toHaveCount(0)
    await expect(mainWindow.getByLabel(/Ask/i)).toHaveCount(0)
    await expect(mainWindow.getByLabel(/Auto/i)).toHaveCount(0)
  })

  test('shows workflow board pane in right pane', async ({ mainWindow }) => {
    await expect(mainWindow.getByRole('heading', { name: /Workflow Board/i })).toBeVisible()
    await expect(mainWindow.getByTestId('workflow-board-status')).toBeVisible()
  })

  test('opens settings panel from the settings button', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()
    await expect(readyWindow.getByRole('heading', { name: /^Settings$/i })).toBeVisible()
  })

  test('shows Providers, MCP, General, and Appearance settings tabs', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()

    await expect(readyWindow.getByRole('tab', { name: /^Providers$/i })).toBeVisible()
    await expect(readyWindow.getByRole('tab', { name: /^MCP$/i })).toBeVisible()
    await expect(readyWindow.getByRole('tab', { name: /^General$/i })).toBeVisible()
    await expect(readyWindow.getByRole('tab', { name: /^Appearance$/i })).toBeVisible()
  })
})
