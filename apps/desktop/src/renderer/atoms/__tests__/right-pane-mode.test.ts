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
    reason: mode === 'planning' ? 'planning_activity_detected' : 'tracker_configured_board_pending',
    planningActive: mode === 'planning',
    trackerConfigured: true,
    boardAvailable: mode === 'execution',
    updatedAt: new Date().toISOString(),
  }
}

describe('right-pane mode resolver', () => {
  test('uses automatic planning mode when planning context is active', () => {
    const store = createStore()
    store.set(setWorkflowContextAtom, context('planning'))

    expect(store.get(rightPaneModeAtom)).toBe('planning')
    expect(store.get(rightPaneResolutionAtom).source).toBe('automatic')
  })

  test('uses automatic kanban mode when execution context is active', () => {
    const store = createStore()
    store.set(setWorkflowContextAtom, context('execution'))

    expect(store.get(rightPaneModeAtom)).toBe('kanban')
    expect(store.get(rightPaneResolutionAtom).reason).toBe('tracker_configured_board_pending')
  })

  test('manual override persists until cleared', () => {
    const store = createStore()
    store.set(setWorkflowContextAtom, context('planning'))
    store.set(setRightPaneOverrideAtom, 'kanban')

    expect(store.get(rightPaneOverrideAtom)).toBe('kanban')
    expect(store.get(rightPaneModeAtom)).toBe('kanban')
    expect(store.get(rightPaneResolutionAtom).source).toBe('manual')

    store.set(clearRightPaneOverrideAtom)

    expect(store.get(rightPaneOverrideAtom)).toBeNull()
    expect(store.get(rightPaneModeAtom)).toBe('planning')
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
