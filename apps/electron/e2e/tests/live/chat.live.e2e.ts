/**
 * E2E-04: Chat round-trip test
 * Sends a message and verifies the app surfaces either a streamed response
 * or a handled provider error state (for example, rate limiting).
 */
import { test, expect } from '../../fixtures/live.fixture'
import { ChatPage } from '../../page-objects/ChatPage'

test.describe('Live Chat', () => {
  // Extended timeout for live API calls
  test.setTimeout(120_000)

  test('E2E-04: send message, verify chat response or handled provider error', async ({ mainWindow }) => {
    const chatPage = new ChatPage(mainWindow)
    const newChatButton = mainWindow.locator('[data-tutorial="new-chat-button"]')

    // Ensure chat is ready (may need to start new conversation)
    await chatPage.waitForReady()

    const turnCard = mainWindow.locator('[data-testid="assistant-turn-card"]').last()
    const rateLimitError = mainWindow.getByText(/rate limit exceeded|too many requests/i).first()
    const prompt = `Respond with exactly: "Hello from live test ${Date.now()}"`

    let receivedResponse = false
    let handledProviderError = false

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await newChatButton.click()
        await chatPage.waitForReady()
      }

      await chatPage.sendMessage(prompt)

      const outcome = await Promise.race([
        turnCard.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'response' as const),
        rateLimitError.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'rate-limit' as const),
      ])

      if (outcome === 'response') {
        receivedResponse = true
        break
      }

      handledProviderError = true

      if (attempt < 2) {
        await mainWindow.waitForTimeout(10_000)
      }
    }

    expect(receivedResponse || handledProviderError).toBe(true)

    if (receivedResponse) {
      // Wait for streaming to complete (data-streaming="false")
      await expect(turnCard).toHaveAttribute('data-streaming', 'false', { timeout: 60_000 })

      // Verify response contains expected text (or at least has content)
      const responseText = await chatPage.getLastAssistantMessage()
      expect(responseText).toBeTruthy()
      expect(responseText!.length).toBeGreaterThan(0)

      // Verify message count increased
      const counts = await chatPage.getMessageCount()
      expect(counts.assistant).toBeGreaterThanOrEqual(1)
      return
    }

    await expect(rateLimitError).toBeVisible({ timeout: 5000 })
  })
})
