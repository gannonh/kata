import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppShell, THEME_STORAGE_KEY } from '../../../src/renderer/components/layout/AppShell'

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
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    unmount()
  })

  it('respects a persisted light theme preference on initial render', () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'light')
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

    // Default: equal split → 320 + 10 + 630 + 10 + 630
    expect(grid.style.gridTemplateColumns).toBe('320px 10px 630px 10px 630px')

    fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
    expect(grid.style.gridTemplateColumns).toBe('332px 10px 624px 10px 624px')

    fireEvent.keyDown(rightResizer, { key: 'ArrowLeft' })
    expect(grid.style.gridTemplateColumns).toBe('332px 10px 612px 10px 636px')

    for (let index = 0; index < 10; index += 1) {
      fireEvent.keyDown(leftResizer, { key: 'ArrowLeft', shiftKey: true })
    }

    expect(grid.style.gridTemplateColumns).toBe('260px 10px 648px 10px 672px')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar navigation' }))
    expect(screen.getByRole('button', { name: 'Expand sidebar navigation' })).toBeTruthy()
    expect(grid.style.gridTemplateColumns).toBe('56px 10px 750px 10px 774px')

    fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: 'Collapse sidebar navigation' })).toBeTruthy()
    expect(grid.style.gridTemplateColumns).toBe('272px 10px 642px 10px 666px')

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
    expect(grid.style.gridTemplateColumns).toBe('368px 10px 656px 10px 656px')

    observerCallback?.([])
    fireEvent.keyDown(rightResizer, { key: 'ArrowRight' })
    expect(grid.style.gridTemplateColumns).toBe('368px 10px 568px 10px 544px')

    unmount()

    expect(disconnectSpy).toHaveBeenCalledTimes(1)

    restoreClientWidth()
  })

  it('resets right panel offset to equal split on double-click', () => {
    const restoreClientWidth = mockClientWidth(1600)
    globalThis.ResizeObserver = undefined

    const { getByTestId, unmount } = render(<AppShell />)
    const grid = getByTestId('app-shell-grid')
    const rightResizer = screen.getByLabelText('Resize right panel')

    // Default: equal split
    expect(grid.style.gridTemplateColumns).toBe('320px 10px 630px 10px 630px')

    // Drag right resizer to create offset
    fireEvent.keyDown(rightResizer, { key: 'ArrowLeft' })
    expect(grid.style.gridTemplateColumns).toBe('320px 10px 618px 10px 642px')

    // Double-click resets to equal
    fireEvent.doubleClick(rightResizer)
    expect(grid.style.gridTemplateColumns).toBe('320px 10px 630px 10px 630px')

    unmount()
    restoreClientWidth()
  })
})
