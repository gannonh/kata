import { expect, mock, test } from 'bun:test'

import type { SessionListItem } from '@/lib/session-tree'

const labelValuePopoverPropsHistory: any[] = []
let mockFlatLabels: Array<{ id: string; name: string; valueType?: string }> = []

mock.module('react', () => ({
  useState<T>(initial: T) {
    return [initial, () => {}] as const
  },
  useCallback<T>(fn: T) {
    return fn
  },
  useEffect() {},
  useRef<T>(value: T) {
    return { current: value }
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

mock.module('date-fns', () => ({
  formatDistanceToNow() { return '1m' },
  formatDistanceToNowStrict() { return '1m' },
  isToday() { return true },
  isYesterday() { return false },
  format() { return 'Today' },
  startOfDay(date: Date) { return date },
}))

mock.module('lucide-react', () => ({
  MoreHorizontal() { return null },
  Flag() { return null },
  Search() { return null },
  X() { return null },
  Copy() { return null },
  Link2Off() { return null },
  CloudUpload() { return null },
  Globe() { return null },
  RefreshCw() { return null },
  Inbox() { return null },
  Hash() { return null },
  MessageCircle() { return null },
  Radio() { return null },
  CornerDownRight() { return null },
}))

mock.module('sonner', () => ({
  toast: {
    success() {},
    error() {},
  },
}))

mock.module('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}))

mock.module('@/lib/perf', () => ({
  rendererPerf: {
    startSessionSwitch() {},
  },
}))

mock.module('@craft-agent/shared/labels', () => ({
  flattenLabels() { return mockFlatLabels },
  parseLabelEntry(entry: string) {
    return { id: entry, rawValue: undefined }
  },
  formatLabelEntry(id: string, value: string) {
    return value ? `${id}::${value}` : id
  },
  formatDisplayValue(value: string) {
    return value
  },
}))

mock.module('@craft-agent/shared/colors', () => ({
  resolveEntityColor() { return null },
}))

mock.module('@/context/ThemeContext', () => ({
  useTheme() {
    return { isDark: true }
  },
}))

mock.module('@craft-agent/ui', () => ({
  Spinner() { return null },
  Tooltip(props: any) { return props.children ?? null },
  TooltipTrigger(props: any) { return props.children ?? null },
  TooltipContent(props: any) { return props.children ?? null },
}))

const passthrough = (props: any) => props.children ?? null

mock.module('@/components/ui/scroll-area', () => ({
  ScrollArea: passthrough,
}))

mock.module('@/components/ui/empty', () => ({
  Empty: passthrough,
  EmptyHeader: passthrough,
  EmptyMedia: passthrough,
  EmptyTitle: passthrough,
  EmptyDescription: passthrough,
  EmptyContent: passthrough,
}))

mock.module('@/components/ui/separator', () => ({
  Separator() { return null },
}))

mock.module('@/components/ui/button', () => ({
  Button: passthrough,
}))

mock.module('@/components/ui/popover', () => ({
  Popover: passthrough,
  PopoverContent: passthrough,
  PopoverTrigger: passthrough,
}))

mock.module('@/components/ui/todo-filter-menu', () => ({
  TodoStateMenu() { return null },
}))

mock.module('@/components/ui/label-value-popover', () => ({
  LabelValuePopover(props: any) {
    labelValuePopoverPropsHistory.push(props)
    return props.children ?? null
  },
}))

mock.module('@/components/ui/label-icon', () => ({
  LabelValueTypeIcon() { return null },
}))

mock.module('@/config/todo-states', () => ({
  getStateColor() { return null },
  getStateIcon() { return null },
  getStateLabel() { return 'Todo' },
}))

mock.module('@/components/ui/styled-dropdown', () => ({
  DropdownMenu: passthrough,
  DropdownMenuTrigger: passthrough,
  StyledDropdownMenuContent: passthrough,
  StyledDropdownMenuItem: passthrough,
  StyledDropdownMenuSeparator() { return null },
}))

mock.module('@/components/ui/styled-context-menu', () => ({
  ContextMenu: passthrough,
  ContextMenuTrigger: passthrough,
  StyledContextMenuContent: passthrough,
}))

mock.module('@/components/ui/menu-context', () => ({
  DropdownMenuProvider: passthrough,
  ContextMenuProvider: passthrough,
}))

mock.module('../SessionMenu', () => ({
  SessionMenu() { return null },
}))

mock.module('@/components/ui/dialog', () => ({
  Dialog: passthrough,
  DialogContent: passthrough,
  DialogHeader: passthrough,
  DialogTitle: passthrough,
  DialogFooter: passthrough,
}))

mock.module('@/components/ui/input', () => ({
  Input() { return null },
}))

mock.module('@/components/ui/rename-dialog', () => ({
  RenameDialog() { return null },
}))

mock.module('@/hooks/useSession', () => ({
  useSession() {
    return [{ selected: 'root-session' }, () => {}] as const
  },
}))

mock.module('@/hooks/keyboard', () => ({
  useFocusZone() {
    return { zoneRef: { current: null }, isFocused: false }
  },
  useRovingTabIndex() {
    return {
      getItemProps() {
        return {
          onKeyDown() {},
        }
      },
    }
  },
}))

mock.module('@/contexts/NavigationContext', () => ({
  useNavigation() {
    return {
      navigate() {},
    }
  },
  useNavigationState() {
    return {
      kind: 'allChats',
      filter: { kind: 'allChats' },
    }
  },
  routes: {
    view: {
      allChats(sessionId: string) { return sessionId },
      flagged(sessionId: string) { return sessionId },
      state(stateId: string, sessionId: string) { return `${stateId}:${sessionId}` },
    },
  },
  isChatsNavigation() {
    return true
  },
}))

mock.module('@/context/FocusContext', () => ({
  useFocusContext() {
    return { focusZone: null }
  },
}))

mock.module('@/utils/session', () => ({
  getSessionTitle(item: { name?: string; id: string }) {
    return item.name ?? item.id
  },
}))

mock.module('@/utils/child-unread-bubble', () => ({
  bubbleUnreadToParent({ parent }: { parent: SessionListItem }) {
    return { parentHasUnread: parent.hasUnread ?? false }
  },
}))

mock.module('@craft-agent/shared/views', () => ({}))

mock.module('@craft-agent/shared/agent/modes', () => ({
  PERMISSION_MODE_CONFIG: {
    ask: { shortName: 'Ask' },
  },
}))

test('SessionList renders top-level unread sessions without crashing', async () => {
  const { SessionList } = await import('../SessionList')

  const item: SessionListItem = {
    id: 'root-session',
    workspaceId: 'workspace-1',
    name: 'Orchestrator',
    lastMessageAt: 1,
    hasUnread: true,
    depth: 0,
    rootSessionId: 'root-session',
    rootLastMessageAt: 1,
    treeIndex: 0,
  }

  expect(() =>
    SessionList({
      items: [item],
      onDelete: async () => true,
      onMarkUnread() {},
    })
  ).not.toThrow()
})

test('SessionList renders nested label badges without editable popovers', async () => {
  const { SessionList } = await import('../SessionList')

  mockFlatLabels = [{ id: 'priority', name: 'Priority' }]
  labelValuePopoverPropsHistory.length = 0

  const nestedItem: SessionListItem = {
    id: 'child-session',
    workspaceId: 'workspace-1',
    name: 'Nested child',
    lastMessageAt: 1,
    labels: ['priority'],
    sessionKind: 'subagent',
    parentSessionId: 'root-session',
    depth: 1,
    rootSessionId: 'root-session',
    rootLastMessageAt: 1,
    treeIndex: 0,
  }

  SessionList({
    items: [nestedItem],
    onDelete: async () => true,
    onMarkUnread() {},
    onLabelsChange() {},
  })

  expect(labelValuePopoverPropsHistory).toHaveLength(0)
})

test('getSearchFilteredSessionItems preserves parent-first tree ordering from projected items', async () => {
  const { getSearchFilteredSessionItems } = await import('../SessionList')

  const root: SessionListItem = {
    id: 'root-session',
    workspaceId: 'workspace-1',
    name: 'Orchestrator',
    lastMessageAt: 1,
    depth: 0,
    rootSessionId: 'root-session',
    rootLastMessageAt: 1,
    treeIndex: 0,
  }

  const child: SessionListItem = {
    id: 'child-session',
    workspaceId: 'workspace-1',
    name: 'Nested child',
    lastMessageAt: 10,
    sessionKind: 'subagent',
    parentSessionId: 'root-session',
    depth: 1,
    rootSessionId: 'root-session',
    rootLastMessageAt: 10,
    treeIndex: 1,
  }

  const filtered = getSearchFilteredSessionItems([root, child], '', [])

  expect(filtered.map(item => item.id)).toEqual(['root-session', 'child-session'])
})

test('getSearchFilteredSessionItems keeps the orchestrator ahead of a matching subagent', async () => {
  const { getSearchFilteredSessionItems } = await import('../SessionList')

  const root: SessionListItem = {
    id: 'root-session',
    workspaceId: 'workspace-1',
    name: 'Search workspace and config files',
    lastMessageAt: 1,
    depth: 0,
    rootSessionId: 'root-session',
    rootLastMessageAt: 10,
    treeIndex: 0,
  }

  const child: SessionListItem = {
    id: 'child-session',
    workspaceId: 'workspace-1',
    name: 'Search workspace and config files',
    lastMessageAt: 10,
    sessionKind: 'subagent',
    parentSessionId: 'root-session',
    depth: 1,
    rootSessionId: 'root-session',
    rootLastMessageAt: 10,
    treeIndex: 1,
  }

  const filtered = getSearchFilteredSessionItems([root, child], 'config', [])

  expect(filtered.map(item => item.id)).toEqual(['root-session', 'child-session'])
})
