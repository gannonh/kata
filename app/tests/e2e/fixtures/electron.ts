import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page
} from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const mainEntry = path.resolve(__dirname, '../../../dist/main/index.js')

type ElectronFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const launchArgs = process.env.CI
      ? ['--no-sandbox', '--disable-setuid-sandbox', mainEntry]
      : [mainEntry]
    const electronApp = await electron.launch({ args: launchArgs })

    await use(electronApp)

    await electronApp.close().catch(() => {
      // Electron may have already exited from a crash during the test.
    })
  },
  appWindow: async ({ electronApp }, use) => {
    const appWindow = await electronApp.firstWindow()
    await appWindow.waitForLoadState('load')
    await appWindow.waitForSelector('#root > *', { state: 'attached' })

    await use(appWindow)
  }
})

export { expect }
