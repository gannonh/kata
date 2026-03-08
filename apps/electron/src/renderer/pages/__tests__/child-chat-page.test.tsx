import { expect, mock, test } from 'bun:test'

import type { Session } from '../../../shared/types'
import { finalizeTurnsForIdleSession, groupMessagesByTurn } from '@craft-agent/ui'

const loadedSessionsAtom = Symbol('loadedSessionsAtom')
const sessionMetaMapAtom = Symbol('sessionMetaMapAtom')
const ensureSessionMessagesLoadedAtom = Symbol('ensureSessionMessagesLoadedAtom')

const sendMessageCalls: Array<{ sessionId: string; message: string }> = []
const sessionMenuPropsHistory: any[] = []
const chatDisplayPropsHistory: any[] = []

let currentSessions = new Map<string, Session>()
let currentSessionMeta: Map<string, { id: string; workspaceId: string; name?: string; isFlagged?: boolean; lastMessageAt?: number }> = new Map()
let currentLoadedSessions = new Set<string>()

mock.module('jotai', () => ({
  useAtomValue(atom: unknown) {
    if (atom === loadedSessionsAtom) return currentLoadedSessions
    if (atom === sessionMetaMapAtom) return currentSessionMeta
    return null
  },
  useSetAtom() {
    return () => {}
  },
}))

mock.module('react', () => ({
  memo(component: unknown) {
    return component
  },
  useLayoutEffect() {},
  useEffect() {},
  useState<T>(initial: T) {
    return [initial, () => {}] as const
  },
  useRef<T>(value: T) {
    return { current: value }
  },
  useCallback<T>(fn: T) {
    return fn
  },
  useMemo<T>(factory: () => T) {
    return factory()
  },
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
    if (typeof type === 'function') {
      return type({
        ...(props ?? {}),
        ...(children.length > 0 ? { children } : {}),
      })
    }

    return {
      type,
      props: {
        ...(props ?? {}),
        children,
      },
    }
  },
}))

const createJsxElement = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
  if (typeof type === 'function') {
    return type({
      ...(props ?? {}),
      ...(key !== undefined ? { key } : {}),
    })
  }

  return {
    type,
    key,
    props: props ?? {},
  }
}

mock.module('react/jsx-runtime', () => ({
  jsx: createJsxElement,
  jsxs: createJsxElement,
  Fragment: Symbol.for('Fragment'),
}))

mock.module('react/jsx-dev-runtime', () => ({
  jsxDEV: createJsxElement,
  Fragment: Symbol.for('Fragment'),
}))

mock.module('lucide-react', () => ({
  AlertCircle() { return null },
  Globe() { return null },
  Copy() { return null },
  RefreshCw() { return null },
  Link2Off() { return null },
  Info() { return null },
}))

mock.module('@/atoms/sessions', () => ({
  loadedSessionsAtom,
  sessionMetaMapAtom,
  ensureSessionMessagesLoadedAtom,
}))

mock.module('@/components/app-shell/ChatDisplay', () => ({
  ChatDisplay(props: any) {
    chatDisplayPropsHistory.push(props)
    return null
  },
}))

mock.module('@/components/app-shell/SessionMenu', () => ({
  SessionMenu(props: any) {
    sessionMenuPropsHistory.push(props)
    return null
  },
}))

mock.module('@/components/app-shell/PanelHeader', () => ({
  PanelHeader() {
    return null
  },
}))

mock.module('@/components/ui/rename-dialog', () => ({
  RenameDialog() {
    return null
  },
}))

mock.module('@/components/ui/HeaderIconButton', () => ({
  HeaderIconButton() {
    return null
  },
}))

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu(props: any) {
    return props.children ?? null
  },
  DropdownMenuTrigger(props: any) {
    return props.children ?? null
  },
}))

mock.module('@/components/ui/styled-dropdown', () => ({
  StyledDropdownMenuContent(props: any) {
    return props.children ?? null
  },
  StyledDropdownMenuItem(props: any) {
    return {
      type: 'button',
      props,
    }
  },
  StyledDropdownMenuSeparator() {
    return null
  },
}))

mock.module('@/context/AppShellContext', () => ({
  useAppShellContext() {
    return {
      activeWorkspaceId: 'workspace-1',
      currentModel: 'opus',
      onSendMessage(sessionId: string, message: string) {
        sendMessageCalls.push({ sessionId, message })
      },
      onOpenFile() {},
      onOpenUrl() {},
      onRespondToPermission() {},
      onRespondToCredential() {},
      onMarkSessionRead() {},
      onMarkSessionUnread() {},
      onSetActiveViewingSession() {},
      textareaRef: { current: null },
      getDraft() { return '' },
      onInputChange() {},
      enabledSources: [],
      skills: [],
      labels: [],
      onSessionLabelsChange() {},
      enabledModes: ['ask'],
      todoStates: [],
      onSessionSourcesChange() {},
      onRenameSession() {},
      onFlagSession() {},
      onUnflagSession() {},
      onTodoStateChange() {},
      onDeleteSession: async () => true,
      rightSidebarButton: null,
    }
  },
  usePendingPermission() {
    return undefined
  },
  usePendingCredential() {
    return undefined
  },
  useSessionOptionsFor() {
    return {
      options: {
        thinkingLevel: 'think',
        ultrathinkEnabled: false,
        permissionMode: 'ask',
      },
      setOption() {},
      setPermissionMode() {},
    }
  },
  useSession() {
    return currentSessions.get(arguments[0]) ?? null
  },
}))

mock.module('@/lib/perf', () => ({
  rendererPerf: {
    markSessionSwitch() {},
    endSessionSwitch() {},
  },
}))

mock.module('@/lib/navigate', () => ({
  routes: {
    view: {
      allChats: (sessionId: string) => `/chat/${sessionId}`,
    },
  },
}))

mock.module('@/utils/session', () => ({
  getSessionTitle(session: { name?: string; preview?: string }) {
    return session.name ?? session.preview ?? 'Chat'
  },
}))

mock.module('sonner', () => ({
  toast: {
    success() {},
    error() {},
  },
}))

const { default: ChatPage } = await import('../ChatPage')

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? 'session-1',
    workspaceId: overrides.workspaceId ?? 'workspace-1',
    workspaceName: overrides.workspaceName ?? 'Workspace 1',
    name: overrides.name ?? 'Chat',
    lastMessageAt: overrides.lastMessageAt ?? 1,
    messages: overrides.messages ?? [],
    isProcessing: overrides.isProcessing ?? false,
    sessionKind: overrides.sessionKind,
    parentSessionId: overrides.parentSessionId,
    orchestratorSessionId: overrides.orchestratorSessionId,
    ...overrides,
  }
}

function renderChatPage(activeSession: Session, sessions: Session[] = [activeSession]) {
  currentSessions = new Map(sessions.map(session => [session.id, session]))
  currentSessionMeta = new Map(sessions.map(session => [session.id, {
    id: session.id,
    workspaceId: session.workspaceId,
    name: session.name,
    isFlagged: session.isFlagged,
    lastMessageAt: session.lastMessageAt,
  }]))
  currentLoadedSessions = new Set(sessions.map(session => session.id))
  sessionMenuPropsHistory.length = 0
  chatDisplayPropsHistory.length = 0
  sendMessageCalls.length = 0

  return ChatPage({ sessionId: activeSession.id })
}

test('child chat pages project the delegated transcript into the child pane, send follow-ups to the child session, and hide workflow controls', () => {
  const parentSession = createSession({
    id: '260308-root',
    name: 'Coordinator',
    sessionKind: 'orchestrator',
    messages: [
      { id: 'task-1', role: 'tool', content: 'Inspect workspace files', timestamp: 1, toolName: 'Task', toolUseId: 'toolu-task-a', toolStatus: 'completed' },
      { id: 'tool-1', role: 'tool', content: 'ls -la\nfoobar.txt', timestamp: 2, toolName: 'Terminal', toolUseId: 'toolu-shell-a', toolStatus: 'completed', parentToolUseId: 'toolu-task-a' },
      { id: 'tool-2', role: 'tool', content: 'Found foobar in workspace', timestamp: 3, toolName: 'Read', toolUseId: 'toolu-read-a', toolStatus: 'completed', parentToolUseId: 'toolu-task-a' },
    ],
  })
  const childSession = createSession({
    id: '260308-child-a',
    name: 'Explore workspace sources',
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-a',
    messages: [],
  })

  renderChatPage(childSession, [childSession, parentSession])

  const chatDisplayProps = chatDisplayPropsHistory.at(-1)
  const sessionMenuProps = sessionMenuPropsHistory.at(-1)

  expect(chatDisplayProps.session.id).toBe(childSession.id)
  expect(chatDisplayProps.session.messages.map((message: { id: string }) => message.id)).toEqual([
    'task-1',
    'tool-1',
    'tool-2',
  ])
  const normalizedTurns = finalizeTurnsForIdleSession(
    groupMessagesByTurn(chatDisplayProps.session.messages),
    chatDisplayProps.session.isProcessing
  )
  const assistantTurn = normalizedTurns.find((turn: { type: string }) => turn.type === 'assistant')
  expect(assistantTurn?.isComplete).toBe(true)

  chatDisplayProps.onSendMessage('follow up')
  expect(sendMessageCalls).toEqual([{ sessionId: childSession.id, message: 'follow up' }])

  expect(sessionMenuProps.sessionId).toBe(childSession.id)
  expect(sessionMenuProps.showWorkflowControls).toBe(false)
})

test('orchestrator chat pages keep workflow controls and continue rendering the orchestrator transcript', () => {
  const orchestratorSession = createSession({
    id: '260308-root',
    name: 'Coordinator',
    sessionKind: 'orchestrator',
    messages: [
      { id: 'tool-1', role: 'tool', content: 'Delegated subagents', timestamp: 1, toolUseId: 'toolu-1' },
      { id: 'assistant-1', role: 'assistant', content: 'Summary of subagents', timestamp: 2 },
    ],
  })

  renderChatPage(orchestratorSession)

  const chatDisplayProps = chatDisplayPropsHistory.at(-1)
  const sessionMenuProps = sessionMenuPropsHistory.at(-1)

  expect(chatDisplayProps.session.id).toBe(orchestratorSession.id)
  expect(chatDisplayProps.session.messages).toEqual(orchestratorSession.messages)
  expect(sessionMenuProps.showWorkflowControls).toBe(true)
})
