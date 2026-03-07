/**
 * E2E Test Infrastructure Exports
 *
 * Usage:
 *   import { test, expect, ChatPage, WorkspacePage } from '../'
 */

// Fixtures
export { test, expect } from './fixtures/electron.fixture'
export { TestWorkspace, getTestEnv } from './fixtures/test-workspace'
export {
  setupApiMocks,
  clearApiMocks,
  addMockResponse,
  defaultMockResponses
} from './fixtures/mock-api'

// Page Objects
export { ChatPage } from './page-objects/ChatPage'
export { WorkspacePage } from './page-objects/WorkspacePage'

// Helpers
export * from './helpers/test-utils'
