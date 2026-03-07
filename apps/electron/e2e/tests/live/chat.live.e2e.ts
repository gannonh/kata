/**
 * E2E-04: Chat round-trip test
 * Sends message, verifies streaming response renders with turn cards.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { ChatPage } from '../../page-objects/ChatPage'

test.describe('Live Chat', () => {
  // Extended timeout for live API calls
  test.setTimeout(120_000)

  test('E2E-04: send message, verify streaming response renders', async ({ mainWindow }) => {
    const chatPage = new ChatPage(mainWindow)

    // Ensure chat is ready (may need to start new conversation)
    await chatPage.waitForReady()

    // Send a simple, deterministic message
    await chatPage.sendMessage('Respond with exactly: "Hello from live test"')

    // Wait for assistant turn card to appear (streaming starts)
    const turnCard = mainWindow.locator('[data-testid="assistant-turn-card"]').last()
    await expect(turnCard).toBeVisible({ timeout: 30_000 })

    // Wait for streaming to complete (data-streaming="false")
    await expect(turnCard).toHaveAttribute('data-streaming', 'false', { timeout: 60_000 })

    // Verify response contains expected text (or at least has content)
    const responseText = await chatPage.getLastAssistantMessage()
    expect(responseText).toBeTruthy()
    expect(responseText!.length).toBeGreaterThan(0)

    // Verify message count increased
    const counts = await chatPage.getMessageCount()
    expect(counts.assistant).toBeGreaterThanOrEqual(1)
  })
})
