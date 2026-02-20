import { expect, test } from './fixtures/electron'

test.describe('Desktop app navigation @uat', () => {
  test('switches left panel tabs and renders each view @uat @ci @quality-gate', async ({ appWindow }) => {
    const leftTabs = appWindow.getByRole('tablist', { name: 'Left panel tabs' })

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
