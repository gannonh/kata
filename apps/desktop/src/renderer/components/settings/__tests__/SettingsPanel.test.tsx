import { describe, expect, test } from 'vitest'
import { shouldShowReturnToWorkflowAction } from '../SettingsPanel'

describe('SettingsPanel workflow return affordance', () => {
  const noop = () => {}

  test('shows return-to-workflow action only on the MCP tab', () => {
    expect(shouldShowReturnToWorkflowAction('mcp', noop)).toBe(true)
    expect(shouldShowReturnToWorkflowAction('providers', noop)).toBe(false)
    expect(shouldShowReturnToWorkflowAction('symphony', noop)).toBe(false)
  })

  test('hides return-to-workflow action when no callback is provided', () => {
    expect(shouldShowReturnToWorkflowAction('mcp')).toBe(false)
  })
})
