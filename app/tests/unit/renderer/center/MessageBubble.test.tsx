import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MessageBubble } from '../../../../src/renderer/components/center/MessageBubble'

describe('MessageBubble', () => {
  it('renders user messages as plain text bubbles', () => {
    render(
      <MessageBubble
        message={{
          id: 'user-1',
          role: 'user',
          content: 'Please summarize the current plan.'
        }}
      />
    )

    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.getByText('Please summarize the current plan.')).toBeTruthy()
  })

  it('renders assistant messages using markdown formatting', () => {
    render(
      <MessageBubble
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: ['## Summary', '', '- Added tests', '- Added mock fixtures'].join('\n')
        }}
      />
    )

    expect(screen.getByText('Kata')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Summary', level: 2 })).toBeTruthy()
    expect(screen.getByText('Added tests')).toBeTruthy()
  })
})
