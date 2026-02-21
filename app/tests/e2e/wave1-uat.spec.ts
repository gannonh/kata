import { expect, test } from './fixtures/electron'

function assertDefined<T>(value: T | null | undefined): asserts value is T {
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
    await expect(appWindow.getByLabel('Resize center-right divider')).toBeVisible()
  })

  test('uses Wave 1 BrowserWindow size and minimum constraints @quality-gate', async ({
    electronApp,
    appWindow
  }) => {
    const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]

      return {
        size: window.getSize(),
        minimumSize: window.getMinimumSize(),
        title: window.getTitle()
      }
    })

    expect(windowState.size).toEqual([1440, 900])
    expect(windowState.minimumSize).toEqual([1040, 600])
    expect(windowState.title).toBe('Kata Orchestrator')
  })

  test('supports left sizing and center-right divider resizing @uat', async ({ appWindow }) => {
    const leftPanel = appWindow.getByTestId('left-panel')
    const centerPanel = appWindow.getByTestId('center-panel')
    const rightPanel = appWindow.getByTestId('right-panel')
    const leftResizer = appWindow.getByTestId('left-resizer')
    const rightResizer = appWindow.getByTestId('right-resizer')

    const leftBefore = await leftPanel.boundingBox()
    assertDefined(leftBefore)

    await leftResizer.focus()
    for (let index = 0; index < 4; index += 1) {
      await leftResizer.press('ArrowRight')
    }

    await expect
      .poll(async () => (await leftPanel.boundingBox())?.width)
      .toBeGreaterThan(leftBefore.width + 40)

    const centerAfterLeft = await centerPanel.boundingBox()
    const rightAfterLeft = await rightPanel.boundingBox()
    await rightResizer.focus()
    for (let index = 0; index < 4; index += 1) {
      await rightResizer.press('ArrowRight')
    }
    assertDefined(centerAfterLeft)
    assertDefined(rightAfterLeft)

    await expect
      .poll(async () => (await centerPanel.boundingBox())?.width)
      .toBeGreaterThan(centerAfterLeft.width + 40)
    await expect
      .poll(async () => (await rightPanel.boundingBox())?.width)
      .toBeLessThan(rightAfterLeft.width - 40)
  })

  test('rebalances columns at minimum width without horizontal clipping @quality-gate', async ({
    electronApp,
    appWindow
  }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setSize(1040, 900)
    })

    await expect.poll(async () => {
      return await appWindow.evaluate(() => {
        const root = document.documentElement
        return root.scrollWidth - root.clientWidth
      })
    }).toBeLessThanOrEqual(0)
  })

  test('double-clicking center divider resets center and right to equal widths @quality-gate', async ({
    appWindow
  }) => {
    const centerPanel = appWindow.getByTestId('center-panel')
    const rightPanel = appWindow.getByTestId('right-panel')
    const rightResizer = appWindow.getByTestId('right-resizer')
    const rightResizerBox = await rightResizer.boundingBox()
    assertDefined(rightResizerBox)

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

    await expect.poll(async () => {
      const center = await centerPanel.boundingBox()
      const right = await rightPanel.boundingBox()
      assertDefined(center)
      assertDefined(right)
      return Math.round(Math.abs(center.width - right.width))
    }).toBeGreaterThan(20)

    await rightResizer.dblclick()

    await expect.poll(async () => {
      const center = await centerPanel.boundingBox()
      const right = await rightPanel.boundingBox()
      assertDefined(center)
      assertDefined(right)
      return Math.round(Math.abs(center.width - right.width))
    }).toBeLessThanOrEqual(2)
  })
})
