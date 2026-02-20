import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MockChatPanel } from '../../../../src/renderer/components/center/MockChatPanel'

vi.mock('../../../../src/renderer/hooks/useMockChat', () => ({
  useMockChat: () => ({
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '## Existing context',
        toolCalls: [{ id: 'tool-1', name: 'read_file', args: { path: 'foo' }, output: 'ok' }]
      }
    ],
    isStreaming: true,
    sendMessage: vi.fn()
  })
}))

describe('MockChatPanel', () => {
  it('composes messages, tool call records, streaming indicator, and input', () => {
    render(<MockChatPanel />)

    expect(screen.getByRole('heading', { name: 'Existing context', level: 2 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tool: read_file' })).toBeTruthy()
    expect(screen.getByText('Kata is streaming a response...')).toBeTruthy()
    expect(screen.getByLabelText('Message input')).toBeTruthy()
  })
})
