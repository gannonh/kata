import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '../../../src/renderer/components/layout/AppShell'

function mockClientWidth(width: number): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width
  })

  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', original)
      return
    }

    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
  }
}

describe('AppShell', () => {
  const originalResizeObserver = globalThis.ResizeObserver

  afterEach(() => {
    cleanup()
    globalThis.ResizeObserver = originalResizeObserver
    globalThis.localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.removeProperty('color-scheme')
    vi.restoreAllMocks()
  })

  it('defaults to dark theme and toggles to light and back from top-right switcher', () => {
    const { getByTestId, unmount } = render(<AppShell />)

    const root = getByTestId('app-shell-root')
    expect(root.className).toContain('bg-background')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(globalThis.localStorage.getItem('kata-theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(globalThis.localStorage.getItem('kata-theme')).toBe('dark')

    unmount()
  })

  it('respects a persisted light theme preference on initial render', () => {
    globalThis.localStorage.setItem('kata-theme', 'light')
    render(<AppShell />)

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()
  })

  it('renders columns and supports keyboard panel resizing with window resize fallback', () => {
    const restoreClientWidth = mockClientWidth(1600)
    globalThis.ResizeObserver = undefined

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { getByTestId, unmount } = render(<AppShell />)

    const grid = getByTestId('app-shell-grid')
    const leftResizer = screen.getByLabelText('Resize left panel')
    const rightResizer = screen.getByLabelText('Resize right panel')
    const leftTabList = screen.getByRole('tablist', { name: 'Left panel modules' })

    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Orchestrator Chat' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Spec' })).toBeTruthy()
    expect(leftTabList).toBeTruthy()

    fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
    expect(grid.style.gridTemplateColumns).toContain('332px 10px minmax(420px, 1fr) 10px 360px')

    fireEvent.keyDown(rightResizer, { key: 'ArrowLeft' })
    expect(grid.style.gridTemplateColumns).toContain('332px 10px minmax(420px, 1fr) 10px 372px')

    for (let index = 0; index < 10; index += 1) {
      fireEvent.keyDown(leftResizer, { key: 'ArrowLeft', shiftKey: true })
    }

    expect(grid.style.gridTemplateColumns).toContain('260px 10px minmax(420px, 1fr)')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar navigation' }))
    expect(screen.getByRole('button', { name: 'Expand sidebar navigation' })).toBeTruthy()
    expect(grid.style.gridTemplateColumns).toContain('56px 10px minmax(420px, 1fr)')

    fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: 'Collapse sidebar navigation' })).toBeTruthy()
    expect(grid.style.gridTemplateColumns).toContain('272px 10px minmax(420px, 1fr)')

    window.dispatchEvent(new Event('resize'))

    unmount()

    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))

    restoreClientWidth()
  })

  it('uses ResizeObserver when available and cleans it up on unmount', () => {
    const restoreClientWidth = mockClientWidth(1500)
    const observeSpy = vi.fn()
    const disconnectSpy = vi.fn()
    let observerCallback: ((entries: Array<{ contentRect: { width: number } }>) => void) | undefined

    class MockResizeObserver {
      constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
        observerCallback = callback
      }

      observe = observeSpy
      disconnect = disconnectSpy
    }

    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

    const { getByTestId, unmount } = render(<AppShell />)

    const grid = getByTestId('app-shell-grid')
    const leftResizer = screen.getByLabelText('Resize left panel')
    const rightResizer = screen.getByLabelText('Resize right panel')

    expect(observeSpy).toHaveBeenCalledWith(grid)

    observerCallback?.([{ contentRect: { width: 1700 } }])
    fireEvent.keyDown(leftResizer, { key: 'ArrowRight', shiftKey: true })
    expect(grid.style.gridTemplateColumns).toContain('368px 10px minmax(420px, 1fr) 10px 360px')

    observerCallback?.([])
    fireEvent.keyDown(rightResizer, { key: 'ArrowRight' })
    expect(grid.style.gridTemplateColumns).toContain('368px 10px minmax(420px, 1fr) 10px 348px')

    unmount()

    expect(disconnectSpy).toHaveBeenCalledTimes(1)

    restoreClientWidth()
  })
})
