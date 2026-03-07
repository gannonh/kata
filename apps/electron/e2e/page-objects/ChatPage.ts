import type { Page, Locator } from '@playwright/test'

/**
 * Page object for the main chat interface.
 * Encapsulates all chat-related interactions.
 *
 * Uses data-testid selectors for reliable E2E testing.
 */
export class ChatPage {
  readonly page: Page
  readonly chatInput: Locator
  readonly sendButton: Locator
  readonly userTurns: Locator
  readonly assistantTurns: Locator

  constructor(page: Page) {
    this.page = page
    // The chat input is a contenteditable div
    this.chatInput = page.locator('[contenteditable="true"]').first()
    // Send button - look for buttons with SVG icons
    this.sendButton = page.locator('button').filter({ has: page.locator('svg') }).last()
    // Assistant turn cards use data-testid (added in 01-02)
    this.assistantTurns = page.locator('[data-testid="assistant-turn-card"]')
    // User turns still need a selector - use class-based for now
    this.userTurns = page.locator('[class*="user-message"], [class*="UserMessage"]')
  }

  /**
   * Send a message in the chat
   */
  async sendMessage(text: string): Promise<void> {
    await this.chatInput.click()
    await this.chatInput.pressSequentially(text, { delay: 10 })
    await this.page.keyboard.press('Enter')
  }

  /**
   * Wait for an assistant response to appear
   */
  async waitForResponse(timeout = 30000): Promise<void> {
    const lastTurn = this.assistantTurns.last()
    await lastTurn.waitFor({ state: 'visible', timeout })
    // Wait for streaming to finish if data-streaming attribute exists
    try {
      await this.page.waitForFunction(
        (sel: string) => {
          const turns = document.querySelectorAll(sel)
          const last = turns[turns.length - 1]
          return last && last.getAttribute('data-streaming') !== 'true'
        },
        '[data-testid="assistant-turn-card"]',
        { timeout }
      )
    } catch {
      // data-streaming attribute may not exist on all turn cards
    }
  }

  /**
   * Get the text content of the last assistant message
   */
  async getLastAssistantMessage(): Promise<string | null> {
    const turns = await this.assistantTurns.all()
    if (turns.length === 0) return null
    return turns[turns.length - 1].textContent()
  }

  /**
   * Get all assistant messages
   */
  async getAllAssistantMessages(): Promise<string[]> {
    const turns = await this.assistantTurns.all()
    const messages: string[] = []
    for (const turn of turns) {
      const text = await turn.textContent()
      if (text) messages.push(text)
    }
    return messages
  }

  /**
   * Get the count of messages in the chat
   */
  async getMessageCount(): Promise<{ user: number; assistant: number }> {
    const userCount = await this.userTurns.count()
    const assistantCount = await this.assistantTurns.count()
    return { user: userCount, assistant: assistantCount }
  }

  /**
   * Cycle through permission modes using SHIFT+TAB
   */
  async cyclePermissionMode(): Promise<void> {
    await this.page.keyboard.press('Shift+Tab')
  }

  /**
   * Get current permission mode from UI text
   */
  async getPermissionMode(): Promise<string | null> {
    // Look for permission mode text in the UI
    const modeTexts = ['Explore', 'Ask', 'Execute', 'Auto']
    for (const mode of modeTexts) {
      try {
        const element = this.page.getByText(mode, { exact: true }).first()
        if (await element.isVisible({ timeout: 500 })) {
          return mode.toLowerCase()
        }
      } catch {
        // Element not found, continue
      }
    }
    return null
  }

  /**
   * Check if chat input is focused
   */
  async isChatInputFocused(): Promise<boolean> {
    return this.chatInput.evaluate(el =>
      document.activeElement === el || el.contains(document.activeElement)
    )
  }

  /**
   * Clear the chat input
   */
  async clearInput(): Promise<void> {
    await this.chatInput.click()
    await this.page.keyboard.press('Meta+a')
    await this.page.keyboard.press('Backspace')
  }

  /**
   * Wait for the chat to be ready (input available).
   * If no conversation is open, starts a new one first.
   */
  async waitForReady(timeout = 30000): Promise<void> {
    const chatInput = this.page.locator('[contenteditable="true"]')

    // Check if chat input is already visible
    if (await chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      return
    }

    // Need to start a new conversation - look for "New Chat" button
    // Use force:true to click through any splash screen overlay
    const newChatButton = this.page.getByRole('button', { name: /new chat/i })
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click({ force: true })
    }

    // Wait for chat input to appear
    await this.page.waitForSelector('[contenteditable="true"]', {
      state: 'visible',
      timeout
    })
  }
}
