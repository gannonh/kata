import { useEffect, useRef, useState } from 'react'
import { GitBranch } from 'lucide-react'
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
import { refreshSessionListAtom, sessionHistoryErrorAtom, workingDirectoryAtom } from '@/atoms/session'
import { type WorkspaceGitInfo } from '@shared/types'
import { ModelSelector } from '@/components/app-shell/ModelSelector'
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
  const workingDirectory = useAtomValue(workingDirectoryAtom)

  const [workspaceGitInfo, setWorkspaceGitInfo] = useState<WorkspaceGitInfo>({
    branch: null,
    pullRequestUrl: null,
  })

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

  useEffect(() => {
    let active = true

    void window.api.workspace.getGitInfo()
      .then((info) => {
        if (!active) {
          return
        }

        setWorkspaceGitInfo(info)
      })
      .catch(() => {
        if (!active) {
          return
        }

        setWorkspaceGitInfo({
          branch: null,
          pullRequestUrl: null,
        })
      })

    return () => {
      active = false
    }
  }, [workingDirectory])

  // Auto-scroll: pinned to bottom by default. Detaches when the user scrolls
  // up manually, re-attaches when they scroll back near the bottom or when a
  // new user message is sent.
  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming
  const userScrolledUpRef = useRef(false)
  const prevMessageCountRef = useRef(messages.length)

  // Detect user scroll-up: if the user scrolls away from the bottom, stop
  // auto-scrolling. Re-attach when they scroll back near the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUpRef.current = distanceFromBottom > 80
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // Always re-attach auto-scroll when the user sends a new message
    const hasNewUserMessage =
      messages.length > prevMessageCountRef.current &&
      messages[messages.length - 1]?.role === 'user'
    prevMessageCountRef.current = messages.length

    if (hasNewUserMessage) {
      userScrolledUpRef.current = false
    }

    if (userScrolledUpRef.current) return

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
    <div className="relative flex h-full min-h-0 flex-col bg-background" data-testid="chat-pane">
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

      <MessageInput
        disabled={inputDisabled}
        stopDisabled={stopDisabled}
        footerControls={(
          <div className="flex items-center gap-2">
            <ModelSelector compact />
            <ThinkingLevelToggle compact />
          </div>
        )}
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          {isStreaming
            ? 'Streaming response…'
            : bridgeStatus.state === 'running'
              ? 'Ready'
              : `Bridge ${bridgeStatus.state}`}
        </span>

        <div className="flex max-w-full items-center gap-3">
          {workspaceGitInfo.branch ? (
            <span className="inline-flex max-w-56 items-center gap-1">
              <GitBranch size={12} aria-hidden="true" />
              <span className="truncate">{workspaceGitInfo.branch}</span>
            </span>
          ) : null}

          {workspaceGitInfo.pullRequestUrl ? (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                window.open(workspaceGitInfo.pullRequestUrl ?? '', '_blank', 'noopener,noreferrer')
              }}
            >
              Open PR
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
