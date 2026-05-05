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

    await expect(window.getByText('Agentic Development Environment')).toBeVisible()
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

    await expect(window.getByRole('button', { name: /New Session/i })).toBeVisible()
    await expect(window.getByText('Onboarding')).toHaveCount(0)

    const onboardingStorage = await window.evaluate(() =>
      window.localStorage.getItem('kata-desktop:onboarding-complete'),
    )
    expect(onboardingStorage).toBe('true')

    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.getByRole('button', { name: /New Session/i })).toBeVisible()
    await expect(window.getByText('Onboarding')).toHaveCount(0)
  })
})

test.describe('Onboarding provider consistency', () => {
  test.use({ firstRunProfileMode: 'seeded_auth' })

  test('provider consistency keeps seeded providers marked as configured', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await window.getByRole('button', { name: /Get started/i }).click()
    const openAiCard = window.getByRole('button', { name: /OpenAI/i }).first()

    await expect(openAiCard.getByText(/Configured/i)).toBeVisible()
  })

  test('configured provider skips key entry and advances to completion', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    // Step 1 → 2: "Get started"
    await window.getByRole('button', { name: /Get started/i }).click()
    await expect(window.getByText('Step 2 of 4').first()).toBeVisible()

    // Select the pre-configured OpenAI provider (seeded with valid key)
    const openAiCard = window.getByRole('button', { name: /OpenAI/i }).first()
    await openAiCard.click()
    await expect(openAiCard.getByText(/Configured/i)).toBeVisible()

    // Click Continue — should skip key entry (step 3) and go to completion (step 4)
    await window.getByRole('button', { name: /^Continue$/i }).click()

    // Should be on step 4 (completion), NOT step 3 (key entry)
    await expect(window.getByText('Step 4 of 4').first()).toBeVisible({ timeout: 5_000 })
    await expect(window.getByText('Step 3 of 4')).toHaveCount(0)
    await expect(window.getByRole('button', { name: /Start chatting/i })).toBeVisible()
  })
})

test.describe('Onboarding recovery messaging', () => {
  test.use({ firstRunProfileMode: 'clean' })

  test('recovery guidance appears when no provider key is configured', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await window.getByRole('button', { name: /Get started/i }).click()
    await expect(window.getByTestId('onboarding-auth-guidance')).toBeVisible()
    await expect(window.getByTestId('onboarding-auth-guidance')).toContainText(/Recovery/i)
  })
})
