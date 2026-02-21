import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MessageList } from '../../../../src/renderer/components/center/MessageList'

function mockScrollHeight(height: number): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => height
  })

  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original)
      return
    }

    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
  }
}

describe('MessageList', () => {
  let restoreScrollHeight: (() => void) | undefined

  afterEach(() => {
    restoreScrollHeight?.()
    restoreScrollHeight = undefined
  })

  it('auto-scrolls to the bottom when messages change', () => {
    restoreScrollHeight = mockScrollHeight(640)

    const { getByTestId, rerender } = render(
      <MessageList>
        <div>Message 1</div>
      </MessageList>
    )

    const messageList = getByTestId('message-list')
    const viewport = messageList.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
    expect(viewport?.scrollTop).toBe(640)

    rerender(
      <MessageList>
        <div>Message 1</div>
        <div>Message 2</div>
      </MessageList>
    )

    expect(viewport?.scrollTop).toBe(640)
  })
})
