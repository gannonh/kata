import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LeftStatusSection } from '../../../../src/renderer/components/left/LeftStatusSection'

describe('LeftStatusSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders title/subtitle, progress segments, and status message', () => {
    render(
      <LeftStatusSection
        title="Build Kata Cloud MVP"
        subtitle="gannonh/kata-cloud"
        tasks={[
          { id: 't1', title: 'Task 1', status: 'done' },
          { id: 't2', title: 'Task 2', status: 'in_progress' }
        ]}
      />
    )

    expect(screen.getByText('Build Kata Cloud MVP')).toBeTruthy()
    expect(screen.getByText('gannonh/kata-cloud')).toBeTruthy()
    expect(screen.getByText('1 of 2 complete.')).toBeTruthy()
    expect(screen.getByLabelText('Status section options')).toBeTruthy()
  })

  it('uses fallback title/subtitle and blocked segment styling when values are missing', () => {
    const { container } = render(
      <LeftStatusSection
        tasks={[
          { id: 't1', title: 'Task 1', status: 'done' },
          { id: 't2', title: 'Task 2', status: 'blocked' }
        ]}
      />
    )

    expect(screen.getByText('Build Kata Cloud MVP')).toBeTruthy()
    expect(screen.getByText('gannonh/kata-cloud')).toBeTruthy()
    expect(screen.getByText('1 of 2 complete.')).toBeTruthy()

    const blockedSegment = container.querySelector('[data-segment-status="blocked"]')
    expect(blockedSegment?.className).toContain('bg-status-blocked/85')
  })

  it('supports keyboard-accessible preview cycling behavior', () => {
    let toggleCount = 0

    render(
      <LeftStatusSection
        tasks={[{ id: 't1', title: 'Task 1', status: 'todo' }]}
        previewState={2}
        onCyclePreviewState={() => {
          toggleCount += 1
        }}
      />
    )

    const statusSection = screen.getByLabelText('Left panel status')
    const cyclePreviewStateButton = screen.getByRole('button', { name: 'Cycle status preview state' })
    fireEvent.click(cyclePreviewStateButton)

    expect(statusSection.getAttribute('role')).toBeNull()
    expect(cyclePreviewStateButton.getAttribute('aria-pressed')).toBe('true')
    expect(toggleCount).toBe(1)
  })

  it('renders color-coded preview buttons and allows direct selection', () => {
    const selected: number[] = []

    render(
      <LeftStatusSection
        tasks={[{ id: 't1', title: 'Task 1', status: 'todo' }]}
        previewState={1}
        onSelectPreviewState={(state) => selected.push(state)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show preview state 3' }))

    expect(screen.getByRole('button', { name: 'Show preview state 1' }).getAttribute('aria-pressed')).toBe('true')
    expect(selected).toEqual([3])
  })

  it('does not bubble options button clicks to preview cycle handler', () => {
    let cycleCount = 0

    render(
      <LeftStatusSection
        tasks={[{ id: 't1', title: 'Task 1', status: 'todo' }]}
        onCyclePreviewState={() => {
          cycleCount += 1
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Status section options' }))

    expect(cycleCount).toBe(0)
  })

  it('renders static text instead of button when non-interactive', () => {
    render(
      <LeftStatusSection
        tasks={[
          { id: 't1', title: 'Task 1', status: 'done' },
          { id: 't2', title: 'Task 2', status: 'todo' }
        ]}
      />
    )

    expect(screen.getByText('1 of 2 complete.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cycle status preview state' })).toBeNull()
  })
})
