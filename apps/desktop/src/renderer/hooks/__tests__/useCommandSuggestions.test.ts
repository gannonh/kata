// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SlashCommandEntry, SlashCommandsResponse } from '@shared/types'
import { useCommandSuggestions } from '../useCommandSuggestions'

const COMMANDS: SlashCommandEntry[] = [
  { name: '/kata', description: 'Root command', category: 'builtin' },
  { name: '/kata plan', description: 'Plan mode', category: 'builtin' },
  { name: '/skill:frontend-design', description: 'Skill command', category: 'skill' },
]

const successResponse: SlashCommandsResponse = {
  success: true,
  commands: COMMANDS,
}

const getSlashCommandsMock = vi.fn<() => Promise<SlashCommandsResponse>>()

function createWrapper() {
  const store = createStore()

  return ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children)
}

describe('useCommandSuggestions', () => {
  beforeEach(() => {
    getSlashCommandsMock.mockReset()
    ;(window as unknown as { api: { getSlashCommands: typeof getSlashCommandsMock } }).api = {
      getSlashCommands: getSlashCommandsMock,
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('returns empty suggestions when input does not start with slash', async () => {
    getSlashCommandsMock.mockResolvedValue(successResponse)

    const { result } = renderHook(() => useCommandSuggestions('hello kata'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.suggestions).toEqual([])
    expect(result.current.isOpen).toBe(false)
  })

  test('returns all commands when input is exactly slash', async () => {
    getSlashCommandsMock.mockResolvedValue(successResponse)

    const { result } = renderHook(() => useCommandSuggestions('/'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(3)
    })

    expect(result.current.suggestions.map((entry) => entry.name)).toEqual([
      '/kata',
      '/kata plan',
      '/skill:frontend-design',
    ])
    expect(result.current.isOpen).toBe(true)
  })

  test('filters commands by slash prefix case-insensitively', async () => {
    getSlashCommandsMock.mockResolvedValue(successResponse)

    const { result, rerender } = renderHook(({ value }) => useCommandSuggestions(value), {
      wrapper: createWrapper(),
      initialProps: { value: '/ka' },
    })

    await waitFor(() => {
      expect(result.current.suggestions.length).toBeGreaterThan(0)
    })

    expect(result.current.suggestions.map((entry) => entry.name)).toEqual(['/kata', '/kata plan'])

    rerender({ value: '/SKILL:' })

    await waitFor(() => {
      expect(result.current.suggestions.map((entry) => entry.name)).toEqual(['/skill:frontend-design'])
    })
  })

  test('exposes loading state while commands are being fetched', async () => {
    let resolveFetch: ((value: SlashCommandsResponse) => void) | undefined

    getSlashCommandsMock.mockImplementation(
      () =>
        new Promise<SlashCommandsResponse>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { result } = renderHook(() => useCommandSuggestions('/'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
    })

    resolveFetch?.(successResponse)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.suggestions).toHaveLength(3)
    })
  })

  test('tracks selected index and wraps keyboard navigation', async () => {
    getSlashCommandsMock.mockResolvedValue(successResponse)

    const { result } = renderHook(() => useCommandSuggestions('/'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(3)
    })

    expect(result.current.selectedIndex).toBe(0)

    act(() => {
      result.current.moveSelection(1)
    })
    expect(result.current.selectedIndex).toBe(1)

    act(() => {
      result.current.moveSelection(10)
    })
    expect(result.current.selectedIndex).toBe(2)

    act(() => {
      result.current.moveSelection(-1)
    })
    expect(result.current.selectedIndex).toBe(1)

    act(() => {
      result.current.setSelectedIndex(2)
      result.current.moveSelection(1)
    })
    expect(result.current.selectedIndex).toBe(0)
  })
})
