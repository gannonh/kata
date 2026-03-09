import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { writeSessionJsonl } from '../../../../packages/shared/src/sessions/jsonl.ts'
import type { StoredSession } from '../../../../packages/shared/src/sessions/types.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

type SubagentStatesFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

/**
 * Creates test data with two orchestrator parents (each with sub-agents in varied states)
 * and one standalone session. This enables testing:
 * - Status dot colors per subagentStatus
 * - Expand/collapse chevron interaction
 * - Collapse-on-select (clicking a session collapses other parents)
 * - Tree line rendering
 * - Sub-agent chip layout and truncation
 */
function createSubagentStatesTestData(): string {
  const testId = `kata-e2e-subagent-states-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const testDataDir = path.join(tmpdir(), testId)
  const workspaceDir = path.join(testDataDir, 'workspaces', 'test-workspace')
  const sessionsDir = path.join(workspaceDir, 'sessions')

  mkdirSync(sessionsDir, { recursive: true })

  const config = {
    authType: 'api_key',
    anthropicBaseUrl: 'http://localhost:11434',
    workspaces: [
      {
        id: 'test-workspace',
        name: 'Test Workspace',
        rootPath: workspaceDir,
        createdAt: Date.now(),
      },
    ],
    activeWorkspaceId: 'test-workspace',
  }

  writeFileSync(path.join(testDataDir, 'config.json'), JSON.stringify(config, null, 2))

  // Orchestrator A: 3 children with different statuses (completed, running, failed)
  const orchestratorA: StoredSession = {
    id: 'orch-a',
    workspaceRootPath: workspaceDir,
    createdAt: 10,
    lastUsedAt: 20,
    lastMessageAt: 20,
    name: 'Explore codebase with multiple agents',
    permissionMode: 'safe',
    todoState: 'todo',
    sessionKind: 'orchestrator',
    orchestratorSessionId: 'orch-a',
    messages: [
      { id: 'user-a1', type: 'user', content: 'Explore the codebase', timestamp: 10 },
      {
        id: 'task-a1', type: 'tool', content: 'Explore features', timestamp: 11,
        toolName: 'Task', toolDisplayName: 'general-purpose', toolUseId: 'toolu-a1',
        toolInput: { description: 'Explore features and functionality', subagent_type: 'general-purpose' },
        toolStatus: 'completed',
      },
      {
        id: 'task-a2', type: 'tool', content: 'Explore test coverage', timestamp: 12,
        toolName: 'Task', toolDisplayName: 'general-purpose', toolUseId: 'toolu-a2',
        toolInput: { description: 'Explore test coverage and organization', subagent_type: 'general-purpose' },
        toolStatus: 'running',
      },
      {
        id: 'task-a3', type: 'tool', content: 'Explore architecture', timestamp: 13,
        toolName: 'Task', toolDisplayName: 'general-purpose', toolUseId: 'toolu-a3',
        toolInput: { description: 'Explore architecture and structure', subagent_type: 'general-purpose' },
        toolStatus: 'error',
      },
    ],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  const childA1: StoredSession = {
    id: 'child-a1',
    workspaceRootPath: workspaceDir,
    createdAt: 11, lastUsedAt: 15, lastMessageAt: 15,
    name: 'Explore features and functionality',
    permissionMode: 'safe', todoState: 'todo',
    sessionKind: 'subagent',
    parentSessionId: 'orch-a', orchestratorSessionId: 'orch-a',
    delegatedBySessionId: 'orch-a', delegatedToolUseId: 'toolu-a1',
    delegationLabel: 'Explore features and functionality',
    agentRole: 'general-purpose',
    subagentStatus: 'completed',
    messages: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  const childA2: StoredSession = {
    id: 'child-a2',
    workspaceRootPath: workspaceDir,
    createdAt: 12, lastUsedAt: 20, lastMessageAt: 20,
    name: 'Explore test coverage and organization',
    permissionMode: 'safe', todoState: 'todo',
    sessionKind: 'subagent',
    parentSessionId: 'orch-a', orchestratorSessionId: 'orch-a',
    delegatedBySessionId: 'orch-a', delegatedToolUseId: 'toolu-a2',
    delegationLabel: 'Explore test coverage and organization',
    agentRole: 'general-purpose',
    subagentStatus: 'running',
    messages: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  const childA3: StoredSession = {
    id: 'child-a3',
    workspaceRootPath: workspaceDir,
    createdAt: 13, lastUsedAt: 18, lastMessageAt: 18,
    name: 'Explore architecture and structure',
    permissionMode: 'safe', todoState: 'todo',
    sessionKind: 'subagent',
    parentSessionId: 'orch-a', orchestratorSessionId: 'orch-a',
    delegatedBySessionId: 'orch-a', delegatedToolUseId: 'toolu-a3',
    delegationLabel: 'Explore architecture and structure',
    agentRole: 'general-purpose',
    subagentStatus: 'failed',
    messages: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  // Orchestrator B: 2 children (both completed)
  const orchestratorB: StoredSession = {
    id: 'orch-b',
    workspaceRootPath: workspaceDir,
    createdAt: 5,
    lastUsedAt: 9,
    lastMessageAt: 9,
    name: 'Refactor authentication module',
    permissionMode: 'safe',
    todoState: 'todo',
    sessionKind: 'orchestrator',
    orchestratorSessionId: 'orch-b',
    messages: [
      { id: 'user-b1', type: 'user', content: 'Refactor auth', timestamp: 5 },
      {
        id: 'task-b1', type: 'tool', content: 'Extract OAuth logic', timestamp: 6,
        toolName: 'Task', toolDisplayName: 'general-purpose', toolUseId: 'toolu-b1',
        toolInput: { description: 'Extract OAuth logic', subagent_type: 'general-purpose' },
        toolStatus: 'completed',
      },
      {
        id: 'task-b2', type: 'tool', content: 'Update credential store', timestamp: 7,
        toolName: 'Task', toolDisplayName: 'general-purpose', toolUseId: 'toolu-b2',
        toolInput: { description: 'Update credential store', subagent_type: 'general-purpose' },
        toolStatus: 'completed',
      },
    ],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  const childB1: StoredSession = {
    id: 'child-b1',
    workspaceRootPath: workspaceDir,
    createdAt: 6, lastUsedAt: 8, lastMessageAt: 8,
    name: 'Extract OAuth logic',
    permissionMode: 'safe', todoState: 'todo',
    sessionKind: 'subagent',
    parentSessionId: 'orch-b', orchestratorSessionId: 'orch-b',
    delegatedBySessionId: 'orch-b', delegatedToolUseId: 'toolu-b1',
    delegationLabel: 'Extract OAuth logic',
    agentRole: 'general-purpose',
    subagentStatus: 'completed',
    messages: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  const childB2: StoredSession = {
    id: 'child-b2',
    workspaceRootPath: workspaceDir,
    createdAt: 7, lastUsedAt: 9, lastMessageAt: 9,
    name: 'Update credential store',
    permissionMode: 'safe', todoState: 'todo',
    sessionKind: 'subagent',
    parentSessionId: 'orch-b', orchestratorSessionId: 'orch-b',
    delegatedBySessionId: 'orch-b', delegatedToolUseId: 'toolu-b2',
    delegationLabel: 'Update credential store',
    agentRole: 'general-purpose',
    subagentStatus: 'completed',
    messages: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  // Standalone session (no sub-agents)
  const standalone: StoredSession = {
    id: 'standalone-1',
    workspaceRootPath: workspaceDir,
    createdAt: 1, lastUsedAt: 4, lastMessageAt: 4,
    name: 'Clarify user intent',
    permissionMode: 'safe', todoState: 'todo',
    messages: [
      { id: 'user-s1', type: 'user', content: 'Hello', timestamp: 1 },
      { id: 'assistant-s1', type: 'assistant', content: 'Hi there', timestamp: 2 },
    ],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
  }

  const sessions = [orchestratorA, childA1, childA2, childA3, orchestratorB, childB1, childB2, standalone]
  for (const session of sessions) {
    const dir = path.join(sessionsDir, session.id)
    mkdirSync(dir, { recursive: true })
    writeSessionJsonl(path.join(dir, 'session.jsonl'), session)
  }

  return testDataDir
}

export const test = base.extend<SubagentStatesFixtures>({
  electronApp: async ({ browserName: _browserName }, use) => {
    const testDataDir = createSubagentStatesTestData()
    const args = [
      path.join(__dirname, '../../dist/main.cjs'),
      `--user-data-dir=${testDataDir}`,
    ]

    if (isCI) {
      args.push(
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      )
    }

    const app = await electron.launch({
      args,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        KATA_TEST_MODE: '1',
        KATA_CONFIG_DIR: testDataDir,
      },
    })

    await use(app)
    await app.close()

    try {
      rmSync(testDataDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup failures
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForSelector('[data-testid="session-list-item"]', { timeout: 10000 })
    await use(window)
  },
})

export { expect } from '@playwright/test'
