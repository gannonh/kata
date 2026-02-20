import { expect, test } from './fixtures/electron'

test.describe('Desktop app launch @uat', () => {
  test('opens Electron and renders shell columns @uat @ci @quality-gate', async ({ appWindow }) => {
    await expect(appWindow).toHaveTitle('Kata Orchestrator')

    await expect(appWindow.getByTestId('left-panel')).toBeVisible()
    await expect(appWindow.getByTestId('center-panel')).toBeVisible()
    await expect(appWindow.getByTestId('right-panel')).toBeVisible()
  })
})
