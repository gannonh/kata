import { describe, expect, test } from 'vitest'
import type { WorkflowBoardSliceCard } from '@shared/types'
import { formatSliceSymphonyHint } from '../SliceCard'

describe('SliceCard symphony hint formatting', () => {
  test('shows unavailable hint when context is missing', () => {
    expect(formatSliceSymphonyHint(null as unknown as WorkflowBoardSliceCard['symphony'])).toBe(
      'Symphony context unavailable',
    )
    expect(formatSliceSymphonyHint(undefined)).toBe('Symphony context unavailable')
  })

  test('shows disconnected hint when runtime is disconnected', () => {
    expect(
      formatSliceSymphonyHint({
        assignmentState: 'unassigned',
        pendingEscalations: 0,
        freshness: 'disconnected',
        provenance: 'runtime-disconnected',
      }),
    ).toBe('Symphony runtime disconnected')
  })

  test('shows stale hint when operator freshness is stale', () => {
    expect(
      formatSliceSymphonyHint({
        assignmentState: 'assigned',
        identifier: 'KAT-2247',
        pendingEscalations: 1,
        freshness: 'stale',
        provenance: 'operator-stale',
        toolName: 'edit',
      }),
    ).toBe('Symphony context is stale')
  })

  test('shows no active execution when unassigned and fresh', () => {
    expect(
      formatSliceSymphonyHint({
        assignmentState: 'unassigned',
        pendingEscalations: 0,
        freshness: 'fresh',
        provenance: 'dashboard-derived',
      }),
    ).toBe('No active Symphony execution')
  })

  test('shows execution tool when assigned and fresh', () => {
    const symphony: WorkflowBoardSliceCard['symphony'] = {
      assignmentState: 'assigned',
      identifier: 'KAT-2247',
      pendingEscalations: 0,
      freshness: 'fresh',
      provenance: 'dashboard-derived',
      toolName: 'bash',
    }

    expect(formatSliceSymphonyHint(symphony)).toBe('Execution: bash')
  })

  test('falls back to active execution label when tool name is missing', () => {
    expect(
      formatSliceSymphonyHint({
        assignmentState: 'assigned',
        identifier: 'KAT-2247',
        pendingEscalations: 0,
        freshness: 'fresh',
        provenance: 'dashboard-derived',
      }),
    ).toBe('Execution: active')
  })
})
