import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mockMessages } from '../../../../src/renderer/mock/messages'
import { useMockChat } from '../../../../src/renderer/hooks/useMockChat'

describe('useMockChat', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with seeded messages and streams assistant output when sending', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useMockChat())

    expect(result.current.messages).toHaveLength(mockMessages.length)
    expect(result.current.isStreaming).toBe(false)

    act(() => {
      result.current.sendMessage('Can you summarize the blockers?')
    })

    expect(result.current.messages.at(-2)?.role).toBe('user')
    expect(result.current.messages.at(-2)?.content).toBe('Can you summarize the blockers?')
    expect(result.current.messages.at(-1)?.role).toBe('assistant')
    expect(result.current.messages.at(-1)?.content).toBe('')
    expect(result.current.isStreaming).toBe(true)

    act(() => {
      vi.advanceTimersByTime(120)
    })

    expect((result.current.messages.at(-1)?.content.length ?? 0) > 0).toBe(true)

    act(() => {
      vi.runAllTimers()
    })

    expect(result.current.isStreaming).toBe(false)
    expect((result.current.messages.at(-1)?.content.length ?? 0) > 0).toBe(true)
  })
})
