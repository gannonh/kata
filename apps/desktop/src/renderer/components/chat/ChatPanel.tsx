import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  appendUserMessageAtom,
  applyBridgeStatusAtom,
  applyChatEventAtom,
  bridgeStatusAtom,
  errorAtom,
  isStreamingAtom,
  messagesAtom,
  toolCallsAtom,
} from '@/atoms/chat'
import { ErrorBanner } from './ErrorBanner'
import { MessageInput } from './MessageInput'
import { MessageList } from './MessageList'

export function ChatPanel() {
  const messages = useAtomValue(messagesAtom)
  const tools = useAtomValue(toolCallsAtom)
  const error = useAtomValue(errorAtom)
  const isStreaming = useAtomValue(isStreamingAtom)
  const bridgeStatus = useAtomValue(bridgeStatusAtom)

  const appendUserMessage = useSetAtom(appendUserMessageAtom)
  const applyChatEvent = useSetAtom(applyChatEventAtom)
  const applyBridgeStatus = useSetAtom(applyBridgeStatusAtom)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const unsubscribeChatEvents = window.api.onChatEvent((event) => {
      applyChatEvent(event)
    })

    const unsubscribeBridgeStatus = window.api.onBridgeStatus((status) => {
      applyBridgeStatus(status)
    })

    void window.api.getBridgeState().then((state) => {
      applyBridgeStatus({
        state: state.status,
        pid: state.pid,
        updatedAt: Date.now(),
      })
    })

    return () => {
      unsubscribeChatEvents()
      unsubscribeBridgeStatus()
    }
  }, [applyBridgeStatus, applyChatEvent])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, tools])

  const bridgeAvailable = bridgeStatus.state === 'running'
  const inputDisabled = isStreaming || !bridgeAvailable
  const errorMessage = error ?? bridgeStatus.message ?? null

  return (
    <div className="flex h-[calc(100%-3.5rem)] flex-col">
      {errorMessage && (
        <ErrorBanner
          message={errorMessage}
          onRestart={bridgeStatus.state !== 'spawning' ? () => window.api.restartAgent() : undefined}
        />
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <MessageList messages={messages} tools={tools} />
      </div>

      <MessageInput
        disabled={inputDisabled}
        onSubmit={async (value) => {
          appendUserMessage(value)
          await window.api.sendMessage(value)
        }}
        onStop={async () => {
          await window.api.stopAgent()
        }}
      />

      <div className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
        {isStreaming
          ? 'Streaming response…'
          : bridgeStatus.state === 'running'
            ? 'Ready'
            : `Bridge ${bridgeStatus.state}`}
      </div>
    </div>
  )
}
