import { expect, test } from '../fixtures/electron.fixture'

test.describe('Symphony runtime lifecycle', () => {
  test.use({ symphonyMockMode: 'ready' })

  test('supports start, restart, and stop from settings panel', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()

    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Idle')

    await readyWindow.getByTestId('symphony-start-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Ready')

    await readyWindow.getByTestId('symphony-stop-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Stopped')

    await readyWindow.getByTestId('symphony-start-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Ready')

    await readyWindow.getByTestId('symphony-restart-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Ready')

    await expect(readyWindow.getByTestId('symphony-status-badge')).toContainText('Symphony: Ready')
  })
})

test.describe('Symphony config error state', () => {
  test.use({ symphonyMockMode: 'config_error' })

  test('renders config error guidance', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()

    await readyWindow.getByTestId('symphony-start-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Config Error')
    await expect(readyWindow.getByTestId('symphony-runtime-error')).toContainText('CONFIG_MISSING')
    await expect(readyWindow.getByTestId('symphony-config-guidance')).toBeVisible()
  })
})

test.describe('Symphony readiness failure state', () => {
  test.use({ symphonyMockMode: 'readiness_error' })

  test('renders readiness failure state', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()

    await readyWindow.getByTestId('symphony-start-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Failed')
    await expect(readyWindow.getByTestId('symphony-runtime-error')).toContainText('READINESS_FAILED')
  })
})
