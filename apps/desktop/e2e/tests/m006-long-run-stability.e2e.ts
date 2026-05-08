import type { Page } from '@playwright/test'
import type { StabilitySnapshot } from '@shared/types'
import { expect, startMockWorkflowRuntime, test } from '../fixtures/electron.fixture'

async function readStabilitySnapshot(page: Page): Promise<StabilitySnapshot> {
  return page.evaluate(async () => {
    const response = await window.api.reliability.getStabilitySnapshot()
    if (!response.success) {
      throw new Error('Failed to load stability snapshot')
    }

    return response.snapshot
  })
}

test.describe('M006 long-run stability baseline', () => {
  test.use({
    symphonyMockMode: 'assembled_failure_recovery',
  })

  test('tracks threshold breach during reconnect failure and clears after recovery', async ({
    readyWindow,
  }) => {
    await startMockWorkflowRuntime(readyWindow)

    await readyWindow.evaluate(async () => {
      await window.api.workflow.setScope({
        scopeKey: 'workspace:e2e::session:m006-long-run::scenario:recovery',
        requestedScope: 'project',
      })
      await window.api.workflow.refreshBoard()
    })

    const baseline = await readStabilitySnapshot(readyWindow)
    expect(baseline.status).toBe('healthy')

    // Step 1 of assembled_failure_recovery mock: disconnect (reconnect success rate drops).
    await readyWindow.evaluate(async () => {
      await window.api.symphony.refreshDashboardSnapshot()
    })

    await expect
      .poll(async () => (await readStabilitySnapshot(readyWindow)).status)
      .not.toBe('healthy')

    const duringFailure = await readStabilitySnapshot(readyWindow)
    expect(
      duringFailure.breaches.some(
        (breach) => breach.metric === 'reconnectSuccessRate' && breach.sourceSurface === 'symphony',
      ),
    ).toBe(true)

    // Step 2 of assembled_failure_recovery mock: recovered connection.
    await readyWindow.evaluate(async () => {
      await window.api.symphony.refreshDashboardSnapshot()
    })

    await expect.poll(async () => (await readStabilitySnapshot(readyWindow)).status).toBe('healthy')

    const recovered = await readStabilitySnapshot(readyWindow)
    expect(recovered.breaches).toHaveLength(0)
    expect(recovered.metrics.reconnectSuccessRate).toBeGreaterThanOrEqual(0.95)
    expect(recovered.lastKnownGoodAt).toBeTruthy()
  })
})
