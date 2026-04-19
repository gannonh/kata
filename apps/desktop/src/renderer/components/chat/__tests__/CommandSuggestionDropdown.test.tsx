// @vitest-environment jsdom

import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { SlashCommandEntry } from '@shared/types'
import { CommandSuggestionDropdown } from '../CommandSuggestionDropdown'

const SUGGESTIONS: SlashCommandEntry[] = [
  { name: '/kata', description: 'Root command', category: 'builtin' },
  { name: '/kata plan', description: 'Plan mode', category: 'builtin' },
]

describe('CommandSuggestionDropdown', () => {
  test('renders nothing when suggestions are empty', () => {
    const anchorRef = createRef<HTMLDivElement>()

    const { container } = render(
      <CommandSuggestionDropdown
        suggestions={[]}
        selectedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
        anchorRef={anchorRef}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  test('renders dropdown with command items', () => {
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <CommandSuggestionDropdown
        suggestions={SUGGESTIONS}
        selectedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
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
        onClose={() => {}}
        anchorRef={anchorRef}
      />,
    )

    expect(screen.getByRole('option', { name: '/kata' }).getAttribute('data-selected')).toBe('false')
    expect(screen.getByRole('option', { name: '/kata plan' }).getAttribute('data-selected')).toBe('true')
  })

  test('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <CommandSuggestionDropdown
        suggestions={SUGGESTIONS}
        selectedIndex={0}
        onSelect={() => {}}
        onClose={onClose}
        anchorRef={anchorRef}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('applies combobox/listbox aria attributes', () => {
    const anchorRef = createRef<HTMLDivElement>()

    render(
      <CommandSuggestionDropdown
        suggestions={SUGGESTIONS}
        selectedIndex={1}
        onSelect={() => {}}
        onClose={() => {}}
        anchorRef={anchorRef}
      />,
    )

    const listbox = screen.getByRole('listbox')
    expect(listbox.getAttribute('aria-activedescendant')).toBe('command-suggestion-1')
    expect(screen.getByRole('option', { name: '/kata plan' }).getAttribute('id')).toBe(
      'command-suggestion-1',
    )
  })
})
