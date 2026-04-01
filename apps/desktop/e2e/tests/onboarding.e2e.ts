import { test, expect } from '../fixtures/electron.fixture'
import type { ElectronApplication, Page } from '@playwright/test'

async function getOnboardingWindow(electronApp: ElectronApplication): Promise<Page> {
  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('#root', { timeout: 20_000 })
  await expect(window.getByText('Onboarding')).toBeVisible()
  return window
}

async function completeOnboarding(window: Page): Promise<void> {
  await window.getByRole('button', { name: /Get started/i }).click()
  await window.getByRole('button', { name: /OpenAI/i }).first().click()
  await window.getByRole('button', { name: /^Continue$/i }).click()
  await window.getByRole('button', { name: /Skip for now/i }).click()
  await window.getByRole('button', { name: /Start chatting/i }).click()
}

test.describe('Onboarding wizard', () => {
  test('appears on first launch with welcome content', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await expect(window.getByText('Welcome to your coding co-pilot')).toBeVisible()
    await expect(window.getByText('Step 1 of 4').first()).toBeVisible()
    await expect(window.getByRole('button', { name: /Get started/i })).toBeVisible()
  })

  test('navigates from step 1 to provider selection', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await window.getByRole('button', { name: /Get started/i }).click()

    await expect(window.getByText('Step 2 of 4').first()).toBeVisible()
    await expect(window.getByRole('heading', { name: /Choose a provider/i })).toBeVisible()
  })

  test('shows provider cards on step 2', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await window.getByRole('button', { name: /Get started/i }).click()

    await expect(window.getByRole('button', { name: /Anthropic/i })).toBeVisible()
    await expect(window.getByRole('button', { name: /OpenAI/i })).toBeVisible()
    await expect(window.getByRole('button', { name: /Google/i })).toBeVisible()
    await expect(window.getByRole('button', { name: /Mistral/i })).toBeVisible()
  })

  test('can navigate through all 4 onboarding steps', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await expect(window.getByText('Step 1 of 4').first()).toBeVisible()
    await window.getByRole('button', { name: /Get started/i }).click()

    await expect(window.getByText('Step 2 of 4').first()).toBeVisible()
    await window.getByRole('button', { name: /^Continue$/i }).click()

    await expect(window.getByText('Step 3 of 4').first()).toBeVisible()
    await window.getByRole('button', { name: /Skip for now/i }).click()

    await expect(window.getByText('Step 4 of 4').first()).toBeVisible()
    await expect(window.getByRole('button', { name: /Start chatting/i })).toBeVisible()
  })

  test("doesn't reappear after completion", async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await completeOnboarding(window)

    await expect(window.getByRole('button', { name: /\+ New Session/i })).toBeVisible()
    await expect(window.getByText('Onboarding')).toHaveCount(0)

    const onboardingStorage = await window.evaluate(() =>
      window.localStorage.getItem('kata-desktop:onboarding-complete'),
    )
    expect(onboardingStorage).toBe('true')

    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.getByRole('button', { name: /\+ New Session/i })).toBeVisible()
    await expect(window.getByText('Onboarding')).toHaveCount(0)
  })
})
