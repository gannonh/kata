// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SlashCommandEntry } from '@shared/types'
import { useCommandSuggestions } from '@/hooks/useCommandSuggestions'
import { MessageInput } from '../MessageInput'

vi.mock('@/hooks/useCommandSuggestions', () => ({
  useCommandSuggestions: vi.fn(),
}))

const mockUseCommandSuggestions = vi.mocked(useCommandSuggestions)

const SUGGESTIONS: SlashCommandEntry[] = [
  { name: '/kata', description: 'Root command', category: 'builtin' },
  { name: '/kata plan', description: 'Plan mode', category: 'builtin' },
]

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

beforeEach(() => {
  mockUseCommandSuggestions.mockReturnValue({
    suggestions: [],
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    isOpen: false,
    isLoading: false,
    moveSelection: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MessageInput', () => {
  test('applies combobox aria attributes to textarea when suggestions are open', () => {
    mockUseCommandSuggestions.mockReturnValue({
      suggestions: SUGGESTIONS,
      selectedIndex: 1,
      setSelectedIndex: vi.fn(),
      isOpen: true,
      isLoading: false,
      moveSelection: vi.fn(),
    })

    render(
      <MessageInput
        onSubmit={async () => {}}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input')
    fireEvent.change(textarea, { target: { value: '/ka' } })

    expect(textarea.getAttribute('role')).toBe('combobox')
    expect(textarea.getAttribute('aria-controls')).toBe('command-suggestion-listbox')
    expect(textarea.getAttribute('aria-activedescendant')).toBe('command-suggestion-1')
  })

  test('Enter commits selected suggestion instead of submitting message', async () => {
    const onSubmit = vi.fn(async () => {})

    mockUseCommandSuggestions.mockReturnValue({
      suggestions: SUGGESTIONS,
      selectedIndex: 1,
      setSelectedIndex: vi.fn(),
      isOpen: true,
      isLoading: false,
      moveSelection: vi.fn(),
    })

    render(
      <MessageInput
        onSubmit={onSubmit}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '/ka' } })
    textarea.setSelectionRange(3, 3)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('/kata plan ')
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('Enter submits message when suggestions are not open', async () => {
    const onSubmit = vi.fn(async () => {})

    render(
      <MessageInput
        onSubmit={onSubmit}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input')
    fireEvent.change(textarea, { target: { value: 'hello world' } })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(onSubmit).toHaveBeenCalledWith('hello world')
    })
  })
})
