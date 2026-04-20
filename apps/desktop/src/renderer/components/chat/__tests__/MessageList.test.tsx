// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ChatMessageView } from '@/atoms/chat'

vi.mock('../StreamingMessage', () => ({
  StreamingMessage: ({ content, isStreaming }: { content: string; isStreaming: boolean }) => (
    <div>{isStreaming && content.length === 0 ? 'Working…' : content}</div>
  ),
}))

vi.mock('../ThinkingBlock', () => ({
  ThinkingBlock: () => <div>Thinking…</div>,
}))

vi.mock('../ToolCallCard', () => ({
  ToolCallCard: () => <div>Tool</div>,
}))

import { MessageList } from '../MessageList'

function userMessage(content: string): ChatMessageView {
  return {
    id: `user:${content}`,
    role: 'user',
    content,
    streaming: false,
    isThinking: false,
  }
}

afterEach(() => {
  cleanup()
})

describe('MessageList', () => {
  test('shows working indicator while waiting for first assistant event', () => {
    render(<MessageList messages={[userMessage('/kata plan')]} tools={[]} isStreaming />)

    expect(screen.getByText('Working…')).toBeDefined()
  })

  test('does not duplicate working indicator once assistant message stream starts', () => {
    render(
      <MessageList
        messages={[
          userMessage('/kata plan'),
          {
            id: 'assistant:1',
            role: 'assistant',
            content: '',
            streaming: true,
            isThinking: false,
          },
        ]}
        tools={[]}
        isStreaming
      />,
    )

    expect(screen.getAllByText('Working…')).toHaveLength(1)
  })
})
