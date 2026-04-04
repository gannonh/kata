import { describe, expect, test } from 'vitest'
import type { WorkflowBoardSliceCard } from '@shared/types'
import { formatSliceSymphonyHint } from '../SliceCard'

describe('SliceCard symphony hint formatting', () => {
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
})
