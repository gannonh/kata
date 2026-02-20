import { expect, test } from './fixtures/electron'

function assertNumber(value: number | undefined): asserts value is number {
  expect(value).toBeDefined()
}

test.describe('Wave 1 desktop shell UAT @uat', () => {
  test('launches Electron and renders three visible columns @ci @quality-gate', async ({
    appWindow
  }) => {
    await expect(appWindow).toHaveTitle('Kata Orchestrator')

    await expect(appWindow.getByRole('heading', { name: 'Agents' })).toBeVisible()
    await expect(appWindow.getByRole('heading', { name: 'Orchestrator Chat' })).toBeVisible()
    await expect(appWindow.getByRole('heading', { name: 'Spec' })).toBeVisible()

    await expect(appWindow.getByLabel('Resize left panel')).toBeVisible()
    await expect(appWindow.getByLabel('Resize right panel')).toBeVisible()
  })

  test('uses Wave 1 BrowserWindow size and minimum constraints @quality-gate', async ({
    electronApp,
    appWindow
  }) => {
    await appWindow.waitForLoadState('domcontentloaded')

    const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]

      return {
        size: window.getSize(),
        minimumSize: window.getMinimumSize(),
        title: window.getTitle()
      }
    })

    expect(windowState.size).toEqual([1440, 900])
    expect(windowState.minimumSize).toEqual([1024, 600])
    expect(windowState.title).toBe('Kata Orchestrator')
  })

  test('supports horizontal panel resizing via drag handles @uat', async ({ appWindow }) => {
    const leftPanel = appWindow.getByTestId('left-panel')
    const rightPanel = appWindow.getByTestId('right-panel')
    const leftResizer = appWindow.getByTestId('left-resizer')
    const rightResizer = appWindow.getByTestId('right-resizer')

    const leftBefore = await leftPanel.boundingBox()
    const rightBefore = await rightPanel.boundingBox()
    const leftResizerBox = await leftResizer.boundingBox()
    const rightResizerBox = await rightResizer.boundingBox()

    assertNumber(leftBefore?.width)
    assertNumber(rightBefore?.width)
    assertNumber(leftResizerBox?.x)
    assertNumber(leftResizerBox?.y)
    assertNumber(leftResizerBox?.width)
    assertNumber(leftResizerBox?.height)
    assertNumber(rightResizerBox?.x)
    assertNumber(rightResizerBox?.y)
    assertNumber(rightResizerBox?.width)
    assertNumber(rightResizerBox?.height)

    await appWindow.mouse.move(
      leftResizerBox.x + leftResizerBox.width / 2,
      leftResizerBox.y + leftResizerBox.height / 2
    )
    await appWindow.mouse.down()
    await appWindow.mouse.move(
      leftResizerBox.x + leftResizerBox.width / 2 + 120,
      leftResizerBox.y + leftResizerBox.height / 2,
      { steps: 12 }
    )
    await appWindow.mouse.up()

    await appWindow.mouse.move(
      rightResizerBox.x + rightResizerBox.width / 2,
      rightResizerBox.y + rightResizerBox.height / 2
    )
    await appWindow.mouse.down()
    await appWindow.mouse.move(
      rightResizerBox.x + rightResizerBox.width / 2 - 120,
      rightResizerBox.y + rightResizerBox.height / 2,
      { steps: 12 }
    )
    await appWindow.mouse.up()

    const leftAfter = await leftPanel.boundingBox()
    const rightAfter = await rightPanel.boundingBox()

    assertNumber(leftAfter?.width)
    assertNumber(rightAfter?.width)

    expect(leftAfter.width).toBeGreaterThan(leftBefore.width + 40)
    expect(rightAfter.width).toBeGreaterThan(rightBefore.width + 40)
  })
})
