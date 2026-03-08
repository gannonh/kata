/**
 * E2E-05: Session lifecycle tests
 * Create, rename, switch, delete sessions with persistence verification.
 */
import { test, expect, DEMO_CONFIG_DIR } from '../../fixtures/live.fixture'
import { _electron as electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { goToAllChats } from './helpers'
import { ChatPage } from '../../page-objects/ChatPage'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test.describe('Live Session Lifecycle', () => {
  test.setTimeout(120_000)

  test('E2E-05: create new session and verify it persists', async ({ mainWindow, electronApp }) => {
    await goToAllChats(mainWindow)

    const existingSession = mainWindow.locator('[data-testid="session-list-item-button"]').first()
    await expect(existingSession).toBeVisible({ timeout: 5000 })
    await existingSession.click()

    const newChatButton = mainWindow.locator('[data-tutorial="new-chat-button"]')
    await expect(newChatButton).toBeVisible({ timeout: 10000 })
    await newChatButton.click()

    await expect(mainWindow.locator('[data-tutorial="chat-input"]')).toBeVisible({ timeout: 10000 })
    const chatPage = new ChatPage(mainWindow)
    const uniquePrompt = `persist-live-e2e-${Date.now()}`
    await chatPage.sendMessage(uniquePrompt)

    const createdSession = mainWindow
      .locator('[data-testid="session-list-item-button"]')
      .filter({ hasText: uniquePrompt })
      .first()
    await expect(createdSession).toBeVisible({ timeout: 15000 })

    await mainWindow.waitForTimeout(1000)
    await electronApp.close()

    const app = await electron.launch({
      args: [
        path.join(__dirname, '../../../dist/main.cjs'),
        `--user-data-dir=${DEMO_CONFIG_DIR}`,
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        KATA_CONFIG_DIR: DEMO_CONFIG_DIR,
      },
      timeout: 30_000,
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(3000)
    await goToAllChats(window)

    const persistedSession = window
      .locator('[data-testid="session-list-item-button"]')
      .filter({ hasText: uniquePrompt })
      .first()
    await expect(persistedSession).toBeVisible({ timeout: 15000 })
    await persistedSession.click()
    await expect(window.getByText(new RegExp(escapeRegExp(uniquePrompt), 'i')).first()).toBeVisible({
      timeout: 15000,
    })

    await app.close()
  })
})
