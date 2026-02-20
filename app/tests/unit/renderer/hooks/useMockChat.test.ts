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

  it('ignores empty input and ignores sends while a response is streaming', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useMockChat())
    const initialCount = result.current.messages.length

    act(() => {
      result.current.sendMessage('   ')
    })

    expect(result.current.messages).toHaveLength(initialCount)
    expect(result.current.isStreaming).toBe(false)

    act(() => {
      result.current.sendMessage('first')
    })

    expect(result.current.isStreaming).toBe(true)
    const countAfterFirstSend = result.current.messages.length

    act(() => {
      result.current.sendMessage('second should be ignored')
    })

    expect(result.current.messages).toHaveLength(countAfterFirstSend)
    expect(result.current.messages.at(-2)?.content).toBe('first')
  })

  it('clears the pending stream timer on unmount', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    const { result, unmount } = renderHook(() => useMockChat())

    act(() => {
      result.current.sendMessage('cleanup test')
    })

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
