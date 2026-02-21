import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function mockClientWidthRef(initialWidth: number): { setWidth: (nextWidth: number) => void; restore: () => void } {
  let currentWidth = initialWidth
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => currentWidth
  })

  return {
    setWidth: (nextWidth: number) => {
      currentWidth = nextWidth
    },
    restore: () => {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', original)
        return
      }

      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
    }
  }
}

function parseShellColumns(template: string): { left: number; center: number; right: number } {
  const match = template.match(/^(\d+)px 10px (\d+)px 10px (\d+)px$/)
  expect(match).toBeTruthy()

  return {
    left: Number(match?.[1] ?? 0),
    center: Number(match?.[2] ?? 0),
    right: Number(match?.[3] ?? 0)
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
    const rightResizer = screen.getByLabelText('Resize center-right divider')
    const leftTabList = screen.getByRole('tablist', { name: 'Left panel modules' })

    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Orchestrator Chat' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Spec' })).toBeTruthy()
    expect(leftTabList).toBeTruthy()

    const initialColumns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(initialColumns.left).toBe(320)
    expect(initialColumns.center).toBe(initialColumns.right)

    fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
    let columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.left).toBe(332)
    expect(columns.center).toBe(columns.right)

    fireEvent.keyDown(rightResizer, { key: 'ArrowLeft' })
    columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.center).toBeLessThan(columns.right)

    for (let index = 0; index < 10; index += 1) {
      fireEvent.keyDown(leftResizer, { key: 'ArrowLeft', shiftKey: true })
    }

    columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.left).toBe(260)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar navigation' }))
    expect(screen.getByRole('button', { name: 'Expand sidebar navigation' })).toBeTruthy()
    columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.left).toBe(56)

    fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: 'Collapse sidebar navigation' })).toBeTruthy()
    columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.left).toBe(272)

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
    const rightResizer = screen.getByLabelText('Resize center-right divider')

    expect(observeSpy).toHaveBeenCalledWith(grid)

    observerCallback?.([{ contentRect: { width: 1700 } }])
    fireEvent.keyDown(leftResizer, { key: 'ArrowRight', shiftKey: true })
    let columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.left).toBe(368)
    expect(columns.center).toBe(columns.right)

    observerCallback?.([])
    fireEvent.keyDown(rightResizer, { key: 'ArrowRight' })
    columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.center).toBeGreaterThan(columns.right)

    unmount()

    expect(disconnectSpy).toHaveBeenCalledTimes(1)

    restoreClientWidth()
  })

  it('rebalances side columns when available width shrinks to prevent horizontal clipping', async () => {
    const width = mockClientWidthRef(1600)
    globalThis.ResizeObserver = undefined

    const { getByTestId, unmount } = render(<AppShell />)
    const grid = getByTestId('app-shell-grid')

    width.setWidth(1040)
    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      const columns = parseShellColumns(grid.style.gridTemplateColumns)
      expect(columns.left + columns.center + columns.right + 20).toBeLessThanOrEqual(1040)
      expect(columns.left).toBeGreaterThanOrEqual(260)
      expect(columns.center).toBe(columns.right)
      expect(columns.center).toBeGreaterThanOrEqual(300)
      expect(columns.right).toBeGreaterThanOrEqual(300)
    })

    unmount()
    width.restore()
  })

  it('resets center-right split to equal widths on double click', () => {
    const restoreClientWidth = mockClientWidth(1600)
    globalThis.ResizeObserver = undefined

    const { getByTestId, unmount } = render(<AppShell />)
    const grid = getByTestId('app-shell-grid')
    const rightResizer = screen.getByLabelText('Resize center-right divider')

    fireEvent.keyDown(rightResizer, { key: 'ArrowRight', shiftKey: true })
    let columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.center).toBeGreaterThan(columns.right)

    fireEvent.doubleClick(rightResizer)
    columns = parseShellColumns(grid.style.gridTemplateColumns)
    expect(columns.center).toBe(columns.right)

    unmount()
    restoreClientWidth()
  })
})
