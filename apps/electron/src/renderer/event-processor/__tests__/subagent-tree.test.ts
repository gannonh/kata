import { expect, test } from 'bun:test'

import type { Message, Session } from '../../../shared/types'
import { mergeUpsertedSession } from '../helpers'
import { processEvent } from '../processor'
import type { SessionState } from '../types'

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? 'msg-1',
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'delegate this task',
    timestamp: overrides.timestamp ?? 1,
    ...overrides,
  }
}

function createSession(overrides: Partial<Session> = {}): Session {
  const sessionId = overrides.id ?? '260308-root'

  return {
    id: sessionId,
    workspaceId: overrides.workspaceId ?? 'workspace-1',
    workspaceName: overrides.workspaceName ?? 'Workspace 1',
    name: overrides.name ?? 'Root session',
    preview: overrides.preview,
    lastMessageAt: overrides.lastMessageAt ?? 1,
    messages: overrides.messages ?? [],
    isProcessing: overrides.isProcessing ?? true,
    sessionKind: overrides.sessionKind ?? 'orchestrator',
    orchestratorSessionId: overrides.orchestratorSessionId ?? sessionId,
    agentRole: overrides.agentRole ?? 'Coordinator',
    permissionMode: overrides.permissionMode ?? 'ask',
    enabledSourceSlugs: overrides.enabledSourceSlugs ?? ['context'],
    workingDirectory: overrides.workingDirectory ?? '/tmp/workspace',
    labels: overrides.labels ?? ['design'],
    ...overrides,
  }
}

function createState(session: Session): SessionState {
  return {
    session,
    streaming: null,
  }
}

test('subagent_spawned emits a child session upsert effect without contaminating the parent transcript', () => {
  const parent = createSession({
    messages: [
      createMessage(),
      createMessage({
        id: 'tool-1',
        role: 'tool',
        content: 'Running Task',
        toolUseId: 'toolu-task-a',
      }),
    ],
  })

  const result = processEvent(createState(parent), {
    type: 'subagent_spawned',
    sessionId: parent.id,
    delegatedToolUseId: 'toolu-task-a',
    childSessionId: '260308-child-a',
    childSessionName: 'Explore workspace sources',
    agentRole: 'Explore',
    delegationLabel: 'Explore workspace sources',
    parentSessionId: parent.id,
    orchestratorSessionId: parent.id,
  })

  expect(result.state.session.id).toBe(parent.id)
  expect(result.state.session.messages).toEqual(parent.messages)
  expect(result.effects).toContainEqual({
    type: 'upsert_session',
    session: expect.objectContaining({
      id: '260308-child-a',
      workspaceId: parent.workspaceId,
      workspaceName: parent.workspaceName,
      name: 'Explore workspace sources',
      preview: 'Explore workspace sources',
      sessionKind: 'subagent',
      parentSessionId: parent.id,
      orchestratorSessionId: parent.id,
      agentRole: 'Explore',
      delegatedBySessionId: parent.id,
      delegatedToolUseId: 'toolu-task-a',
      delegationLabel: 'Explore workspace sources',
      subagentStatus: 'running',
      messages: [],
      isProcessing: false,
    }),
  })
})

test('subagent_status_changed emits a child session upsert effect with lifecycle metadata', () => {
  const parent = createSession({
    isProcessing: false,
    lastMessageAt: 10,
    messages: [createMessage()],
  })

  const result = processEvent(createState(parent), {
    type: 'subagent_status_changed',
    sessionId: parent.id,
    delegatedToolUseId: 'toolu-task-a',
    childSessionId: '260308-child-a',
    subagentStatus: 'completed',
  })

  expect(result.state.session.messages).toEqual(parent.messages)
  expect(result.effects).toContainEqual({
    type: 'upsert_session',
    session: expect.objectContaining({
      id: '260308-child-a',
      workspaceId: parent.workspaceId,
      workspaceName: parent.workspaceName,
      sessionKind: 'subagent',
      parentSessionId: parent.id,
      orchestratorSessionId: parent.id,
      delegatedBySessionId: parent.id,
      delegatedToolUseId: 'toolu-task-a',
      subagentStatus: 'completed',
      messages: [],
      isProcessing: false,
    }),
  })
})

test('mergeUpsertedSession preserves an existing child transcript when lifecycle upserts are metadata-only', () => {
  const existingChild = createSession({
    id: '260308-child-a',
    name: 'Explore workspace sources',
    preview: 'Explore workspace sources',
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    agentRole: 'Explore',
    delegatedBySessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-a',
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
    messages: [
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Found the workspace sources.',
      }),
    ],
  })

  const metadataOnlyUpsert: Session = {
    id: '260308-child-a',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace 1',
    lastMessageAt: 2,
    isProcessing: false,
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    delegatedBySessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-a',
    subagentStatus: 'completed',
    messages: [],
  }

  const merged = mergeUpsertedSession(existingChild, metadataOnlyUpsert)

  expect(merged.messages).toEqual(existingChild.messages)
  expect(merged.lastMessageAt).toBe(existingChild.lastMessageAt)
  expect(merged.permissionMode).toBe(existingChild.permissionMode)
  expect(merged.subagentStatus).toBe('completed')
  expect(merged.name).toBe('Explore workspace sources')
  expect(merged.delegationLabel).toBe('Explore workspace sources')
})

test('mergeUpsertedSession preserves child-local settings on metadata-only lifecycle upserts', () => {
  const existingChild = createSession({
    id: '260308-child-a',
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    delegatedBySessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-a',
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
    permissionMode: 'allow-all',
    enabledSourceSlugs: ['child-source'],
    workingDirectory: '/tmp/child-workspace',
    model: 'claude-sonnet',
    thinkingLevel: 'max',
    isProcessing: true,
    lastMessageAt: 100,
  })

  const metadataOnlyUpsert: Session = {
    id: '260308-child-a',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace 1',
    lastMessageAt: 200,
    isProcessing: false,
    permissionMode: 'ask',
    enabledSourceSlugs: ['parent-source'],
    workingDirectory: '/tmp/parent-workspace',
    model: 'claude-opus',
    thinkingLevel: 'think',
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    delegatedBySessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-a',
    subagentStatus: 'completed',
    messages: [],
  }

  const merged = mergeUpsertedSession(existingChild, metadataOnlyUpsert)

  expect(merged.lastMessageAt).toBe(existingChild.lastMessageAt)
  expect(merged.isProcessing).toBe(true)
  expect(merged.permissionMode).toBe('allow-all')
  expect(merged.enabledSourceSlugs).toEqual(['child-source'])
  expect(merged.workingDirectory).toBe('/tmp/child-workspace')
  expect(merged.model).toBe('claude-sonnet')
  expect(merged.thinkingLevel).toBe('max')
  expect(merged.subagentStatus).toBe('completed')
})
