import { expect, mock, test } from 'bun:test'

import type { SessionEvent } from '../../shared/types'

mock.module('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

mock.module('@sentry/electron/main', () => ({}))
mock.module('electron-log/main', () => ({
  default: {
    transports: {
      file: {
        format: () => [],
        maxSize: 0,
        level: 'debug',
        getFile: () => ({ path: '/tmp/session.log' }),
      },
      console: {
        format: () => [],
        level: 'debug',
      },
    },
    scope: () => ({
      info() {},
      warn() {},
      error() {},
      debug() {},
    }),
  },
}))
mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: () => ({}),
}))
const sharedAgentMock = () => ({
  CraftAgent: class {},
  setPermissionMode: () => {},
  setAnthropicOptionsEnv: () => {},
  setPathToClaudeCodeExecutable: () => {},
  setInterceptorPath: () => {},
  setExecutable: () => {},
  unregisterSessionScopedToolCallbacks: () => {},
  AbortReason: {
    PlanSubmitted: 'PlanSubmitted',
    AuthRequest: 'AuthRequest',
  },
})
mock.module('@craft-agent/shared/agent', sharedAgentMock)
mock.module('@craft-agent/shared/agent/index.ts', sharedAgentMock)
mock.module('/Users/gannonhall/.codex/worktrees/61e8/kata-cloud-agents/packages/shared/src/agent/index.ts', sharedAgentMock)
mock.module('@craft-agent/shared/agent/modes', () => ({
  PERMISSION_MODE_CONFIG: {},
}))
mock.module('@craft-agent/shared/agent/thinking-levels', () => ({
  THINKING_LEVELS: ['off', 'think', 'max'],
  DEFAULT_THINKING_LEVEL: 'think',
}))
mock.module('@craft-agent/shared/config', () => ({
  loadStoredConfig: () => ({}),
  getWorkspaces: () => [],
  getWorkspaceByNameOrId: () => null,
  loadConfigDefaults: () => ({
    workspaceDefaults: {
      permissionMode: 'ask',
      thinkingLevel: 'think',
    },
  }),
  getAnthropicBaseUrl: () => undefined,
  resolveModelId: () => undefined,
  DEFAULT_MODEL: 'default-model',
  getToolIconsDir: () => '/tmp/tool-icons',
  ConfigWatcher: class {
    start() {}
    stop() {}
  },
}))
mock.module('@craft-agent/shared/workspaces', () => ({
  loadWorkspaceConfig: () => undefined,
}))
mock.module('@craft-agent/shared/auth/types', () => ({}))
mock.module('@craft-agent/shared/config/types', () => ({}))
mock.module('@craft-agent/shared/sources', () => ({
  loadWorkspaceSources: () => [],
  loadAllSources: () => [],
  getSourcesBySlugs: () => [],
  getSourcesNeedingAuth: () => [],
  getSourceCredentialManager: () => ({
    getToken: async () => null,
    getApiCredential: async () => null,
    markSourceNeedsReauth: () => {},
    load: async () => null,
    isExpired: () => false,
    needsRefresh: () => false,
    refresh: async () => null,
  }),
  getSourceServerBuilder: () => ({
    buildAll: async () => ({
      mcpServers: {},
      apiServers: {},
      errors: [],
    }),
  }),
  isApiOAuthProvider: () => false,
  SERVER_BUILD_ERRORS: {
    AUTH_REQUIRED: 'AUTH_REQUIRED',
  },
}))
mock.module('@craft-agent/shared/sources/types', () => ({}))
mock.module('@craft-agent/shared/auth', () => ({
  getAuthState: async () => null,
}))
mock.module('@craft-agent/shared/skills/types', () => ({}))
mock.module('@craft-agent/shared/credentials', () => ({
  getCredentialManager: () => ({
    set: async () => {},
  }),
}))
mock.module('@craft-agent/shared/mcp', () => ({
  CraftMcpClient: class {},
}))
mock.module('@craft-agent/shared/skills', () => ({
  loadWorkspaceSkills: () => [],
}))
mock.module('@craft-agent/core/types', () => ({
  generateMessageId: () => `msg-${Math.random().toString(36).slice(2, 8)}`,
}))
mock.module('@craft-agent/shared/utils', () => ({
  generateSessionTitle: async () => null,
  regenerateSessionTitle: async () => null,
  formatPathsToRelative: (value: string) => value,
  formatToolInputPaths: (value: Record<string, unknown>) => value,
  perf: {
    span: () => ({
      mark() {},
      setMetadata() {},
      end() {},
    }),
  },
  encodeIconToDataUrl: () => undefined,
  getEmojiIcon: () => undefined,
  resetSummarizationClient: () => {},
  resolveToolIcon: () => undefined,
}))
mock.module('@craft-agent/shared/labels/auto', () => ({
  evaluateAutoLabels: async () => [],
}))
mock.module('@craft-agent/shared/labels/storage', () => ({
  getDefaultLabelConfig: () => ({}),
  saveLabelConfig: () => {},
  listLabels: async () => [],
}))
mock.module('@craft-agent/shared/labels/storage.ts', () => ({
  getDefaultLabelConfig: () => ({}),
  saveLabelConfig: () => {},
  listLabels: async () => [],
}))
mock.module('/Users/gannonhall/.codex/worktrees/61e8/kata-cloud-agents/packages/shared/src/labels/storage.ts', () => ({
  getDefaultLabelConfig: () => ({}),
  saveLabelConfig: () => {},
  listLabels: async () => [],
}))
mock.module('@craft-agent/shared/labels', () => ({
  extractLabelId: () => undefined,
}))
mock.module('@craft-agent/shared/git', () => ({
  getGitStatus: async () => null,
  getPrStatus: async () => null,
}))

const { SessionManager } = await import('../sessions')

function createManagedSession(sessionId = '260308-root') {
  const now = Date.now()

  return {
    id: sessionId,
    workspace: {
      id: 'ws-1',
      name: 'Workspace',
      rootPath: '/tmp/kat-261-workspace',
    },
    agent: null,
    messages: [],
    isProcessing: false,
    lastMessageAt: now,
    streamingText: '',
    processingGeneration: 0,
    name: 'Root session',
    isFlagged: false,
    permissionMode: 'ask',
    sdkSessionId: undefined,
    tokenUsage: undefined,
    todoState: undefined,
    lastReadMessageId: undefined,
    hasUnread: false,
    enabledSourceSlugs: [],
    labels: [],
    workingDirectory: '/tmp/kat-261-workspace',
    sdkCwd: `/tmp/kat-261-workspace/.sessions/${sessionId}`,
    sharedUrl: undefined,
    sharedId: undefined,
    model: undefined,
    thinkingLevel: 'think',
    lastMessageRole: undefined,
    lastFinalMessageId: undefined,
    isAsyncOperationOngoing: false,
    preview: undefined,
    createdAt: now,
    messageCount: 0,
    channel: undefined,
    messageQueue: [],
    backgroundShellCommands: new Map(),
    messagesLoaded: true,
    pendingAuthRequestId: undefined,
    pendingAuthRequest: undefined,
    lastSentMessage: undefined,
    lastSentAttachments: undefined,
    lastSentStoredAttachments: undefined,
    lastSentOptions: undefined,
    authRetryAttempted: false,
    authRetryInProgress: false,
    sessionKind: 'orchestrator',
    parentSessionId: undefined,
    orchestratorSessionId: sessionId,
    agentRole: 'Coordinator',
    delegatedBySessionId: undefined,
    delegatedToolUseId: undefined,
    delegationLabel: undefined,
    subagentStatus: undefined,
  } as any
}

function createManagedChildSession(
  parentSessionId: string,
  delegatedToolUseId: string,
  sessionId = '260308-child-a'
) {
  const session = createManagedSession(sessionId)

  return {
    ...session,
    name: 'Explore workspace sources',
    preview: 'Explore workspace sources',
    sessionKind: 'subagent',
    parentSessionId,
    orchestratorSessionId: parentSessionId,
    agentRole: 'Explore',
    delegatedBySessionId: parentSessionId,
    delegatedToolUseId,
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
  } as any
}

test('subagent_spawned event carries enough data to create a child session', () => {
  const event: SessionEvent = {
    type: 'subagent_spawned',
    sessionId: '260308-root',
    childSessionId: '260308-child-a',
    childSessionName: 'Explore workspace sources',
    agentRole: 'Explore',
    delegationLabel: 'Explore workspace sources',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
  }

  expect(event.childSessionId).toBe('260308-child-a')
})

test('Task lifecycle creates a child session once and emits child session status changes', async () => {
  const manager = new SessionManager() as any
  const rootSession = createManagedSession()
  const sessionEvents: SessionEvent[] = []

  manager.sessions = new Map([[rootSession.id, rootSession]])
  manager.persistSession = () => {}
  manager.sendEvent = (event: SessionEvent) => {
    sessionEvents.push(event)
  }

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-a',
    input: {
      description: 'Explore workspace sources',
      subagent_type: 'Explore',
    },
    turnId: 'turn-1',
  })

  const childSessions = Array.from(manager.sessions.values()).filter(
    (session: any) => session.sessionKind === 'subagent'
  )
  expect(childSessions).toHaveLength(1)

  const childSession = childSessions[0]
  expect(childSession).toMatchObject({
    name: 'Explore workspace sources',
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    agentRole: 'Explore',
    delegatedBySessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-a',
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
  })

  expect(sessionEvents.filter(event => event.type === 'subagent_spawned')).toEqual([
    {
      type: 'subagent_spawned',
      sessionId: '260308-root',
      childSessionId: childSession.id,
      childSessionName: 'Explore workspace sources',
      agentRole: 'Explore',
      delegationLabel: 'Explore workspace sources',
      parentSessionId: '260308-root',
      orchestratorSessionId: '260308-root',
    },
  ])

  expect(sessionEvents.filter(event => event.type === 'subagent_status_changed')).toEqual([
    {
      type: 'subagent_status_changed',
      sessionId: '260308-root',
      childSessionId: childSession.id,
      subagentStatus: 'running',
    },
  ])

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-a',
    input: {
      description: 'Explore workspace sources',
      subagent_type: 'Explore',
    },
    turnId: 'turn-1',
  })

  expect(sessionEvents.filter(event => event.type === 'subagent_spawned')).toHaveLength(1)

  await manager.processEvent(rootSession, {
    type: 'tool_result',
    toolUseId: 'toolu-task-a',
    toolName: 'Task',
    result: 'done',
    isError: false,
    turnId: 'turn-1',
  })

  expect(childSession.subagentStatus).toBe('completed')
  expect(sessionEvents.filter(event => event.type === 'subagent_status_changed')).toContainEqual({
    type: 'subagent_status_changed',
    sessionId: '260308-root',
    childSessionId: childSession.id,
    subagentStatus: 'completed',
  })
})

test('Task lifecycle waits for authoritative Task metadata before emitting subagent_spawned', async () => {
  const manager = new SessionManager() as any
  const rootSession = createManagedSession()
  const sessionEvents: SessionEvent[] = []

  manager.sessions = new Map([[rootSession.id, rootSession]])
  manager.persistSession = () => {}
  manager.sendEvent = (event: SessionEvent) => {
    sessionEvents.push(event)
  }

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-partial-first',
    input: {
      description: 'Explore workspace sources',
    },
    turnId: 'turn-1',
  })

  let childSessions = Array.from(manager.sessions.values()).filter(
    (session: any) => session.sessionKind === 'subagent'
  )
  expect(childSessions).toHaveLength(1)
  expect(sessionEvents.filter(event => event.type === 'subagent_spawned')).toHaveLength(0)
  expect(sessionEvents.filter(event => event.type === 'subagent_status_changed')).toHaveLength(0)

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-partial-first',
    input: {
      description: 'Explore workspace sources',
      subagent_type: 'Explore',
    },
    turnId: 'turn-1',
  })

  childSessions = Array.from(manager.sessions.values()).filter(
    (session: any) => session.sessionKind === 'subagent'
  )
  expect(childSessions).toHaveLength(1)
  expect(childSessions[0]).toMatchObject({
    name: 'Explore workspace sources',
    agentRole: 'Explore',
    delegatedToolUseId: 'toolu-task-partial-first',
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
  })
  expect(sessionEvents.filter(event => event.type === 'subagent_spawned')).toEqual([
    {
      type: 'subagent_spawned',
      sessionId: '260308-root',
      childSessionId: childSessions[0].id,
      childSessionName: 'Explore workspace sources',
      agentRole: 'Explore',
      delegationLabel: 'Explore workspace sources',
      parentSessionId: '260308-root',
      orchestratorSessionId: '260308-root',
    },
  ])
  expect(sessionEvents.filter(event => event.type === 'subagent_status_changed')).toEqual([
    {
      type: 'subagent_status_changed',
      sessionId: '260308-root',
      childSessionId: childSessions[0].id,
      subagentStatus: 'running',
    },
  ])
})

test('Task lifecycle scopes child session hydration to parent session and toolUseId', async () => {
  const manager = new SessionManager() as any
  const rootSession = createManagedSession()
  const sessionEvents: SessionEvent[] = []

  manager.sessions = new Map([[rootSession.id, rootSession]])
  manager.persistSession = () => {}
  manager.sendEvent = (event: SessionEvent) => {
    sessionEvents.push(event)
  }

  const sharedTaskInput = {
    description: 'Explore workspace sources',
    subagent_type: 'Explore',
  }

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-a',
    input: sharedTaskInput,
    turnId: 'turn-1',
  })

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-b',
    input: sharedTaskInput,
    turnId: 'turn-1',
  })

  const childSessions = Array.from(manager.sessions.values()).filter(
    (session: any) => session.sessionKind === 'subagent'
  )

  expect(childSessions).toHaveLength(2)
  expect(new Set(childSessions.map((session: any) => session.id)).size).toBe(2)
  expect(childSessions.map((session: any) => session.delegatedToolUseId).sort()).toEqual([
    'toolu-task-a',
    'toolu-task-b',
  ])

  expect(sessionEvents.filter(event => event.type === 'subagent_spawned')).toHaveLength(2)
  expect(sessionEvents.filter(event => event.type === 'subagent_status_changed')).toEqual([
    {
      type: 'subagent_status_changed',
      sessionId: '260308-root',
      childSessionId: childSessions.find((session: any) => session.delegatedToolUseId === 'toolu-task-a')!.id,
      subagentStatus: 'running',
    },
    {
      type: 'subagent_status_changed',
      sessionId: '260308-root',
      childSessionId: childSessions.find((session: any) => session.delegatedToolUseId === 'toolu-task-b')!.id,
      subagentStatus: 'running',
    },
  ])
})

test('Task lifecycle does not re-emit subagent_spawned for a persisted child after restart', async () => {
  const manager = new SessionManager() as any
  const rootSession = createManagedSession()
  const childSession = createManagedChildSession(rootSession.id, 'toolu-task-a')
  const sessionEvents: SessionEvent[] = []

  manager.sessions = new Map([
    [rootSession.id, rootSession],
    [childSession.id, childSession],
  ])
  manager.persistSession = () => {}
  manager.sendEvent = (event: SessionEvent) => {
    sessionEvents.push(event)
  }

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-a',
    input: {
      description: 'Explore workspace sources',
      subagent_type: 'Explore',
    },
    turnId: 'turn-1',
  })

  const childSessions = Array.from(manager.sessions.values()).filter(
    (session: any) => session.sessionKind === 'subagent'
  )

  expect(childSessions).toHaveLength(1)
  expect(childSessions[0]?.id).toBe(childSession.id)
  expect(sessionEvents.filter(event => event.type === 'subagent_spawned')).toHaveLength(0)
  expect(manager.taskChildSessions.get(`${rootSession.id}:toolu-task-a`)).toBe(childSession.id)
})

test('Task lifecycle restores terminal child status from persisted linkage when only tool_result arrives', async () => {
  const manager = new SessionManager() as any
  const rootSession = createManagedSession()
  const completedChild = createManagedChildSession(rootSession.id, 'toolu-task-complete', '260308-child-complete')
  const failedChild = createManagedChildSession(rootSession.id, 'toolu-task-fail', '260308-child-fail')
  const sessionEvents: SessionEvent[] = []

  manager.sessions = new Map([
    [rootSession.id, rootSession],
    [completedChild.id, completedChild],
    [failedChild.id, failedChild],
  ])
  manager.persistSession = () => {}
  manager.sendEvent = (event: SessionEvent) => {
    sessionEvents.push(event)
  }

  await manager.processEvent(rootSession, {
    type: 'tool_result',
    toolUseId: 'toolu-task-complete',
    toolName: 'Task',
    result: 'done',
    isError: false,
    turnId: 'turn-1',
  })

  await manager.processEvent(rootSession, {
    type: 'tool_result',
    toolUseId: 'toolu-task-fail',
    toolName: 'Task',
    result: 'failed',
    isError: true,
    turnId: 'turn-1',
  })

  expect(completedChild.subagentStatus).toBe('completed')
  expect(failedChild.subagentStatus).toBe('failed')
  expect(manager.taskChildSessions.get(`${rootSession.id}:toolu-task-complete`)).toBe(completedChild.id)
  expect(manager.taskChildSessions.get(`${rootSession.id}:toolu-task-fail`)).toBe(failedChild.id)
  expect(sessionEvents.filter(event => event.type === 'subagent_status_changed')).toContainEqual({
    type: 'subagent_status_changed',
    sessionId: '260308-root',
    childSessionId: completedChild.id,
    subagentStatus: 'completed',
  })
  expect(sessionEvents.filter(event => event.type === 'subagent_status_changed')).toContainEqual({
    type: 'subagent_status_changed',
    sessionId: '260308-root',
    childSessionId: failedChild.id,
    subagentStatus: 'failed',
  })
})

test('Task lifecycle flushes child session persistence before emitting child-session events', async () => {
  const manager = new SessionManager() as any
  const rootSession = createManagedSession()
  const callOrder: string[] = []

  manager.sessions = new Map([[rootSession.id, rootSession]])
  manager.persistSession = () => {
    callOrder.push('persist')
  }
  manager.flushSession = async () => {
    callOrder.push('flush:start')
    await Promise.resolve()
    callOrder.push('flush:end')
  }
  manager.sendEvent = (event: SessionEvent) => {
    callOrder.push(`event:${event.type}`)
  }

  await manager.processEvent(rootSession, {
    type: 'tool_start',
    toolName: 'Task',
    toolUseId: 'toolu-task-flush',
    input: {
      description: 'Explore workspace sources',
      subagent_type: 'Explore',
    },
    turnId: 'turn-1',
  })

  const spawnEventIndex = callOrder.indexOf('event:subagent_spawned')
  const runningEventIndex = callOrder.indexOf('event:subagent_status_changed')

  expect(callOrder).toContain('flush:start')
  expect(callOrder).toContain('flush:end')
  expect(spawnEventIndex).toBeGreaterThan(-1)
  expect(runningEventIndex).toBeGreaterThan(-1)
  expect(callOrder.indexOf('flush:end')).toBeLessThan(spawnEventIndex)
  expect(callOrder.indexOf('flush:end')).toBeLessThan(runningEventIndex)
})
