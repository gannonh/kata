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

function setupSuggestionsMock({
  selectedIndex = 1,
  keepSuggestionsVisibleAfterAccept = false,
}: {
  selectedIndex?: number
  keepSuggestionsVisibleAfterAccept?: boolean
} = {}): void {
  let currentIndex = selectedIndex

  mockUseCommandSuggestions.mockImplementation((input: string) => {
    const slashTriggered = input.startsWith('/')
    const hasTrailingSpace = input.endsWith(' ')
    const showSuggestionEntries = slashTriggered && (keepSuggestionsVisibleAfterAccept || !hasTrailingSpace)

    return {
      suggestions: showSuggestionEntries ? SUGGESTIONS : [],
      selectedIndex: currentIndex,
      setSelectedIndex: (nextIndex: number) => {
        currentIndex = nextIndex
      },
      isOpen: slashTriggered,
      isLoading: false,
      moveSelection: vi.fn(),
    }
  })
}

beforeEach(() => {
  setupSuggestionsMock()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MessageInput slash acceptance', () => {
  test('Tab accepts highlighted suggestion, inserts trailing space, and keeps focus/caret at end', async () => {
    const onSubmit = vi.fn(async () => {})

    render(
      <MessageInput
        onSubmit={onSubmit}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '/ka' } })
    textarea.focus()
    textarea.setSelectionRange(3, 3)

    fireEvent.keyDown(textarea, { key: 'Tab' })

    await waitFor(() => {
      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement
      expect(input.value).toBe('/kata plan ')
      expect(input.selectionStart).toBe(input.value.length)
      expect(input.selectionEnd).toBe(input.value.length)
      expect(input.getAttribute('aria-expanded')).toBe('false')
    })

    expect(document.activeElement).toBe(textarea)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('command-suggestion-dropdown')).toBeNull()
  })

  test('Enter accepts highlighted suggestion without submitting', async () => {
    const onSubmit = vi.fn(async () => {})

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

  test('Esc dismisses suggestions without mutating input or submitting', () => {
    const onSubmit = vi.fn(async () => {})

    render(
      <MessageInput
        onSubmit={onSubmit}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '/ka' } })

    expect(screen.queryByTestId('command-suggestion-dropdown')).not.toBeNull()

    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('/ka')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('command-suggestion-dropdown')).toBeNull()
  })

  test('Enter submits when suggestions are closed', async () => {
    const onSubmit = vi.fn(async () => {})

    mockUseCommandSuggestions.mockReturnValue({
      suggestions: [],
      selectedIndex: 0,
      setSelectedIndex: vi.fn(),
      isOpen: false,
      isLoading: false,
      moveSelection: vi.fn(),
    })

    render(
      <MessageInput
        onSubmit={onSubmit}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input')
    fireEvent.change(textarea, { target: { value: 'ship it' } })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('ship it')
    })
  })

  test('logs SLASH_ACCEPT_NO_SELECTION when Enter is pressed with no active suggestion', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockUseCommandSuggestions.mockReturnValue({
      suggestions: [],
      selectedIndex: 0,
      setSelectedIndex: vi.fn(),
      isOpen: true,
      isLoading: true,
      moveSelection: vi.fn(),
    })

    render(
      <MessageInput
        onSubmit={async () => {}}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '/ka' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(warnSpy).toHaveBeenCalledWith(
      '[SlashAutocomplete]',
      expect.objectContaining({
        code: 'SLASH_ACCEPT_NO_SELECTION',
        key: 'Enter',
        selectedIndex: 0,
        suggestionCount: 0,
      }),
    )
  })

  test('prevents duplicate command insertion when acceptance is triggered twice in rapid succession', async () => {
    setupSuggestionsMock({ keepSuggestionsVisibleAfterAccept: true })
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    render(
      <MessageInput
        onSubmit={async () => {}}
        onStop={async () => {}}
      />,
    )

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '/ka' } })
    textarea.setSelectionRange(3, 3)

    fireEvent.keyDown(textarea, { key: 'Enter' })
    fireEvent.click(screen.getByRole('option', { name: '/kata plan' }))

    await waitFor(() => {
      expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('/kata plan ')
    })

    expect(debugSpy).toHaveBeenCalledWith(
      '[SlashAutocomplete]',
      expect.objectContaining({
        code: 'SLASH_ACCEPT_SUPPRESSED_DUPLICATE',
      }),
    )
  })
})
