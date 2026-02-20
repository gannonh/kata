import { expect, test } from './fixtures/electron'

test.describe('Desktop mock chat @uat', () => {
  test('sends a message and receives a streamed assistant reply @uat', async ({ appWindow }) => {
    const prompt = 'Please summarize merged wave status.'

    await appWindow.getByLabel('Message input').fill(prompt)
    await appWindow.getByRole('button', { name: 'Send' }).click()

    await expect(appWindow.getByText(prompt)).toBeVisible()
    await expect(appWindow.getByTestId('streaming-indicator')).toBeVisible()
    await expect(appWindow.getByTestId('streaming-indicator')).toHaveCount(0, { timeout: 15_000 })

    await expect(
      appWindow.getByText(`I captured your request: "${prompt}".`)
    ).toBeVisible()
  })
})
