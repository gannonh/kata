import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PanelResizer } from '../../../src/renderer/components/layout/PanelResizer'

describe('PanelResizer', () => {
  afterEach(() => {
    cleanup()
  })

  it('supports keyboard resize controls', () => {
    const onDelta = vi.fn()

    render(
      <PanelResizer
        label="Resize panel"
        onDelta={onDelta}
      />
    )

    const separator = screen.getByRole('separator', { name: 'Resize panel' })

    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(separator, { key: 'Enter' })

    expect(onDelta).toHaveBeenNthCalledWith(1, -12)
    expect(onDelta).toHaveBeenNthCalledWith(2, 48)
    expect(onDelta).toHaveBeenCalledTimes(2)
  })

  it('tracks mouse drag deltas and stops tracking after mouseup', () => {
    const onDelta = vi.fn()

    render(
      <PanelResizer
        label="Resize panel"
        onDelta={onDelta}
      />
    )

    const separator = screen.getByRole('separator', { name: 'Resize panel' })

    fireEvent.mouseDown(separator, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 130 })
    fireEvent.mouseMove(window, { clientX: 125 })
    fireEvent.mouseUp(window)
    fireEvent.mouseMove(window, { clientX: 250 })

    expect(onDelta).toHaveBeenNthCalledWith(1, 30)
    expect(onDelta).toHaveBeenNthCalledWith(2, -5)
    expect(onDelta).toHaveBeenCalledTimes(2)
  })

  it('invokes reset handler on double click', () => {
    const onDelta = vi.fn()
    const onReset = vi.fn()

    render(
      <PanelResizer
        label="Resize panel"
        onDelta={onDelta}
        onReset={onReset}
      />
    )

    const separator = screen.getByRole('separator', { name: 'Resize panel' })
    fireEvent.doubleClick(separator)

    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onDelta).not.toHaveBeenCalled()
  })
})
