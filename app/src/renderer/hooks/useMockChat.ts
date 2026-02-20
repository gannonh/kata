import { useCallback, useEffect, useRef, useState } from 'react'

import { mockMessages } from '../mock/messages'
import { type ChatMessage } from '../types/chat'

const STREAM_DELAY_MS = 15

function buildAssistantResponse(input: string): string {
  return [
    '## Response',
    '',
    `I captured your request: "${input}".`,
    '',
    '- Reviewing relevant planning and code context',
    '- Preparing implementation updates',
    '- Reporting verification results next'
  ].join('\n')
}

function createMessageId(prefix: 'user' | 'assistant'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function useMockChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages)
  const [isStreaming, setIsStreaming] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const clearStreamTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearStreamTimer()
    }
  }, [clearStreamTimer])

  const sendMessage = useCallback(
    (message: string) => {
      const trimmedMessage = message.trim()
      if (!trimmedMessage || isStreaming) {
        return
      }

      clearStreamTimer()

      const userMessage: ChatMessage = {
        id: createMessageId('user'),
        role: 'user',
        content: trimmedMessage
      }
      const assistantMessageId = createMessageId('assistant')
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: ''
      }
      const response = buildAssistantResponse(trimmedMessage)
      let index = 0

      setMessages((current) => [...current, userMessage, assistantMessage])
      setIsStreaming(true)

      const tick = (): void => {
        index += 1
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: response.slice(0, index)
                }
              : item
          )
        )

        if (index >= response.length) {
          timeoutRef.current = null
          setIsStreaming(false)
          return
        }

        timeoutRef.current = window.setTimeout(tick, STREAM_DELAY_MS)
      }

      timeoutRef.current = window.setTimeout(tick, STREAM_DELAY_MS)
    },
    [clearStreamTimer, isStreaming]
  )

  return {
    messages,
    isStreaming,
    sendMessage
  }
}
