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

type OrchestrationFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

function createOrchestrationTestDataDir(): string {
  const testId = `kata-e2e-orchestration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

  const orchestrator: StoredSession = {
    id: '260308-root',
    workspaceRootPath: workspaceDir,
    createdAt: 1,
    lastUsedAt: 3,
    lastMessageAt: 3,
    name: 'Explore workspace files in parallel',
    permissionMode: 'safe',
    todoState: 'todo',
    sessionKind: 'orchestrator',
    orchestratorSessionId: '260308-root',
    messages: [
      {
        id: 'user-1',
        type: 'user',
        content: 'Launch two sub-agents in parallel.',
        timestamp: 1,
      },
      {
        id: 'task-a',
        type: 'tool',
        content: 'Inspect workspace files',
        timestamp: 2,
        toolName: 'Task',
        toolDisplayName: 'general-purpose',
        toolUseId: 'toolu-task-a',
        toolInput: {
          description: 'Inspect workspace files',
          subagent_type: 'general-purpose',
        },
        toolStatus: 'completed',
      },
      {
        id: 'tool-a-terminal',
        type: 'tool',
        content: 'ls -la\nfoobar.txt',
        timestamp: 3,
        toolName: 'Bash',
        toolDisplayName: 'Terminal',
        toolUseId: 'toolu-shell-a',
        toolInput: {
          command: 'ls -la',
          description: 'List all files in the workspace directory',
        },
        parentToolUseId: 'toolu-task-a',
        toolStatus: 'completed',
      },
      {
        id: 'tool-a-read',
        type: 'tool',
        content: 'Found foobar in workspace',
        timestamp: 4,
        toolName: 'Read',
        toolDisplayName: 'Read',
        toolUseId: 'toolu-read-a',
        toolInput: {
          file_path: '/workspace/foobar.txt',
        },
        parentToolUseId: 'toolu-task-a',
        toolStatus: 'completed',
      },
      {
        id: 'task-b',
        type: 'tool',
        content: 'Summarize existing files',
        timestamp: 5,
        toolName: 'Task',
        toolDisplayName: 'general-purpose',
        toolUseId: 'toolu-task-b',
        toolInput: {
          description: 'Summarize existing files',
          subagent_type: 'general-purpose',
        },
        toolStatus: 'completed',
      },
      {
        id: 'tool-b-terminal',
        type: 'tool',
        content: 'Summary: foobar.txt exists',
        timestamp: 6,
        toolName: 'Bash',
        toolDisplayName: 'Terminal',
        toolUseId: 'toolu-shell-b',
        toolInput: {
          command: 'find . -maxdepth 1 -type f',
          description: 'Summarize the files in the workspace root',
        },
        parentToolUseId: 'toolu-task-b',
        toolStatus: 'completed',
      },
      {
        id: 'assistant-1',
        type: 'assistant',
        content: 'Both sub-agents completed successfully.',
        timestamp: 7,
      },
    ],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: 0,
      costUsd: 0,
    },
  }

  const childA: StoredSession = {
    id: '260308-child-a',
    workspaceRootPath: workspaceDir,
    createdAt: 2,
    lastUsedAt: 4,
    lastMessageAt: 4,
    name: 'Inspect workspace files',
    permissionMode: 'safe',
    todoState: 'todo',
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    delegatedBySessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-a',
    delegationLabel: 'Inspect workspace files',
    agentRole: 'general-purpose',
    subagentStatus: 'completed',
    messages: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: 0,
      costUsd: 0,
    },
  }

  const childB: StoredSession = {
    id: '260308-child-b',
    workspaceRootPath: workspaceDir,
    createdAt: 2,
    lastUsedAt: 6,
    lastMessageAt: 6,
    name: 'Summarize existing files',
    permissionMode: 'safe',
    todoState: 'todo',
    sessionKind: 'subagent',
    parentSessionId: '260308-root',
    orchestratorSessionId: '260308-root',
    delegatedBySessionId: '260308-root',
    delegatedToolUseId: 'toolu-task-b',
    delegationLabel: 'Summarize existing files',
    agentRole: 'general-purpose',
    subagentStatus: 'completed',
    messages: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: 0,
      costUsd: 0,
    },
  }

  for (const session of [orchestrator, childA, childB]) {
    const dir = path.join(sessionsDir, session.id)
    mkdirSync(dir, { recursive: true })
    writeSessionJsonl(path.join(dir, 'session.jsonl'), session)
  }

  return testDataDir
}

export const test = base.extend<OrchestrationFixtures>({
  electronApp: async ({}, use) => {
    const testDataDir = createOrchestrationTestDataDir()

    const app = await electron.launch({
      args: [
        path.join(__dirname, '../../dist/main.cjs'),
        `--user-data-dir=${testDataDir}`,
      ],
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
    await window.waitForTimeout(3000)
    await use(window)
  },
})

export { expect } from '@playwright/test'
