import { expect, type Page } from '@playwright/test'

function mainNavigation(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation' })
}

function subNavigation(page: Page) {
  return page.getByRole('navigation', { name: 'Sub navigation' })
}

export async function goToAllChats(page: Page): Promise<void> {
  const button = mainNavigation(page).getByRole('button', { name: /^All Projects\b/i })
  await expect(button).toBeVisible({ timeout: 10000 })
  await button.click()
}

export async function ensureChatReady(page: Page): Promise<void> {
  await goToAllChats(page)

  const sessionButtons = page.locator('[data-testid="session-list-item-button"]')
  const sessionCount = await sessionButtons.count()

  if (sessionCount > 0) {
    await sessionButtons.first().click()
  } else {
    const newProjectButton = page.locator('[data-tutorial="new-chat-button"]')
    await expect(newProjectButton).toBeVisible({ timeout: 10000 })
    await newProjectButton.click()
  }

  await expect(page.locator('[data-tutorial="chat-input"]')).toBeVisible({ timeout: 10000 })
}

const settingsButtonNames = {
  app: /^App Notifications, API connection, updates$/i,
  appearance: /^Appearance Theme, font, tool icons$/i,
  workspace: /^Workspace Model, mode cycling, advanced$/i,
  channels: /^Channels Daemon, Slack, WhatsApp channels$/i,
  permissions: /^Permissions Allowed commands in Explore mode$/i,
  labels: /^Labels Label hierarchy and auto-apply rules$/i,
  shortcuts: /^Shortcuts Keyboard shortcuts reference$/i,
  preferences: /^Preferences Your personal preferences$/i,
} as const

export async function openSettingsSubpage(
  page: Page,
  subpage: keyof typeof settingsButtonNames = 'app'
): Promise<void> {
  const settingsNavButton = mainNavigation(page).getByRole('button', { name: /^Settings$/i })
  await expect(settingsNavButton).toBeVisible({ timeout: 10000 })
  await settingsNavButton.click()

  await expect(page.getByRole('heading', { name: /^Settings$/i, level: 1 })).toBeVisible({ timeout: 10000 })

  const targetButton = page.getByRole('button', { name: settingsButtonNames[subpage] })
  await expect(targetButton).toBeVisible({ timeout: 5000 })
  await targetButton.click()
}

const sourceNavNames = {
  sources: /^Sources\b/i,
  apis: /^APIs\b/i,
  mcps: /^MCPs\b/i,
  local: /^Local Folders\b/i,
} as const

export async function openSourceFilter(
  page: Page,
  filter: keyof typeof sourceNavNames = 'sources'
): Promise<void> {
  const sourcesButton = mainNavigation(page).getByRole('button', { name: sourceNavNames.sources })
  await expect(sourcesButton).toBeVisible({ timeout: 10000 })
  await sourcesButton.click()

  if (filter !== 'sources') {
    const filterButton = subNavigation(page).getByRole('button', { name: sourceNavNames[filter] })
    await expect(filterButton).toBeVisible({ timeout: 5000 })
    await filterButton.click()
  }
}

export async function openFlaggedChats(page: Page): Promise<void> {
  const button = mainNavigation(page).getByRole('button', { name: /^Flagged\b/i })
  await expect(button).toBeVisible({ timeout: 10000 })
  await button.click()
}
