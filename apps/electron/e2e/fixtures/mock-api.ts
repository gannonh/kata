import type { ElectronApplication } from '@playwright/test'

/**
 * Mock API responses for Claude API calls during e2e tests.
 * This prevents real API calls and provides predictable test data.
 */

export interface MockResponse {
  content: string
  toolCalls?: Array<{
    name: string
    parameters: Record<string, unknown>
    result: string
  }>
}

/**
 * Default mock responses for common scenarios
 */
export const defaultMockResponses: Record<string, MockResponse> = {
  greeting: {
    content: 'Hello! I\'m Kata Agents. How can I help you today?'
  },
  simpleQuestion: {
    content: 'That\'s a great question. Let me help you with that.'
  },
  codeGeneration: {
    content: 'Here\'s the code you requested:',
    toolCalls: [{
      name: 'Write',
      parameters: { file_path: '/test/example.ts', content: 'console.log("Hello")' },
      result: 'File created successfully'
    }]
  },
  error: {
    content: 'I encountered an error processing your request. Please try again.'
  }
}

/**
 * Set up API mocking for the Electron app.
 * Uses IPC to configure mock mode in the main process.
 */
export async function setupApiMocks(
  electronApp: ElectronApplication,
  responses?: Record<string, MockResponse>
): Promise<void> {
  const mockResponses = { ...defaultMockResponses, ...responses }

  // Evaluate in main process context to set up mocks
  await electronApp.evaluate(async ({ ipcMain }, { mockResponses }) => {
    // Store mock responses in global state
    (global as any).__KATA_MOCK_RESPONSES__ = mockResponses
    (global as any).__KATA_MOCK_MODE__ = true
  }, { mockResponses })
}

/**
 * Clear all API mocks
 */
export async function clearApiMocks(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(async () => {
    (global as any).__KATA_MOCK_RESPONSES__ = undefined
    (global as any).__KATA_MOCK_MODE__ = false
  })
}

/**
 * Add a specific mock response for a pattern
 */
export async function addMockResponse(
  electronApp: ElectronApplication,
  pattern: string,
  response: MockResponse
): Promise<void> {
  await electronApp.evaluate(async ({ }, { pattern, response }) => {
    const responses = (global as any).__KATA_MOCK_RESPONSES__ || {}
    responses[pattern] = response
    ;(global as any).__KATA_MOCK_RESPONSES__ = responses
  }, { pattern, response })
}

/**
 * Get mock response for a given message pattern.
 * Used by the mock Claude handler to return appropriate responses.
 */
export function getMockResponseForMessage(message: string): MockResponse {
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return defaultMockResponses.greeting
  }

  if (lowerMessage.includes('code') || lowerMessage.includes('write')) {
    return defaultMockResponses.codeGeneration
  }

  return defaultMockResponses.simpleQuestion
}
