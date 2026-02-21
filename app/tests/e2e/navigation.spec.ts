import { expect, test } from './fixtures/electron'

test.describe('Desktop app navigation @uat', () => {
  test.afterEach(async ({ appWindow }) => {
    await appWindow.evaluate(() => {
      window.localStorage.removeItem('kata-left-status-scenario')
    })
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

  test('keeps left status visible while switching tabs @uat @ci @quality-gate', async ({ appWindow }) => {
    await expect(appWindow.getByLabel('Left panel status')).toBeVisible()

    const leftTabs = appWindow.getByRole('tablist', { name: /Left panel (tabs|modules)/ })
    await leftTabs.getByRole('tab', { name: 'Context' }).click()
    await expect(appWindow.getByLabel('Left panel status')).toBeVisible()
    await leftTabs.getByRole('tab', { name: 'Changes' }).click()
    await expect(appWindow.getByLabel('Left panel status')).toBeVisible()
  })

  test('renders simple and overflow progress scenarios via localStorage override @uat @ci', async ({ appWindow }) => {
    await appWindow.evaluate(() => {
      window.localStorage.setItem('kata-left-status-scenario', 'simple')
    })
    await appWindow.reload()
    await expect(appWindow.getByText('Tasks ready to go.')).toBeVisible()

    await appWindow.evaluate(() => {
      window.localStorage.setItem('kata-left-status-scenario', 'overflow')
    })
    await appWindow.reload()
    await expect(appWindow.getByText('25 done')).toHaveCount(2)
    await expect(appWindow.getByText('50 of 60 complete.')).toBeVisible()
  })

  test('clicking status section toggles busy preview @uat @ci', async ({ appWindow }) => {
    const statusSection = appWindow.getByLabel('Left panel status')

    await expect(appWindow.getByText('Tasks ready to go.')).toBeVisible()
    await statusSection.click()
    await expect(appWindow.getByText('2 of 5 complete.')).toBeVisible()
    await statusSection.click()
    await expect(appWindow.getByText('3 of 5 complete.')).toBeVisible()
    await statusSection.click()
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
