import { useMockChat } from '../../hooks/useMockChat'
import { ChatInput } from './ChatInput'
import { MessageBubble } from './MessageBubble'
import { MessageList } from './MessageList'
import { StreamingIndicator } from './StreamingIndicator'
import { ToolCallResult } from './ToolCallResult'

export function MockChatPanel() {
  const { messages, isStreaming, sendMessage } = useMockChat()

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <MessageList>
        {messages.map((message) => (
          <div
            key={message.id}
            className="space-y-2"
          >
            <MessageBubble message={message} />
            {(message.toolCalls ?? []).map((toolCall) => (
              <ToolCallResult
                key={toolCall.id}
                toolCall={toolCall}
              />
            ))}
          </div>
        ))}
      </MessageList>
      {isStreaming ? <StreamingIndicator /> : null}
      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming}
      />
    </div>
  )
}
