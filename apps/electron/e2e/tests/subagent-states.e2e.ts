import { test, expect } from '../fixtures/subagent-states.fixture'

test.describe('Sub-Agent State Indicators', () => {
  test.describe('Status Dots', () => {
    test('completed sub-agent shows green status dot', async ({ mainWindow }) => {
      const chip = mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')
      await expect(chip).toBeVisible()

      const dot = chip.locator('.rounded-full')
      await expect(dot).toBeVisible()
      const color = await dot.evaluate(el => getComputedStyle(el).backgroundColor)
      // #22c55e = rgb(34, 197, 94)
      expect(color).toBe('rgb(34, 197, 94)')
    })

    test('failed sub-agent shows orange status dot', async ({ mainWindow }) => {
      const chip = mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a3"]')
      await expect(chip).toBeVisible()

      const dot = chip.locator('.rounded-full')
      await expect(dot).toBeVisible()
      const color = await dot.evaluate(el => getComputedStyle(el).backgroundColor)
      // #f97316 = rgb(249, 115, 22)
      expect(color).toBe('rgb(249, 115, 22)')
    })

    test('running sub-agent shows spinner instead of status dot', async ({ mainWindow }) => {
      const chip = mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a2"]')
      await expect(chip).toBeVisible()

      // Running sub-agent should not have a status dot
      const dot = chip.locator('.rounded-full')
      await expect(dot).toHaveCount(0)

      // Running sub-agent should show a spinner indicator
      const spinner = chip.locator('.spinner')
      await expect(spinner).toBeVisible()
    })
  })

  test.describe('Sub-Agent Chip Layout', () => {
    test('sub-agent chips are marked with data-session-kind="subagent"', async ({ mainWindow }) => {
      const chips = mainWindow.locator('[data-testid="session-list-item"][data-session-kind="subagent"]')
      // 3 children under orch-a + 2 under orch-b = 5 total (all expanded by default)
      await expect(chips).toHaveCount(5)
    })

    test('sub-agent chips display session title text', async ({ mainWindow }) => {
      const chip = mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')
      await expect(chip).toContainText('Explore features and functionality')
    })

    test('long sub-agent names are truncated with ellipsis', async ({ mainWindow }) => {
      const chip = mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a2"]')
      const textSpan = chip.locator('.truncate')
      await expect(textSpan).toBeVisible()

      // Verify the truncate class is applied (overflow: hidden + text-overflow: ellipsis)
      const overflow = await textSpan.evaluate(el => getComputedStyle(el).overflow)
      expect(overflow).toBe('hidden')
      const textOverflow = await textSpan.evaluate(el => getComputedStyle(el).textOverflow)
      expect(textOverflow).toBe('ellipsis')
    })

    test('sub-agent chip buttons span full width of container', async ({ mainWindow }) => {
      const button = mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-b1"] [data-testid="session-list-item-button"]')
      await expect(button).toBeVisible()

      const hasFullWidth = await button.evaluate(el => el.classList.contains('w-full'))
      expect(hasFullWidth).toBe(true)
    })
  })

  test.describe('Tree Lines', () => {
    test('sub-agent chips have vertical and horizontal tree line elements', async ({ mainWindow }) => {
      const chip = mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')
      await expect(chip).toBeVisible()

      // Vertical stem and horizontal branch are absolutely positioned divs
      const absoluteElements = chip.locator('.absolute')
      // Should have at least 2 absolute elements: vertical stem + horizontal branch
      const count = await absoluteElements.count()
      expect(count).toBeGreaterThanOrEqual(2)
    })
  })

  test.describe('Expand and Collapse', () => {
    test('orchestrator parent shows collapse chevron with child count', async ({ mainWindow }) => {
      const parent = mainWindow.locator('[data-testid="session-list-item"][data-session-id="orch-a"]')
      await expect(parent).toBeVisible()
      await expect(parent).toContainText('3 sub-agents')

      const chevron = parent.locator('[aria-label="Collapse sub-agents"]')
      await expect(chevron).toBeVisible()
    })

    test('clicking chevron collapses sub-agents', async ({ mainWindow }) => {
      // Verify children are visible
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toBeVisible()

      // Click collapse chevron on orch-a
      const chevron = mainWindow.locator('[data-testid="session-list-item"][data-session-id="orch-a"] [aria-label="Collapse sub-agents"]')
      await chevron.click()

      // Children should be hidden
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toHaveCount(0)
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a2"]')).toHaveCount(0)
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a3"]')).toHaveCount(0)

      // Chevron should now say "Expand"
      const expandChevron = mainWindow.locator('[data-testid="session-list-item"][data-session-id="orch-a"] [aria-label="Expand sub-agents"]')
      await expect(expandChevron).toBeVisible()
    })

    test('clicking chevron again re-expands sub-agents', async ({ mainWindow }) => {
      // Collapse first
      const collapseChevron = mainWindow.locator('[data-testid="session-list-item"][data-session-id="orch-a"] [aria-label="Collapse sub-agents"]')
      await collapseChevron.click()
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toHaveCount(0)

      // Expand
      const expandChevron = mainWindow.locator('[data-testid="session-list-item"][data-session-id="orch-a"] [aria-label="Expand sub-agents"]')
      await expandChevron.click()

      // Children should be visible again
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toBeVisible()
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a2"]')).toBeVisible()
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a3"]')).toBeVisible()
    })

    test('clicking a standalone session collapses all parent groups', async ({ mainWindow }) => {
      // Verify both groups start expanded
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toBeVisible()
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-b1"]')).toBeVisible()

      // Click the standalone session
      const standalone = mainWindow.locator('[data-testid="session-list-item-button"][data-session-id="standalone-1"]')
      await standalone.click()

      // All sub-agents from both groups should be collapsed
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toHaveCount(0)
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-b1"]')).toHaveCount(0)
    })

    test('clicking a sub-agent collapses other parent groups but keeps its own expanded', async ({ mainWindow }) => {
      // Verify both groups start expanded
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toBeVisible()
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-b1"]')).toBeVisible()

      // Click a child of orch-a
      const childA1 = mainWindow.locator('[data-testid="session-list-item-button"][data-session-id="child-a1"]')
      await childA1.click()

      // Orch-a children should still be visible
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toBeVisible()
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a2"]')).toBeVisible()

      // Orch-b children should be collapsed
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-b1"]')).toHaveCount(0)
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-b2"]')).toHaveCount(0)
    })

    test('clicking an orchestrator parent keeps its children expanded and collapses others', async ({ mainWindow }) => {
      // Click orch-b parent
      const orchB = mainWindow.locator('[data-testid="session-list-item-button"][data-session-id="orch-b"]')
      await orchB.click()

      // Orch-b children should be visible
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-b1"]')).toBeVisible()

      // Orch-a children should be collapsed
      await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="child-a1"]')).toHaveCount(0)
    })
  })

  test.describe('Spacing and Separators', () => {
    test('full-width separator exists between sessions', async ({ mainWindow }) => {
      const separators = mainWindow.locator('.session-separator')
      const count = await separators.count()
      expect(count).toBeGreaterThan(0)

      // Verify separator has no left padding (full width)
      const firstSep = separators.first()
      const paddingLeft = await firstSep.evaluate(el => getComputedStyle(el).paddingLeft)
      expect(paddingLeft).toBe('0px')
    })
  })
})
