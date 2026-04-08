import type { Page } from '@playwright/test'
import { expect, startMockWorkflowRuntime, test } from '../fixtures/electron.fixture'

type A11ySeverity = 'critical' | 'serious' | 'moderate'

interface A11yViolation {
  surface: string
  severity: A11ySeverity
  rule: string
  message: string
}

async function collectUnlabeledInteractiveViolations(
  page: Page,
  surface: string,
  scopeSelector: string,
): Promise<A11yViolation[]> {
  const unlabeled = await page.evaluate(
    ({ scopeSelector }) => {
      const scope = document.querySelector(scopeSelector)
      if (!scope) {
        return []
      }

      const candidates = Array.from(
        scope.querySelectorAll<HTMLElement>(
          'button, [role="button"], input:not([type="hidden"]), textarea, select, [role="textbox"], [role="combobox"]',
        ),
      )

      return candidates
        .filter((node) => {
          const ariaLabel = node.getAttribute('aria-label')?.trim() ?? ''
          const labelledBy = node.getAttribute('aria-labelledby')?.trim() ?? ''
          const title = node.getAttribute('title')?.trim() ?? ''
          const text = node.textContent?.trim() ?? ''
          const placeholder =
            node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
              ? node.placeholder?.trim() ?? ''
              : ''

          return !ariaLabel && !labelledBy && !title && !text && !placeholder
        })
        .slice(0, 8)
        .map((node) => node.tagName.toLowerCase())
    },
    { scopeSelector },
  )

  return unlabeled.map((tagName) => ({
    surface,
    severity: 'moderate' as const,
    rule: 'interactive-control-name',
    message: `Unlabeled interactive control detected (${tagName}).`,
  }))
}

function pushIfMissing(
  violations: A11yViolation[],
  condition: boolean,
  violation: A11yViolation,
): void {
  if (!condition) {
    violations.push(violation)
  }
}

async function evaluateOnboardingSurface(page: Page): Promise<A11yViolation[]> {
  const violations: A11yViolation[] = []

  const hasHeading = await page.getByText('Onboarding').isVisible({ timeout: 2_000 }).catch(() => false)
  pushIfMissing(violations, hasHeading, {
    surface: 'onboarding',
    severity: 'critical',
    rule: 'onboarding-heading',
    message: 'Onboarding heading is not visible on first launch.',
  })

  const hasPrimaryAction = await page
    .getByRole('button', { name: /Get started/i })
    .isVisible({ timeout: 2_000 })
    .catch(() => false)

  pushIfMissing(violations, hasPrimaryAction, {
    surface: 'onboarding',
    severity: 'serious',
    rule: 'onboarding-primary-action',
    message: 'Get started action is missing from onboarding.',
  })

  return violations
}

async function evaluateExecutionSurfaces(page: Page): Promise<A11yViolation[]> {
  const violations: A11yViolation[] = []

  pushIfMissing(
    violations,
    await page.getByTestId('chat-input').isVisible({ timeout: 4_000 }).catch(() => false),
    {
      surface: 'chat',
      severity: 'serious',
      rule: 'chat-input-visible',
      message: 'Chat input is not visible.',
    },
  )

  pushIfMissing(
    violations,
    await page.getByTestId('kanban-column-in_progress').isVisible({ timeout: 4_000 }).catch(() => false),
    {
      surface: 'kanban',
      severity: 'serious',
      rule: 'kanban-column-visible',
      message: 'Kanban in-progress column is not visible.',
    },
  )

  const settingsButton = page.getByRole('button', { name: /^Settings$/i })
  const canOpenSettings = await settingsButton.isVisible({ timeout: 4_000 }).catch(() => false)

  if (!canOpenSettings) {
    violations.push({
      surface: 'symphony',
      severity: 'serious',
      rule: 'settings-entry-visible',
      message: 'Settings entry point is not visible from the app shell.',
    })
  }

  const symphonyTab = page.getByRole('tab', { name: /^Symphony$/i })
  const mcpTab = page.getByRole('tab', { name: /^MCP$/i })

  if (canOpenSettings) {
    await settingsButton.click()

    const symphonyTabVisible = await symphonyTab.isVisible({ timeout: 4_000 }).catch(() => false)
    if (symphonyTabVisible) {
      await symphonyTab.click()
    } else {
      violations.push({
        surface: 'symphony',
        severity: 'serious',
        rule: 'symphony-tab-visible',
        message: 'Symphony settings tab is not visible.',
      })
    }
  }

  pushIfMissing(
    violations,
    await page.getByTestId('symphony-dashboard-panel').isVisible({ timeout: 4_000 }).catch(() => false),
    {
      surface: 'symphony',
      severity: 'serious',
      rule: 'symphony-dashboard-visible',
      message: 'Symphony dashboard panel is not visible.',
    },
  )

  const mcpTabVisible = await mcpTab.isVisible({ timeout: 4_000 }).catch(() => false)
  if (mcpTabVisible) {
    await mcpTab.click()
  } else {
    violations.push({
      surface: 'settings',
      severity: 'serious',
      rule: 'mcp-tab-visible',
      message: 'MCP settings tab is not visible.',
    })
  }

  pushIfMissing(
    violations,
    await page.getByTestId('mcp-settings-panel').isVisible({ timeout: 4_000 }).catch(() => false),
    {
      surface: 'settings',
      severity: 'serious',
      rule: 'mcp-panel-visible',
      message: 'MCP settings panel is not visible.',
    },
  )

  violations.push(
    ...(await collectUnlabeledInteractiveViolations(page, 'chat', '[data-testid="chat-pane"]')),
    ...(await collectUnlabeledInteractiveViolations(page, 'kanban', '[data-testid="workflow-kanban-pane"]')),
    ...(await collectUnlabeledInteractiveViolations(page, 'symphony', '[data-testid="symphony-dashboard-panel"]')),
    ...(await collectUnlabeledInteractiveViolations(page, 'settings', '[data-testid="mcp-settings-panel"]')),
  )

  return violations
}

function assertSeverityGate(violations: A11yViolation[]): void {
  const blocking = violations.filter(
    (violation) => violation.severity === 'critical' || violation.severity === 'serious',
  )

  expect(
    blocking,
    `Accessibility baseline has blocking violations: ${blocking
      .map((violation) => `[${violation.surface}] ${violation.rule}: ${violation.message}`)
      .join('; ')}`,
  ).toHaveLength(0)
}

test.describe('M006 accessibility baseline', () => {
  test('covers onboarding baseline with severity gating', async ({ mainWindow }) => {
    const violations = await evaluateOnboardingSurface(mainWindow)
    assertSeverityGate(violations)
  })

  test('covers chat, kanban, symphony, and settings surfaces with severity gating', async ({
    readyWindow,
  }) => {
    await startMockWorkflowRuntime(readyWindow)

    const violations = await evaluateExecutionSurfaces(readyWindow)
    assertSeverityGate(violations)
  })
})
