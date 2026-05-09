import { describe, expect, test } from 'vitest'
import { createStore } from 'jotai'
import {
  clearRightPaneOverrideAtom,
  rightPaneModeAtom,
  rightPaneResolutionAtom,
  rightPaneOverrideAtom,
  setRightPaneOverrideAtom,
  setWorkflowContextAtom,
} from '../right-pane'
import type { WorkflowContextSnapshot } from '@shared/types'

function context(mode: WorkflowContextSnapshot['mode']): WorkflowContextSnapshot {
  return {
    mode,
    reason: mode === 'execution' ? 'tracker_configured_board_pending' : 'unknown_context',
    trackerConfigured: mode === 'execution',
    boardAvailable: mode === 'execution',
    updatedAt: new Date().toISOString(),
  }
}

describe('right-pane mode resolver', () => {
  test('uses automatic kanban mode when execution context is active', () => {
    const store = createStore()
    store.set(setWorkflowContextAtom, context('execution'))

    expect(store.get(rightPaneModeAtom)).toBe('kanban')
    expect(store.get(rightPaneResolutionAtom).reason).toBe('tracker_configured_board_pending')
  })

  test('defaults to kanban when context is unknown', () => {
    const store = createStore()
    store.set(setWorkflowContextAtom, context('unknown'))

    expect(store.get(rightPaneModeAtom)).toBe('kanban')
    expect(store.get(rightPaneResolutionAtom).reason).toBe('default_fallback')
  })

  test('manual override persists until cleared', () => {
    const store = createStore()
    store.set(setWorkflowContextAtom, context('execution'))
    store.set(setRightPaneOverrideAtom, 'kanban')

    expect(store.get(rightPaneOverrideAtom)).toBe('kanban')
    expect(store.get(rightPaneModeAtom)).toBe('kanban')
    expect(store.get(rightPaneResolutionAtom).source).toBe('manual')

    store.set(clearRightPaneOverrideAtom)

    expect(store.get(rightPaneOverrideAtom)).toBeNull()
    expect(store.get(rightPaneModeAtom)).toBe('kanban')
    expect(store.get(rightPaneResolutionAtom).source).toBe('automatic')
  })

  test('supports manual agent activity override', () => {
    const store = createStore()
    store.set(setWorkflowContextAtom, context('execution'))
    store.set(setRightPaneOverrideAtom, 'agent_activity')

    expect(store.get(rightPaneOverrideAtom)).toBe('agent_activity')
    expect(store.get(rightPaneModeAtom)).toBe('agent_activity')
    expect(store.get(rightPaneResolutionAtom).source).toBe('manual')
  })
})
