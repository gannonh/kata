import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/electron.fixture'

async function openSymphonySettings(window: Page) {
  await window.getByRole('button', { name: /Settings/i }).click()
  await window.getByRole('tab', { name: /^Symphony$/i }).click()
}

async function startRuntimeFromUi(window: Page) {
  await openSymphonySettings(window)
  await window.getByTestId('symphony-start-button').click()
  await expect(window.getByTestId('symphony-phase-badge')).toContainText('Ready')
}

async function closeSettings(window: Page) {
  await window.getByRole('button', { name: /^Close$/i }).click()
  await expect(window.getByRole('dialog', { name: /Settings/i })).toBeHidden()
}

test.describe('scenario control', () => {
  test.use({ symphonyMockMode: 'assembled_healthy' })

  test('keeps runtime, dashboard, and board aligned for assembled scenario control', async ({ readyWindow }) => {
    await startRuntimeFromUi(readyWindow)

    await expect(readyWindow.getByTestId('symphony-dashboard-panel')).toBeVisible()
    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText('connected')
    await expect(readyWindow.getByTestId('symphony-summary-workers')).toContainText('2')
    await expect(readyWindow.getByTestId('symphony-worker-table').getByText('KAT-2337')).toBeVisible()

    await closeSettings(readyWindow)

    await expect(readyWindow.getByRole('heading', { name: /Workflow Board/i })).toBeVisible()
    await readyWindow.getByRole('button', { name: /Refresh workflow board/i }).click()

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Symphony: live')
    await expect(readyWindow.getByText(/KAT-2337 · \[S04\]/i)).toBeVisible()
    await expect(readyWindow.getByTestId('slice-symphony-KAT-2337')).toContainText('Execution: edit')
  })
})

// This suite intentionally overlaps startup assertions with `scenario control`.
// `scenario control` validates integrated test harness alignment (runtime + dashboard + board),
// while this suite proves the user-visible escalation response → kanban convergence contract.
test.describe('healthy assembled flow', () => {
  test.use({ symphonyMockMode: 'assembled_healthy' })

  test('proves runtime to dashboard to escalation response to board convergence', async ({ readyWindow }) => {
    await startRuntimeFromUi(readyWindow)

    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText('connected')
    await expect(readyWindow.getByTestId('symphony-summary-escalations')).toContainText('1')

    await readyWindow.getByTestId('symphony-escalation-input-req-assembled-1').fill('Acknowledge and move to Agent Review.')
    await readyWindow.getByTestId('symphony-escalation-submit-req-assembled-1').click()

    await expect(readyWindow.getByTestId('symphony-escalation-result')).toContainText('Escalation response sent')
    await expect(readyWindow.getByTestId('symphony-summary-escalations')).toContainText('0')
    await expect(readyWindow.getByTestId('symphony-worker-table').getByText('KAT-2337')).toBeVisible()

    await closeSettings(readyWindow)

    await readyWindow.getByRole('button', { name: /Refresh workflow board/i }).click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Symphony: live')
    await expect(readyWindow.getByTestId('slice-symphony-KAT-2337')).toContainText('Execution: idle')
  })
})

test.describe('failure-path truthfulness', () => {
  test.use({ symphonyMockMode: 'assembled_failure_recovery' })

  test('surfaces disconnect truthfully and recovers without app restart', async ({ readyWindow }) => {
    await startRuntimeFromUi(readyWindow)

    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText('connected')
    await closeSettings(readyWindow)

    await openSymphonySettings(readyWindow)

    await readyWindow.getByTestId('symphony-dashboard-refresh').click()
    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText('disconnected')
    await expect(readyWindow.getByTestId('symphony-dashboard-error')).toContainText('Mocked runtime disconnect.')

    await closeSettings(readyWindow)

    await readyWindow.getByRole('button', { name: /Refresh workflow board/i }).click()
    await expect(readyWindow.getByText(/KAT-2337 · \[S04\]/i)).toBeVisible()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Symphony: disconnected')
    await expect(readyWindow.getByTestId('slice-symphony-KAT-2337')).toContainText('Symphony runtime disconnected')

    await openSymphonySettings(readyWindow)
    await readyWindow.getByTestId('symphony-dashboard-refresh').click()
    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText('connected')

    await closeSettings(readyWindow)

    await readyWindow.getByRole('button', { name: /Refresh workflow board/i }).click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Symphony: live')
  })
})
