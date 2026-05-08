import { createStore } from 'jotai'
import { describe, expect, test } from 'vitest'
import type { WorkflowBoardSnapshot, WorkflowColumnId } from '@shared/types'
import {
  collapsedWorkflowColumnsAtom,
  hasExplicitColumnOverridesAtom,
  resetColumnCollapseOverridesAtom,
  toggleWorkflowColumnCollapsedAtom,
  workflowBoardAtom,
} from '../workflow-board'

function makeSnapshot(columnCardCounts: Partial<Record<WorkflowColumnId, number>>): WorkflowBoardSnapshot {
  const columnIds: WorkflowColumnId[] = [
    'backlog',
    'todo',
    'in_progress',
    'agent_review',
    'human_review',
    'merging',
    'done',
  ]

  return {
    backend: 'linear',
    fetchedAt: new Date().toISOString(),
    status: 'fresh',
    source: { projectId: 'project-1' },
    activeMilestone: { id: 'milestone-1', name: 'M001' },
    columns: columnIds.map((id) => ({
      id,
      title: id,
      cards: Array.from({ length: columnCardCounts[id] ?? 0 }, (_, i) => ({
        id: `${id}-card-${i}`,
        identifier: `KAT-${i}`,
        title: `Card ${i}`,
        columnId: id,
        stateName: id,
        stateType: 'started',
        milestoneId: 'milestone-1',
        milestoneName: 'M001',
        taskCounts: { total: 0, done: 0 },
        tasks: [],
      })),
    })),
    poll: {
      status: 'success',
      backend: 'linear',
      lastAttemptAt: new Date().toISOString(),
    },
  }
}

describe('workflow board column collapse auto-presentation', () => {
  test('auto-collapses empty columns when no explicit state exists', () => {
    const store = createStore()
    store.set(workflowBoardAtom, makeSnapshot({
      todo: 2,
      in_progress: 1,
    }))

    const collapsed = store.get(collapsedWorkflowColumnsAtom)

    // Columns with cards should NOT be collapsed
    expect(collapsed.has('todo')).toBe(false)
    expect(collapsed.has('in_progress')).toBe(false)

    // Empty columns should be collapsed
    expect(collapsed.has('backlog')).toBe(true)
    expect(collapsed.has('agent_review')).toBe(true)
    expect(collapsed.has('done')).toBe(true)
  })

  test('auto-expands columns that gain cards between snapshots', () => {
    const store = createStore()

    // Initial snapshot: backlog is empty, auto-collapsed
    store.set(workflowBoardAtom, makeSnapshot({
      todo: 2,
    }))

    let collapsed = store.get(collapsedWorkflowColumnsAtom)
    expect(collapsed.has('backlog')).toBe(true)

    // New snapshot: backlog gains a card
    store.set(workflowBoardAtom, makeSnapshot({
      todo: 2,
      backlog: 1,
    }))

    collapsed = store.get(collapsedWorkflowColumnsAtom)
    expect(collapsed.has('backlog')).toBe(false)
  })

  test('explicit collapse persists across snapshot change', () => {
    const store = createStore()

    store.set(workflowBoardAtom, makeSnapshot({
      todo: 2,
      in_progress: 1,
    }))

    // User explicitly collapses 'todo'
    store.set(toggleWorkflowColumnCollapsedAtom, 'todo')

    let collapsed = store.get(collapsedWorkflowColumnsAtom)
    expect(collapsed.has('todo')).toBe(true)

    // Snapshot changes (simulated refresh with same distribution)
    store.set(workflowBoardAtom, makeSnapshot({
      todo: 3,
      in_progress: 1,
    }))

    collapsed = store.get(collapsedWorkflowColumnsAtom)
    // Explicit collapse should persist even though todo has cards
    expect(collapsed.has('todo')).toBe(true)
  })

  test('explicit expand of empty column persists', () => {
    const store = createStore()

    store.set(workflowBoardAtom, makeSnapshot({
      todo: 2,
    }))

    // backlog is auto-collapsed (empty). User explicitly expands it.
    // Toggle removes it from collapsed set, then stores that as explicit state.
    store.set(toggleWorkflowColumnCollapsedAtom, 'backlog')

    const collapsed = store.get(collapsedWorkflowColumnsAtom)
    expect(collapsed.has('backlog')).toBe(false)

    // Update snapshot — backlog is still empty but explicitly expanded
    store.set(workflowBoardAtom, makeSnapshot({
      todo: 3,
    }))

    const afterRefresh = store.get(collapsedWorkflowColumnsAtom)
    expect(afterRefresh.has('backlog')).toBe(false)
  })

  test('reset clears overrides and returns to auto behavior', () => {
    const store = createStore()

    store.set(workflowBoardAtom, makeSnapshot({
      todo: 2,
      in_progress: 1,
    }))

    // User explicitly collapses 'todo'
    store.set(toggleWorkflowColumnCollapsedAtom, 'todo')

    let collapsed = store.get(collapsedWorkflowColumnsAtom)
    expect(collapsed.has('todo')).toBe(true)
    expect(store.get(hasExplicitColumnOverridesAtom)).toBe(true)

    // Reset overrides
    store.set(resetColumnCollapseOverridesAtom)

    expect(store.get(hasExplicitColumnOverridesAtom)).toBe(false)

    collapsed = store.get(collapsedWorkflowColumnsAtom)
    // todo has cards, so auto-presentation should show it expanded
    expect(collapsed.has('todo')).toBe(false)
    // Empty columns should be auto-collapsed again
    expect(collapsed.has('backlog')).toBe(true)
    expect(collapsed.has('done')).toBe(true)
  })

  test('hasExplicitColumnOverridesAtom reflects stored state', () => {
    const store = createStore()

    store.set(workflowBoardAtom, makeSnapshot({
      todo: 1,
    }))

    expect(store.get(hasExplicitColumnOverridesAtom)).toBe(false)

    store.set(toggleWorkflowColumnCollapsedAtom, 'todo')
    expect(store.get(hasExplicitColumnOverridesAtom)).toBe(true)

    store.set(resetColumnCollapseOverridesAtom)
    expect(store.get(hasExplicitColumnOverridesAtom)).toBe(false)
  })
})
