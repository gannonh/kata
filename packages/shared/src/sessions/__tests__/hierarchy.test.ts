import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { createSessionHeader, readSessionJsonl, writeSessionJsonl } from '../jsonl.ts'

test('session header preserves orchestrator hierarchy metadata', () => {
  const session = {
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
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    agentRole: 'Explore',
    delegatedBySessionId: '260308-root',
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
  }

  const header = createSessionHeader(session)

  expect(header.sessionKind).toBe('subagent')
  expect(header.parentSessionId).toBe('260308-root')
  expect(header.orchestratorSessionId).toBe('260308-root')
  expect(header.agentRole).toBe('Explore')
  expect(header.delegatedBySessionId).toBe('260308-root')
  expect(header.delegationLabel).toBe('Explore workspace sources')
  expect(header.subagentStatus).toBe('running')
})

test('session JSONL round-trip preserves orchestrator hierarchy metadata', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'session-hierarchy-'))
  const sessionFile = join(tempDir, 'session.jsonl')
  const session = {
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
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    agentRole: 'Explore',
    delegatedBySessionId: '260308-root',
    delegationLabel: 'Explore workspace sources',
    subagentStatus: 'running',
  }

  try {
    writeSessionJsonl(sessionFile, session)

    const loadedSession = readSessionJsonl(sessionFile)

    expect(loadedSession?.sessionKind).toBe('subagent')
    expect(loadedSession?.parentSessionId).toBe('260308-root')
    expect(loadedSession?.orchestratorSessionId).toBe('260308-root')
    expect(loadedSession?.agentRole).toBe('Explore')
    expect(loadedSession?.delegatedBySessionId).toBe('260308-root')
    expect(loadedSession?.delegationLabel).toBe('Explore workspace sources')
    expect(loadedSession?.subagentStatus).toBe('running')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
