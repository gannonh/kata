// @vitest-environment jsdom

import { createRef } from 'react'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
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

describe('CommandSuggestionDropdown acceptance behavior', () => {
  test('invokes onSelect with selected suggestion when an option is chosen', () => {
    const onSelect = vi.fn()
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <>
        <div ref={anchorRef} />
        <CommandSuggestionDropdown
          suggestions={SUGGESTIONS}
          selectedIndex={1}
          onSelect={onSelect}
          anchorRef={anchorRef}
          isOpen
        />
      </>,
    )

    fireEvent.click(screen.getByRole('option', { name: '/kata plan' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(SUGGESTIONS[1])
  })

  test('prevents default on mousedown to preserve textarea focus during acceptance', () => {
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <>
        <div ref={anchorRef} />
        <CommandSuggestionDropdown
          suggestions={SUGGESTIONS}
          selectedIndex={0}
          onSelect={() => {}}
          anchorRef={anchorRef}
          isOpen
        />
      </>,
    )

    const option = screen.getByRole('option', { name: '/kata' })
    const mouseDownEvent = createEvent.mouseDown(option)

    fireEvent(option, mouseDownEvent)

    expect(mouseDownEvent.defaultPrevented).toBe(true)
  })

  test('renders empty state and does not call onSelect when suggestions are empty', () => {
    const onSelect = vi.fn()
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <>
        <div ref={anchorRef} />
        <CommandSuggestionDropdown
          suggestions={[]}
          selectedIndex={0}
          onSelect={onSelect}
          anchorRef={anchorRef}
          isOpen
        />
      </>,
    )

    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.getByText('No commands found')).not.toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
