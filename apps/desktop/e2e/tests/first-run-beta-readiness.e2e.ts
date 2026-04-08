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
  const getStarted = window.getByRole('button', { name: /Get started/i })
  if (await getStarted.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await getStarted.click()
  }

  const openAiCard = window.getByRole('button', { name: /OpenAI/i }).first()
  if (await openAiCard.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await openAiCard.click()
  }

  const continueButton = window.getByRole('button', { name: /^Continue$/i })
  if (await continueButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await continueButton.click()
  }

  const skipForNow = window.getByRole('button', { name: /Skip for now/i })
  if (await skipForNow.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await skipForNow.click()
  }

  const startChatting = window.getByRole('button', { name: /Start chatting/i })
  if (await startChatting.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await startChatting.click()
  }
}

test.describe('first-run beta readiness', () => {
  test.use({ firstRunProfileMode: 'seeded_auth' })

  test('clean productive turn passes first_turn checkpoint when auth + model + startup are ready', async ({
    electronApp,
  }) => {
    const window = await getOnboardingWindow(electronApp)

    await window.getByRole('button', { name: /Get started/i }).click()
    const openAiCard = window.getByRole('button', { name: /OpenAI/i }).first()
    await expect(openAiCard.getByText(/Configured/i)).toBeVisible()

    await completeOnboarding(window)

    await expect(window.getByRole('button', { name: /New Session/i })).toBeVisible()

    await window.evaluate(async () => {
      await window.api.setModel('openai/gpt-4.1')
    })

    await window.getByPlaceholder('Ask Kata to help with your code...').fill('Summarize readiness checkpoints')
    await window.getByRole('button', { name: /^Send$/i }).click()

    await expect
      .poll(async () => {
        return await window.evaluate(async () => {
          const status = await window.api.reliability.getStatus()
          return status.snapshot.firstRunReadiness?.checkpoints.first_turn.status ?? 'missing'
        })
      })
      .toBe('pass')
  })
})

test.describe('first-run failure and recovery guidance', () => {
  test('clean profile surfaces auth failure with actionable recovery controls', async ({ electronApp }) => {
    const window = await getOnboardingWindow(electronApp)

    await window.getByRole('button', { name: /Get started/i }).click()

    await expect(window.getByTestId('onboarding-auth-guidance')).toBeVisible()
    await expect(window.getByTestId('onboarding-auth-guidance')).toContainText(
      /No providers are configured|Add a valid/i,
    )

    await window.getByRole('button', { name: /OpenAI/i }).first().click()
    await window.getByRole('button', { name: /^Continue$/i }).click()

    await expect(window.getByTestId('onboarding-key-auth-guidance')).toBeVisible()
    await expect(window.getByRole('button', { name: /Validate & Save/i })).toBeVisible()
    await expect(window.getByRole('button', { name: /Skip for now/i })).toBeVisible()

    await window.getByRole('button', { name: /Skip for now/i }).click()
    await expect(window.getByTestId('onboarding-checkpoint-summary')).toContainText(/Auth:\s*Fail/i)
  })

  test.describe('startup degradation', () => {
    test.use({ firstRunProfileMode: 'seeded_auth', firstRunStartupMode: 'binary_missing' })

    test('startup degradation is legible in model selector and settings guidance', async ({ electronApp }) => {
      const window = await getOnboardingWindow(electronApp)
      await completeOnboarding(window)

      await expect(window.getByTestId('model-selector-readiness-notice')).toBeVisible()
      await expect(window.getByTestId('model-selector-readiness-notice')).toContainText(/runtime/i)

      await window.getByRole('button', { name: /Settings/i }).click()
      await expect(window.getByTestId('settings-startup-guidance')).toBeVisible()
    })
  })
})
