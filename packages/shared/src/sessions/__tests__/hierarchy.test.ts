import { expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import type { StoredSession } from '../types.ts'
import { createSessionHeader, readSessionJsonl, writeSessionJsonl } from '../jsonl.ts'
import { createSession, listSessions, loadSession, updateSessionMetadata } from '../storage.ts'

const hierarchy = {
  sessionKind: 'subagent' as const,
  parentSessionId: '260308-root',
  orchestratorSessionId: '260308-root',
  agentRole: 'Explore',
  delegatedBySessionId: '260308-root',
  delegatedToolUseId: 'toolu-task-a',
  delegationLabel: 'Explore workspace sources',
  subagentStatus: 'running' as const,
}

test('session header preserves orchestrator hierarchy metadata', () => {
  const session: StoredSession = {
    id: '260308-parent',
    workspaceRootPath: '/tmp/workspace',
    createdAt: 1,
    lastUsedAt: 1,
    messages: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: 0,
      costUsd: 0,
    },
    ...hierarchy,
  }

  const header = createSessionHeader(session)

  expect(header).toMatchObject(hierarchy)
})

test('session JSONL round-trip preserves orchestrator hierarchy metadata', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'session-hierarchy-'))
  const sessionFile = join(tempDir, 'session.jsonl')
  const session: StoredSession = {
    id: '260308-parent',
    workspaceRootPath: '/tmp/workspace',
    createdAt: 1,
    lastUsedAt: 1,
    messages: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: 0,
      costUsd: 0,
    },
    ...hierarchy,
  }

  try {
    writeSessionJsonl(sessionFile, session)

    const loadedSession = readSessionJsonl(sessionFile)

    expect(loadedSession).toMatchObject(hierarchy)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('session storage CRUD preserves hierarchy metadata through create update and list flows', async () => {
  const workspaceRootPath = mkdtempSync(join(tmpdir(), 'session-storage-hierarchy-'))

  try {
    const createOptions: Parameters<typeof createSession>[1] = {
      workingDirectory: '/tmp/workspace',
      ...hierarchy,
    }

    const created = await createSession(workspaceRootPath, createOptions)
    const createdSession = loadSession(workspaceRootPath, created.id)
    const listedSession = listSessions(workspaceRootPath).find(session => session.id === created.id)

    expect(created).toMatchObject(hierarchy)
    expect(createdSession).toMatchObject(hierarchy)
    expect(listedSession).toMatchObject(hierarchy)

    await updateSessionMetadata(workspaceRootPath, created.id, {
      sessionKind: 'orchestrator',
      parentSessionId: undefined,
      orchestratorSessionId: created.id,
      agentRole: 'Coordinator',
      delegatedBySessionId: undefined,
      delegatedToolUseId: undefined,
      delegationLabel: 'Coordinate workspace analysis',
      subagentStatus: 'completed',
    })

    const updatedSession = loadSession(workspaceRootPath, created.id)
    const updatedListedSession = listSessions(workspaceRootPath).find(session => session.id === created.id)

    expect(updatedSession).toMatchObject({
      sessionKind: 'orchestrator',
      parentSessionId: undefined,
      orchestratorSessionId: created.id,
      agentRole: 'Coordinator',
      delegatedBySessionId: undefined,
      delegatedToolUseId: undefined,
      delegationLabel: 'Coordinate workspace analysis',
      subagentStatus: 'completed',
    })
    expect(updatedListedSession).toMatchObject({
      sessionKind: 'orchestrator',
      parentSessionId: undefined,
      orchestratorSessionId: created.id,
      agentRole: 'Coordinator',
      delegatedBySessionId: undefined,
      delegatedToolUseId: undefined,
      delegationLabel: 'Coordinate workspace analysis',
      subagentStatus: 'completed',
    })
  } finally {
    rmSync(workspaceRootPath, { recursive: true, force: true })
  }
})
