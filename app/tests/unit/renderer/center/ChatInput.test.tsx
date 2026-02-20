import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatInput } from '../../../../src/renderer/components/center/ChatInput'

describe('ChatInput', () => {
  afterEach(() => {
    cleanup()
  })

  it('submits trimmed messages and clears the input', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const textarea = screen.getByLabelText('Message input')
    const sendButton = screen.getByRole('button', { name: 'Send' })

    fireEvent.change(textarea, { target: { value: '  ship Wave 4  ' } })
    fireEvent.click(sendButton)

    expect(onSend).toHaveBeenCalledWith('ship Wave 4')
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('submits on Enter and preserves new lines on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const textarea = screen.getByLabelText('Message input')

    fireEvent.change(textarea, { target: { value: 'first line' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('first line')
  })
})
