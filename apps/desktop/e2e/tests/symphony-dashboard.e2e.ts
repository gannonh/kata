import { expect, test } from '../fixtures/electron.fixture'

test.describe('Symphony dashboard live surface', () => {
  test.use({ symphonyMockMode: 'ready' })

  test('renders worker summary and supports inline escalation response', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()

    await readyWindow.getByTestId('symphony-start-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText('Ready')

    await expect(readyWindow.getByTestId('symphony-dashboard-panel')).toBeVisible()
    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText('connected')
    await expect(readyWindow.getByTestId('symphony-summary-workers')).toContainText('1')
    await expect(readyWindow.getByTestId('symphony-summary-escalations')).toContainText('1')

    await readyWindow.getByTestId('symphony-escalation-input-req-123').fill('Use the stale-state wording from D023.')
    await readyWindow.getByTestId('symphony-escalation-submit-req-123').click()

    await expect(readyWindow.getByTestId('symphony-escalation-result')).toContainText('Escalation response sent')
    await expect(readyWindow.getByTestId('symphony-escalation-empty')).toBeVisible()
  })
})

test.describe('Symphony dashboard reconnect state', () => {
  test.use({ symphonyMockMode: 'reconnecting' })

  test('surfaces reconnecting connection feedback', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()

    await readyWindow.getByTestId('symphony-start-button').click()

    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText('reconnecting')
    await expect(readyWindow.getByTestId('symphony-dashboard-error')).toContainText('Mocked reconnect in progress.')
  })
})

test.describe('Symphony dashboard escalation failure state', () => {
  test.use({ symphonyMockMode: 'response_failure' })

  test('shows failed escalation response state', async ({ readyWindow }) => {
    await readyWindow.getByRole('button', { name: /Settings/i }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()

    await readyWindow.getByTestId('symphony-start-button').click()

    await readyWindow.getByTestId('symphony-escalation-input-req-123').fill('Please continue with best effort.')
    await readyWindow.getByTestId('symphony-escalation-submit-req-123').click()

    await expect(readyWindow.getByTestId('symphony-escalation-result')).toContainText('Escalation response failed')
    await expect(readyWindow.getByTestId('symphony-summary-escalations')).toContainText('1')
  })
})
