import type { Page } from '@playwright/test'

/**
 * Common test utility functions
 */

/**
 * Wait for the app to fully initialize
 */
export async function waitForAppReady(page: Page, timeout = 30000): Promise<void> {
  // Wait for main app container to be visible
  await page.waitForSelector('[data-testid="app-container"]', {
    state: 'visible',
    timeout
  })
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeDebugScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await page.screenshot({ path: `e2e/screenshots/${name}-${timestamp}.png` })
}

/**
 * Wait for any loading indicators to disappear
 */
export async function waitForLoadingComplete(page: Page, timeout = 10000): Promise<void> {
  const loadingIndicator = page.getByTestId('loading-indicator')

  // Only wait if loading indicator exists
  const exists = await loadingIndicator.count() > 0
  if (exists) {
    await loadingIndicator.waitFor({ state: 'hidden', timeout })
  }
}

/**
 * Retry an action with exponential backoff
 */
export async function retry<T>(
  action: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 100
): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await action()
    } catch (error) {
      lastError = error as Error
      await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)))
    }
  }

  throw lastError
}

/**
 * Get computed style property of an element
 */
export async function getComputedStyle(
  page: Page,
  selector: string,
  property: string
): Promise<string> {
  return page.evaluate(
    ({ selector, property }) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`Element not found: ${selector}`)
      return window.getComputedStyle(element).getPropertyValue(property)
    },
    { selector, property }
  )
}

/**
 * Simulate network conditions (slow, offline, etc.)
 */
export async function setNetworkConditions(
  page: Page,
  condition: 'offline' | 'slow' | 'normal'
): Promise<void> {
  // Note: This requires CDP access which Playwright provides
  const context = page.context()

  switch (condition) {
    case 'offline':
      await context.setOffline(true)
      break
    case 'slow':
      // Simulate slow 3G
      // Note: This is a simplified version - full implementation would use CDP
      await context.setOffline(false)
      break
    case 'normal':
      await context.setOffline(false)
      break
  }
}

/**
 * Clear all app data for clean test state
 */
export async function clearAppData(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}
