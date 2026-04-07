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
import { refreshSessionListAtom, sessionHistoryErrorAtom } from '@/atoms/session'
import { ErrorBanner } from './ErrorBanner'
import { ExtensionUIHandler } from './ExtensionUIHandler'
import { MessageInput } from './MessageInput'
import { MessageList } from './MessageList'
import { PermissionModeSelector } from './PermissionModeSelector'
import { ThinkingLevelToggle } from './ThinkingLevelToggle'

export function ChatPanel() {
  const messages = useAtomValue(messagesAtom)
  const tools = useAtomValue(toolCallsAtom)
  const error = useAtomValue(errorAtom)
  const isStreaming = useAtomValue(isStreamingAtom)
  const bridgeStatus = useAtomValue(bridgeStatusAtom)
  const sessionHistoryError = useAtomValue(sessionHistoryErrorAtom)

  const appendUserMessage = useSetAtom(appendUserMessageAtom)
  const applyChatEvent = useSetAtom(applyChatEventAtom)
  const applyBridgeStatus = useSetAtom(applyBridgeStatusAtom)
  const refreshSessions = useSetAtom(refreshSessionListAtom)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const unsubscribeChatEvents = window.api.onChatEvent((event) => {
      applyChatEvent(event)

      if (event.type === 'agent_end') {
        void refreshSessions()
      }
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
  }, [applyBridgeStatus, applyChatEvent, refreshSessions])

  // Auto-scroll: use instant scroll during streaming (smooth can't keep up with
  // rapid text_delta updates) and smooth scroll for discrete events like new
  // messages or tool completions.
  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // Only auto-scroll if the user is already near the bottom (within 150px).
    // This prevents hijacking the scroll position when the user has scrolled up
    // to read earlier content.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom > 150) return

    el.scrollTo({
      top: el.scrollHeight,
      behavior: isStreamingRef.current ? 'instant' : 'smooth',
    })
  }, [messages, tools])

  const bridgeAvailable = bridgeStatus.state === 'running'
  const inputDisabled = isStreaming || !bridgeAvailable
  const stopDisabled = !isStreaming || !bridgeAvailable
  const errorMessage = error ?? bridgeStatus.message ?? null
  const errorTitle = bridgeStatus.state === 'crashed' ? 'Agent process crashed' : 'Agent error'

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <ExtensionUIHandler />

      {errorMessage && (
        <ErrorBanner
          title={errorTitle}
          message={errorMessage}
          onRestart={bridgeStatus.state !== 'spawning' ? () => window.api.restartAgent() : undefined}
        />
      )}

      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Permission mode</p>
        <PermissionModeSelector />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {sessionHistoryError && (
          <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
            Unable to load session history: {sessionHistoryError}
          </div>
        )}
        <MessageList messages={messages} tools={tools} />
      </div>

      <ThinkingLevelToggle />

      <MessageInput
        disabled={inputDisabled}
        stopDisabled={stopDisabled}
        onSubmit={async (value) => {
          appendUserMessage(value)

          try {
            await window.api.sendMessage(value)
          } catch (sendError) {
            const message = sendError instanceof Error ? sendError.message : String(sendError)
            applyChatEvent({
              type: 'agent_error',
              message,
            })
          }
        }}
        onStop={async () => {
          await window.api.stopAgent()
        }}
      />

      <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        {isStreaming
          ? 'Streaming response…'
          : bridgeStatus.state === 'running'
            ? 'Ready'
            : `Bridge ${bridgeStatus.state}`}
      </div>
    </div>
  )
}
