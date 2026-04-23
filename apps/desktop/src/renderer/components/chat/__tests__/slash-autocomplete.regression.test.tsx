// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { useSetAtom } from 'jotai'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SlashCommandEntry, SlashCommandsResponse } from '@shared/types'
import { refreshCommandsAtom } from '@/atoms/commands'
import { useCommandSuggestions } from '@/hooks/useCommandSuggestions'
import { MessageInput } from '../MessageInput'

const BASE_COMMANDS: SlashCommandEntry[] = [
  { name: 'kata', description: 'Kata workflow command surface', category: 'builtin' },
  { name: 'kata plan', description: 'Plan mode', category: 'builtin' },
  { name: 'symphony', description: 'Symphony controls', category: 'builtin' },
  { name: '/skill:frontend-design', description: 'Frontend design skill', category: 'skill' },
]

const getSlashCommandsMock = vi.fn<() => Promise<SlashCommandsResponse>>()

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

function setupWindowApi(): void {
  ;(window as unknown as { api: { getSlashCommands: typeof getSlashCommandsMock } }).api = {
    getSlashCommands: getSlashCommandsMock,
  }
}

function createWrapper() {
  const store = createStore()
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children)
}

function renderComposer() {
  const onSubmit = vi.fn(async () => {})

  render(
    <Provider store={createStore()}>
      <MessageInput
        onSubmit={onSubmit}
        onStop={async () => {}}
      />
    </Provider>,
  )

  const input = screen.getByTestId('chat-input') as HTMLTextAreaElement
  return { input, onSubmit }
}

describe('slash-autocomplete regression matrix', () => {
  beforeEach(() => {
    getSlashCommandsMock.mockReset()
    getSlashCommandsMock.mockResolvedValue({
      success: true,
      commands: BASE_COMMANDS,
    })
    setupWindowApi()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('[R001] slash prefix opens autocomplete dropdown in the composer', async () => {
    const { input } = renderComposer()

    fireEvent.change(input, { target: { value: '/' } })

    await waitFor(() => {
      expect(screen.queryByTestId('command-suggestion-dropdown')).not.toBeNull()
      expect(input.getAttribute('aria-expanded')).toBe('true')
    })
  })

  test('[R002][R003] dropdown inventory includes builtin commands and /skill:* entries', async () => {
    const { input } = renderComposer()

    fireEvent.change(input, { target: { value: '/' } })

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: '/kata' })).not.toBeNull()
      expect(screen.queryByRole('option', { name: '/symphony' })).not.toBeNull()
      expect(screen.queryByRole('option', { name: '/skill:frontend-design' })).not.toBeNull()
    })
  })

  test('[R004] command refresh picks up newly discovered /skill:* entries', async () => {
    getSlashCommandsMock
      .mockResolvedValueOnce({
        success: true,
        commands: BASE_COMMANDS.filter((entry) => entry.category === 'builtin'),
      })
      .mockResolvedValueOnce({
        success: true,
        commands: BASE_COMMANDS,
      })

    const { result } = renderHook(
      () => {
        const suggestions = useCommandSuggestions('/')
        const refreshCommands = useSetAtom(refreshCommandsAtom)

        return {
          suggestions,
          refreshCommands,
        }
      },
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      const names = result.current.suggestions.suggestions.map((entry) => entry.name)
      expect(names).toContain('/kata')
      expect(names).toContain('/kata plan')
      expect(names).toContain('/symphony')
      expect(names).not.toContain('/skill:frontend-design')
    })

    act(() => {
      result.current.refreshCommands()
    })

    await waitFor(() => {
      const names = result.current.suggestions.suggestions.map((entry) => entry.name)
      expect(names).toContain('/kata')
      expect(names).toContain('/kata plan')
      expect(names).toContain('/symphony')
      expect(names).toContain('/skill:frontend-design')
    })
  })

  test('[R005] ArrowUp/ArrowDown route selection through suggestions without moving caret', async () => {
    const { input } = renderComposer()

    fireEvent.change(input, { target: { value: '/ka' } })

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: '/kata' })).not.toBeNull()
      expect(screen.queryByRole('option', { name: '/kata plan' })).not.toBeNull()
    })

    // Dropdown opens with index 0 preselected (`/kata`); ArrowDown should move to the next option.
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '/kata' }).getAttribute('aria-selected')).toBe('true')
    })

    fireEvent.keyDown(input, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(screen.getByRole('option', { name: '/kata plan' }).getAttribute('aria-selected')).toBe('true')
    })

    fireEvent.keyDown(input, { key: 'ArrowUp' })

    await waitFor(() => {
      expect(screen.getByRole('option', { name: '/kata' }).getAttribute('aria-selected')).toBe('true')
    })
  })

  test('[R006] Enter accepts the highlighted suggestion with trailing space + SLASH_ACCEPTED diagnostic', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { input, onSubmit } = renderComposer()

    fireEvent.change(input, { target: { value: '/ka' } })

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: '/kata plan' })).not.toBeNull()
    })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('/kata plan ')
      expect(screen.queryByTestId('command-suggestion-dropdown')).toBeNull()
    })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(debugSpy).toHaveBeenCalledWith(
      '[SlashAutocomplete]',
      expect.objectContaining({
        code: 'SLASH_ACCEPTED',
        key: 'Enter',
      }),
    )
  })

  test('[R006] Tab accepts the highlighted suggestion and keeps focus in the textarea', async () => {
    const { input, onSubmit } = renderComposer()

    fireEvent.change(input, { target: { value: '/ka' } })

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: '/kata plan' })).not.toBeNull()
    })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Tab' })

    await waitFor(() => {
      const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
      expect(textarea.value).toBe('/kata plan ')
      expect(textarea.selectionStart).toBe(textarea.value.length)
      expect(textarea.selectionEnd).toBe(textarea.value.length)
    })

    expect(document.activeElement).toBe(input)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('[R007] Escape dismisses suggestions without mutating slash input', async () => {
    const { input, onSubmit } = renderComposer()

    fireEvent.change(input, { target: { value: '/ka' } })

    await waitFor(() => {
      expect(screen.queryByTestId('command-suggestion-dropdown')).not.toBeNull()
    })

    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByTestId('command-suggestion-dropdown')).toBeNull()
      expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('/ka')
    })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('diagnostic contract emits SLASH_ACCEPT_NO_SELECTION when Enter is pressed in loading/no-selection state', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    getSlashCommandsMock.mockImplementation(
      () =>
        new Promise<SlashCommandsResponse>(() => {
          // keep loading state active for this assertion
        }),
    )

    const { input, onSubmit } = renderComposer()

    fireEvent.change(input, { target: { value: '/ka' } })

    await waitFor(() => {
      expect(input.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('status').textContent).toContain('Loading commands')
    })

    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('/ka')
    })

    expect(warnSpy).toHaveBeenCalledWith(
      '[SlashAutocomplete]',
      expect.objectContaining({
        code: 'SLASH_ACCEPT_NO_SELECTION',
        key: 'Enter',
      }),
    )
  })
})
