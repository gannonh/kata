import { expect, startMockWorkflowRuntime, test } from '../fixtures/electron.fixture'

test.describe('m006 integrated beta acceptance — happy path', () => {
  test.use({
    symphonyMockMode: 'assembled_healthy',
    firstRunProfileMode: 'seeded_auth',
    m006IntegratedScenario: 'happy_path',
  })

  test('happy path: startup → onboarding → plan → execute → symphony → mcp → shutdown stays coherent', async ({
    readyWindow,
  }) => {
    await expect(readyWindow.getByTestId('chat-input')).toBeVisible()

    await startMockWorkflowRuntime(readyWindow)

    await readyWindow.getByTestId('chat-input').fill('/kata plan integrated beta acceptance gate')
    await readyWindow.getByRole('button', { name: /^Send$/i }).click()

    await readyWindow.getByRole('button', { name: /Open planning view/i }).click()

    await expect(readyWindow.getByRole('heading', { name: /Planning View/i })).toBeVisible()
    await expect(readyWindow.getByRole('tab', { name: /\[S04\]/i })).toBeVisible({ timeout: 10_000 })
    await expect(readyWindow.getByRole('tab', { name: /\[S03\]/i })).toBeVisible({ timeout: 10_000 })

    await readyWindow.getByRole('button', { name: /Close planning view/i }).click()
    await expect(readyWindow.getByRole('heading', { name: /Planning View/i })).toHaveCount(0)
    await expect(readyWindow.getByTestId('workflow-kanban-pane')).toBeVisible()
    await expect(readyWindow.getByTestId('kanban-column-in_progress')).toBeVisible()
    await expect(readyWindow.getByTestId('kanban-column-todo')).toBeVisible()

    await readyWindow.getByRole('button', { name: 'Settings', exact: true }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText(/Ready/i)
    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText(/connected/i)

    await readyWindow.getByRole('tab', { name: /^MCP$/i }).click()
    await expect(readyWindow.getByTestId('mcp-settings-panel')).toBeVisible()
    await expect(readyWindow.getByTestId('mcp-server-row-packaged-beta-fixture')).toBeVisible()

    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()
    await readyWindow.getByTestId('symphony-stop-button').click()
    await expect(readyWindow.getByTestId('symphony-phase-badge')).toContainText(/Stopped|Idle/i)
  })
})

test.describe('m006 integrated beta acceptance — recovery path', () => {
  test.use({
    symphonyMockMode: 'assembled_failure_recovery',
    chatRuntimeFaultMode: 'process_crash_once',
    firstRunProfileMode: 'seeded_auth',
    m006IntegratedScenario: 'none',
  })

  test('recovery path: subprocess crash and symphony disconnect recover without app restart', async ({
    readyWindow,
  }) => {
    await startMockWorkflowRuntime(readyWindow)

    const firstPrompt = 'trigger subprocess crash recovery checkpoint'
    await readyWindow.getByTestId('chat-input').fill(firstPrompt)
    await readyWindow.getByRole('button', { name: /^Send$/i }).click()

    await expect(readyWindow.getByTestId('reliability-banner')).toBeVisible()
    await expect(readyWindow.getByTestId('reliability-banner')).toContainText(/Chat runtime/i)
    await expect(readyWindow.getByTestId('reliability-banner')).toContainText(/Process/i)

    const chatFailureSignal = await readyWindow.evaluate(async () => {
      const snapshot = await window.api.reliability.getStatus()
      const chatSurface = snapshot.snapshot.surfaces.find((surface) => surface.sourceSurface === 'chat_runtime')
      return {
        status: chatSurface?.status ?? null,
        failureClass: chatSurface?.signal?.class ?? null,
        recoveryAction: chatSurface?.signal?.recoveryAction ?? null,
      }
    })

    expect(chatFailureSignal.status).toBe('degraded')
    expect(chatFailureSignal.failureClass).toBe('process')
    expect(chatFailureSignal.recoveryAction).toBe('restart_process')

    await readyWindow.getByTestId('reliability-banner-recover').click()
    await expect(readyWindow.getByTestId('reliability-banner')).toHaveCount(0)

    const secondPrompt = 'confirm chat resumed after recovery'
    await readyWindow.getByTestId('chat-input').fill(secondPrompt)
    await readyWindow.getByRole('button', { name: /^Send$/i }).click()

    await expect(readyWindow.locator('article').filter({ hasText: firstPrompt }).first()).toBeVisible()
    await expect(readyWindow.locator('article').filter({ hasText: secondPrompt }).first()).toBeVisible()

    await readyWindow.getByRole('button', { name: 'Settings', exact: true }).click()
    await readyWindow.getByRole('tab', { name: /^Symphony$/i }).click()
    await readyWindow.getByTestId('symphony-dashboard-refresh').click()

    await expect(readyWindow.getByTestId('symphony-dashboard-connection')).toContainText(/disconnected/i)
    await expect(readyWindow.getByTestId('symphony-dashboard-reliability')).toBeVisible()

    await readyWindow.getByRole('button', { name: /^Close$/i }).click()

    await readyWindow.getByTestId('kanban-refresh-board').click()
    await expect(readyWindow.getByTestId('board-state-notice-symphony-stale')).toBeVisible()
    await expect(readyWindow.getByTestId('kanban-column-in_progress')).toContainText('KAT-2337')

    const symphonyFailureSignal = await readyWindow.evaluate(async () => {
      const snapshot = await window.api.reliability.getStatus()
      const symphonySurface = snapshot.snapshot.surfaces.find((surface) => surface.sourceSurface === 'symphony')
      return {
        symphonyStatus: symphonySurface?.status ?? null,
        symphonyClass: symphonySurface?.signal?.class ?? null,
        symphonyAction: symphonySurface?.signal?.recoveryAction ?? null,
      }
    })

    expect(symphonyFailureSignal.symphonyStatus).toBe('degraded')
    expect(symphonyFailureSignal.symphonyClass).toBe('network')
    expect(symphonyFailureSignal.symphonyAction).toBe('reconnect')

    await readyWindow.getByTestId('reliability-banner-recover').click()
    await readyWindow.getByTestId('kanban-refresh-board').click()

    await expect(readyWindow.getByTestId('reliability-banner')).toHaveCount(0)
    await expect(readyWindow.getByTestId('board-state-notice-symphony-stale')).toHaveCount(0)
    await expect(readyWindow.getByTestId('kanban-column-in_progress')).toContainText('KAT-2337')
    await expect(readyWindow.getByTestId('chat-input')).toBeEnabled()
  })
})
