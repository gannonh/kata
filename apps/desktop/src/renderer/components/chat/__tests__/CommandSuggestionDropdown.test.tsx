// @vitest-environment jsdom

import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { SlashCommandEntry } from '@shared/types'
import { CommandSuggestionDropdown } from '../CommandSuggestionDropdown'

beforeAll(() => {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverMock,
    writable: true,
    configurable: true,
  })

  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }
})

afterEach(() => {
  cleanup()
})

const SUGGESTIONS: SlashCommandEntry[] = [
  { name: '/kata', description: 'Root command', category: 'builtin' },
  { name: '/kata plan', description: 'Plan mode', category: 'builtin' },
]

describe('CommandSuggestionDropdown', () => {
  test('renders nothing when suggestions are empty and not loading', () => {
    const anchorRef = createRef<HTMLDivElement>()

    const { container } = render(
      <CommandSuggestionDropdown
        suggestions={[]}
        selectedIndex={0}
        onSelect={() => {}}
        anchorRef={anchorRef}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  test('renders loading state when isLoading is true', () => {
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <CommandSuggestionDropdown
        suggestions={[]}
        selectedIndex={0}
        isOpen
        isLoading
        onSelect={() => {}}
        anchorRef={anchorRef}
      />,
    )

    expect(screen.getByRole('status').textContent).toContain('Loading commands')
    expect(screen.queryByRole('listbox')).not.toBeNull()
  })

  test('renders dropdown with command items', () => {
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <CommandSuggestionDropdown
        suggestions={SUGGESTIONS}
        selectedIndex={0}
        onSelect={() => {}}
        anchorRef={anchorRef}
      />,
    )

    expect(screen.queryByRole('listbox')).not.toBeNull()
    expect(screen.queryByRole('option', { name: '/kata' })).not.toBeNull()
    expect(screen.queryByRole('option', { name: '/kata plan' })).not.toBeNull()
  })

  test('highlights the selected item', () => {
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <CommandSuggestionDropdown
        suggestions={SUGGESTIONS}
        selectedIndex={1}
        onSelect={() => {}}
        anchorRef={anchorRef}
      />,
    )

    const options = screen.getAllByRole('option')
    expect(options[0]?.getAttribute('aria-selected')).toBe('false')
    expect(options[1]?.getAttribute('aria-selected')).toBe('true')
  })

  test('calls onSelect when a suggestion is clicked', () => {
    const onSelect = vi.fn()
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <CommandSuggestionDropdown
        suggestions={SUGGESTIONS}
        selectedIndex={0}
        onSelect={onSelect}
        anchorRef={anchorRef}
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: '/kata plan' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(SUGGESTIONS[1])
  })
})
