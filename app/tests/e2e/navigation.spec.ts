import { expect, test } from './fixtures/electron'
import { LEFT_STATUS_SCENARIO_KEY } from '../../src/renderer/mock/project'

test.describe('Desktop app navigation @uat', () => {
  test.afterEach(async ({ appWindow }) => {
    await appWindow.evaluate((scenarioKey) => {
      window.localStorage.removeItem(scenarioKey)
    }, LEFT_STATUS_SCENARIO_KEY)
  })

  test('switches left panel tabs and renders each view @uat @ci @quality-gate', async ({ appWindow }) => {
    const leftTabs = appWindow.getByRole('tablist', { name: /Left panel (tabs|modules)/ })

    await expect(leftTabs.getByRole('tab', { name: /Agents/ })).toHaveAttribute('aria-selected', 'true')

    await leftTabs.getByRole('tab', { name: /Context/ }).click()
    await expect(appWindow.getByRole('heading', { name: 'Context' })).toBeVisible()

    await leftTabs.getByRole('tab', { name: /Changes/ }).click()
    await expect(appWindow.getByRole('heading', { name: 'Changes' })).toBeVisible()
    await expect(appWindow.getByText(/^Branch:/)).toBeVisible()

    await leftTabs.getByRole('tab', { name: /Files/ }).click()
    await expect(appWindow.getByRole('heading', { name: 'Files' })).toBeVisible()
    await expect(appWindow.getByLabel('Search files')).toBeVisible()
  })

  test('renders agents coordinator and toggles background agent list @uat @ci @quality-gate', async ({
    appWindow
  }) => {
    const leftTabs = appWindow.getByRole('tablist', { name: /Left panel (tabs|modules)/ })

    await leftTabs.getByRole('tab', { name: /Agents/ }).click()
    await expect(appWindow.getByRole('heading', { name: 'Agents' })).toBeVisible()
    await expect(appWindow.getByText('MVP Planning Coordinator')).toBeVisible()
    await expect(
      appWindow.getByText('Agents write code, maintain notes, and coordinate tasks.')
    ).toBeVisible()

    const backgroundToggle = appWindow.getByRole('button', { name: /background agents running/i })
    await expect(backgroundToggle).toBeVisible()
    await expect(appWindow.getByText('Task Block Parser')).toHaveCount(0)

    await backgroundToggle.click()
    await expect(appWindow.getByText('Task Block Parser')).toBeVisible()
    await expect(appWindow.getByText('Implement Spec Panel')).toBeVisible()

    await backgroundToggle.click()
    await expect(appWindow.getByText('Task Block Parser')).toHaveCount(0)
  })

  test('renders context preview states 0-3 with expected task and notes variants @uat @ci @quality-gate', async ({
    appWindow
  }) => {
    const leftTabs = appWindow.getByRole('tablist', { name: /Left panel (tabs|modules)/ })

    await leftTabs.getByRole('tab', { name: /Context/ }).click()
    const contextTab = appWindow.getByTestId('context-tab')

    await expect(appWindow.getByRole('heading', { name: 'Context' })).toBeVisible()
    await expect(
      contextTab.getByText('Project specs, tasks, and notes are stored as markdown files in')
    ).toBeVisible()
    await expect(contextTab.locator('code', { hasText: './notes' })).toBeVisible()
    await expect(contextTab.getByTestId('context-spec-section').getByText('Spec')).toBeVisible()
    await expect(contextTab.getByText('Create contracts and shared baseline components')).toBeVisible()
    await expect(contextTab.getByText('Implement left panel tabs')).toBeVisible()
    await expect(appWindow.getByTestId('context-notes-heading')).toHaveCount(0)

    await appWindow.getByRole('button', { name: 'Show preview state 1' }).click()
    await expect(appWindow.getByTestId('context-notes-heading')).toBeVisible()
    await expect(contextTab.getByText('Team Brainstorm - 2/22/26')).toBeVisible()
    await expect(contextTab.getByText('Scratchpad')).toBeVisible()
    await expect(appWindow.getByTestId('context-note-row-team-brainstorm-2-22-26')).toHaveAttribute(
      'data-context-note-selected',
      'true'
    )

    await appWindow.getByRole('button', { name: 'Show preview state 2' }).click()
    await expect(contextTab.getByText('Create contracts and shared baseline components')).toBeVisible()
    await expect(appWindow.getByTestId('context-notes-heading')).toHaveCount(0)
    await expect(contextTab.locator('[data-context-task-status="in_progress"]')).toHaveCount(0)
    await expect(contextTab.locator('[data-context-task-status="done"]')).toHaveCount(0)
    await expect(contextTab.locator('[data-context-task-status="todo"]')).toHaveCount(2)

    await appWindow.getByRole('button', { name: 'Show preview state 3' }).click()
    await expect(appWindow.getByTestId('context-notes-heading')).toBeVisible()
    await expect(appWindow.getByTestId('context-note-row-team-brainstorm-2-22-26')).toHaveAttribute(
      'data-context-note-selected',
      'false'
    )
  })

  test('keeps left status visible while switching tabs @uat @ci @quality-gate', async ({ appWindow }) => {
    await expect(appWindow.getByLabel('Left panel status')).toBeVisible()

    const leftTabs = appWindow.getByRole('tablist', { name: /Left panel (tabs|modules)/ })
    await leftTabs.getByRole('tab', { name: 'Context' }).click()
    await expect(appWindow.getByLabel('Left panel status')).toBeVisible()
    await leftTabs.getByRole('tab', { name: 'Changes' }).click()
    await expect(appWindow.getByLabel('Left panel status')).toBeVisible()
  })

  test('renders simple and overflow progress scenarios via localStorage override @uat @ci', async ({ appWindow }) => {
    await appWindow.evaluate((scenarioKey) => {
      window.localStorage.setItem(scenarioKey, 'simple')
    }, LEFT_STATUS_SCENARIO_KEY)
    await appWindow.reload()
    await expect(appWindow.getByText('Tasks ready to go.')).toBeVisible()

    await appWindow.evaluate((scenarioKey) => {
      window.localStorage.setItem(scenarioKey, 'overflow')
    }, LEFT_STATUS_SCENARIO_KEY)
    await appWindow.reload()
    await expect(appWindow.getByText('25 done')).toHaveCount(2)
    await expect(appWindow.getByText('50 of 60 complete.')).toBeVisible()
  })

  test('clicking status section toggles busy preview @uat @ci', async ({ appWindow }) => {
    const cyclePreviewStateButton = appWindow.getByRole('button', { name: 'Cycle status preview state' })

    await expect(appWindow.getByText('Tasks ready to go.')).toBeVisible()
    await cyclePreviewStateButton.click()
    await expect(appWindow.getByText('2 of 5 complete.')).toBeVisible()
    await cyclePreviewStateButton.click()
    await expect(appWindow.getByText('3 of 5 complete.')).toBeVisible()
    await cyclePreviewStateButton.click()
    await expect(appWindow.getByText('4 of 5 complete.')).toBeVisible()
    await expect(appWindow.locator('[data-segment-status="done"]')).toHaveCount(4)
    await expect(appWindow.locator('[data-segment-status="in_progress"]')).toHaveCount(1)
    await appWindow.getByRole('button', { name: 'Show preview state 1' }).click()
    await expect(appWindow.getByText('2 of 5 complete.')).toBeVisible()
  })

  test('switches right panel tabs and preserves notes state @uat @ci @quality-gate', async ({ appWindow }) => {
    const rightTabs = appWindow.getByRole('tablist', { name: 'Right panel tabs' })
    const note = 'Integration checkpoint: merged waves 2B-5 and validating UAT.'

    await rightTabs.getByRole('tab', { name: 'Notes' }).click()
    await appWindow.getByLabel('Project notes').fill(note)
    await expect(appWindow.getByLabel('Project notes')).toHaveValue(note)

    await rightTabs.getByRole('tab', { name: 'Spec' }).click()
    await expect(appWindow.getByRole('heading', { name: /^Goal$/ })).toBeVisible()

    await rightTabs.getByRole('tab', { name: 'Notes' }).click()
    await expect(appWindow.getByLabel('Project notes')).toHaveValue(note)
  })
})
