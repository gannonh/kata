import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/electron.fixture'

const UAT_EVIDENCE_DIR = path.join(process.cwd(), 'docs', 'uat', 'm001')

async function seedWorkspaceSkill(workspaceDir: string): Promise<void> {
  const skillDir = path.join(workspaceDir, '.agents', 'skills', 's04-proof-skill')
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    ['---', 'name: s04-proof-skill', 'description: workspace skill fixture for slash e2e', '---'].join('\n'),
    'utf8',
  )
}

async function captureEvidence(page: Page, filename: string): Promise<void> {
  await mkdir(UAT_EVIDENCE_DIR, { recursive: true })
  await page.screenshot({
    path: path.join(UAT_EVIDENCE_DIR, filename),
    fullPage: false,
  })
}

test.describe('slash autocomplete e2e', () => {
  test('[R001][R002][R005][R007] slash trigger, builtin discovery, navigation, and Esc dismissal', async ({
    readyWindow,
    workspaceDir,
  }) => {
    await seedWorkspaceSkill(workspaceDir)

    // refreshSkillCache debounces within 2s; wait so cache expiry cannot hide new workspace state.
    await readyWindow.waitForTimeout(2200)

    const input = readyWindow.getByTestId('chat-input')

    await input.fill('/')

    await expect(readyWindow.getByTestId('command-suggestion-dropdown')).toBeVisible()
    await expect(readyWindow.getByRole('option', { name: '/kata' })).toBeVisible()
    await captureEvidence(readyWindow, 's04-01-slash-trigger.png')

    const selectedBefore =
      (await readyWindow.locator('[role="option"][aria-selected="true"]').first().textContent()) ?? ''

    await readyWindow.keyboard.press('ArrowDown')

    await expect
      .poll(async () =>
        (await readyWindow.locator('[role="option"][aria-selected="true"]').first().textContent()) ?? '',
      )
      .not.toBe(selectedBefore)

    await captureEvidence(readyWindow, 's04-02-arrow-navigation.png')

    await readyWindow.keyboard.press('Escape')
    await expect(readyWindow.getByTestId('command-suggestion-dropdown')).toHaveCount(0)
    await expect(input).toHaveValue('/')
    await captureEvidence(readyWindow, 's04-03-escape-dismiss.png')
  })

  test('[R006] Tab/Enter accept slash suggestions with trailing space insertion', async ({ readyWindow }) => {
    const input = readyWindow.getByTestId('chat-input')

    await input.fill('/ka')
    await expect(readyWindow.getByTestId('command-suggestion-dropdown')).toBeVisible()

    await readyWindow.keyboard.press('Tab')

    await expect(input).toHaveValue('/kata ')
    await expect(readyWindow.getByTestId('command-suggestion-dropdown')).toHaveCount(0)
    await captureEvidence(readyWindow, 's04-04-tab-accept.png')

    await input.fill('/ka')
    await readyWindow.keyboard.press('Enter')

    await expect(input).toHaveValue('/kata ')
    await expect(readyWindow.getByTestId('command-suggestion-dropdown')).toHaveCount(0)
    await captureEvidence(readyWindow, 's04-05-enter-accept.png')
  })
})
