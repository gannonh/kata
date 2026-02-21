import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'

describe('MessageList null-ref guard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unmock('react')
  })

  it('returns early when the list ref is unavailable', async () => {
    vi.resetModules()
    vi.doMock('../../../../src/renderer/components/ui/scroll-area', () => ({
      ScrollArea: ({ children }: { children: unknown }) =>
        createElement('div', { 'data-testid': 'mock-scroll-area' }, children)
    }))

    const { MessageList } = await import('../../../../src/renderer/components/center/MessageList')
    expect(() => {
      render(
        <MessageList>
          <div>Message 1</div>
        </MessageList>
      )
    }).not.toThrow()

    expect(screen.getByTestId('mock-scroll-area')).toBeTruthy()
  })
})
