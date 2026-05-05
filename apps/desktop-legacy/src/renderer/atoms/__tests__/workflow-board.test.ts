import { describe, expect, test } from 'vitest'
import { shouldRefreshAfterScopeSync } from '../workflow-board'

describe('workflow board scope sync refresh guard', () => {
  test('does not refresh while kanban activation is not ready', () => {
    expect(
      shouldRefreshAfterScopeSync({
        rightPaneMode: 'kanban',
        boardActivationReady: false,
      }),
    ).toBe(false)
  })

  test('refreshes when kanban is active and activation handshake completed', () => {
    expect(
      shouldRefreshAfterScopeSync({
        rightPaneMode: 'kanban',
        boardActivationReady: true,
      }),
    ).toBe(true)
  })

  test('never refreshes for planning mode', () => {
    expect(
      shouldRefreshAfterScopeSync({
        rightPaneMode: 'planning',
        boardActivationReady: true,
      }),
    ).toBe(false)
  })

  test('never refreshes for agent activity mode', () => {
    expect(
      shouldRefreshAfterScopeSync({
        rightPaneMode: 'agent_activity',
        boardActivationReady: true,
      }),
    ).toBe(false)
  })
})
