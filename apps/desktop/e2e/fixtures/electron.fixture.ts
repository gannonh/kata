import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

function createIsolatedDataDir(): string {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-e2e-'))
  mkdirSync(path.join(dataDir, 'workspace'), { recursive: true })
  mkdirSync(path.join(dataDir, '.kata-cli', 'agent'), { recursive: true })
  return dataDir
}

function createMockKataRpcBinary(dataDir: string): string {
  const executablePath = path.join(dataDir, 'kata-rpc-mock')

  writeFileSync(
    executablePath,
    `#!/usr/bin/env node
const readline = require('node:readline')

const rl = readline.createInterface({ input: process.stdin })

function respond(message, data = {}, success = true, error) {
  const payload = {
    type: 'response',
    id: message.id,
    command: message.type,
    success,
    data,
  }

  if (error) payload.error = error

  process.stdout.write(JSON.stringify(payload) + '\\n')
}

process.stdout.write(JSON.stringify({ type: 'event', event: { type: 'agent_ready' } }) + '\\n')

rl.on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }

  switch (message.type) {
    case 'prompt':
      respond(message, { ok: true })
      process.stdout.write(JSON.stringify({ type: 'event', event: { type: 'agent_end' } }) + '\\n')
      break
    case 'abort':
      respond(message, { ok: true })
      break
    case 'shutdown':
      respond(message, { ok: true })
      setTimeout(() => process.exit(0), 10)
      break
    case 'get_available_models':
      respond(message, {
        models: [
          {
            provider: 'openai',
            id: 'gpt-4.1',
            reasoning: true,
          },
          {
            provider: 'anthropic',
            id: 'claude-sonnet-4-6',
            reasoning: true,
          },
        ],
      })
      break
    case 'set_model':
    case 'set_thinking_level':
    case 'switch_session':
      respond(message, { cancelled: false })
      break
    default:
      respond(message, { ok: true })
      break
  }
})
`,
    'utf8',
  )

  chmodSync(executablePath, 0o755)
  return executablePath
}

function seedAuthFixture(authFilePath: string, mode: 'clean' | 'seeded_auth'): void {
  mkdirSync(path.dirname(authFilePath), { recursive: true })

  if (mode === 'seeded_auth') {
    writeFileSync(
      authFilePath,
      JSON.stringify(
        {
          openai: {
            type: 'api_key',
            key: 'sk-seeded-openai-key-1234567890',
          },
        },
        null,
        2,
      ),
      'utf8',
    )
    return
  }

  writeFileSync(authFilePath, '{}\n', 'utf8')
}

async function waitForAppReady(window: Page): Promise<void> {
  await window.waitForLoadState('domcontentloaded')
  // Wait for React to mount — #root should have children once the app renders
  await window.waitForFunction(
    () => (document.getElementById('root')?.children.length ?? 0) > 0,
    { timeout: 15_000 },
  )
  // Small settle time for React renders to finalize
  await window.waitForTimeout(500)
}

async function dismissOnboardingIfPresent(window: Page): Promise<void> {
  const getStarted = window.getByRole('button', { name: /Get started/i })
  if (!(await getStarted.isVisible({ timeout: 2_000 }).catch(() => false))) {
    return
  }

  // Step 1 → 2: "Get started"
  await getStarted.click()
  await window.waitForTimeout(500)

  // Step 2 → 3: Click a provider card then "Continue"
  // Provider buttons contain provider name + description. Click whichever is first.
  const providerCard = window.getByRole('button', { name: /Anthropic|OpenAI/i }).first()
  if (await providerCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await providerCard.click()
    await window.waitForTimeout(300)
  }

  const continueButton = window.getByRole('button', { name: /Continue/i })
  if (await continueButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await continueButton.click()
    await window.waitForTimeout(500)
  }

  // Step 3 → 4: "Skip for now" (skip API key entry)
  const skipForNow = window.getByRole('button', { name: /Skip for now/i })
  if (await skipForNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skipForNow.click()
    await window.waitForTimeout(500)
  }

  // Step 4 → done: "Start chatting"
  const startChatting = window.getByRole('button', { name: /Start chatting/i })
  if (await startChatting.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await startChatting.click()
    await window.waitForTimeout(500)
  }
}

export async function startMockWorkflowRuntime(page: Page): Promise<void> {
  await page.getByTestId('kanban-refresh-board').waitFor({ state: 'visible' })

  const startResult = await page.evaluate(async () => {
    try {
      return await window.api.symphony.start()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: {
          code: 'UNKNOWN',
          phase: 'unknown',
          message,
        },
      }
    }
  })

  if (!startResult?.success) {
    const details =
      typeof startResult?.error === 'string'
        ? startResult.error
        : startResult?.error?.message ?? 'unknown error'
    throw new Error(`Failed to start mock workflow runtime: ${details}`)
  }

  await page.getByTestId('kanban-refresh-board').click()
  await page.getByTestId('kanban-column-in_progress').waitFor({ state: 'visible' })
}

export async function openMcpSettingsFromWorkflow(page: Page): Promise<void> {
  await page.getByTestId('kanban-open-mcp-settings').click()
  await page.getByTestId('mcp-settings-panel').waitFor({ state: 'visible' })
}

type DesktopFixtures = {
  electronApp: ElectronApplication
  workspaceDir: string
  mcpConfigPath: string
  authFilePath: string
  mainWindow: Page
  readyWindow: Page
  symphonyMockMode:
    | 'ready'
    | 'config_error'
    | 'readiness_error'
    | 'response_failure'
    | 'reconnecting'
    | 'kanban_assigned'
    | 'kanban_stale'
    | 'kanban_disconnected'
    | 'assembled_healthy'
    | 'assembled_failure_recovery'
  chatRuntimeFaultMode: 'none' | 'process_crash_once'
  firstRunProfileMode: 'clean' | 'seeded_auth'
  firstRunStartupMode: 'healthy' | 'binary_missing'
}

export const test = base.extend<DesktopFixtures>({
  symphonyMockMode: ['ready', { option: true }],
  chatRuntimeFaultMode: ['none', { option: true }],
  firstRunProfileMode: ['clean', { option: true }],
  firstRunStartupMode: ['healthy', { option: true }],
  workspaceDir: async ({}, use) => {
    const dataDir = createIsolatedDataDir()
    const workspaceDir = path.join(dataDir, 'workspace')
    try {
      await use(workspaceDir)
    } finally {
      try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* noop */ }
    }
  },
  electronApp: async (
    {
      workspaceDir,
      symphonyMockMode,
      chatRuntimeFaultMode,
      firstRunProfileMode,
      firstRunStartupMode,
      mcpConfigPath,
      authFilePath,
    },
    use,
  ) => {
    const dataDir = path.dirname(workspaceDir)
    const mockKataBinary = createMockKataRpcBinary(dataDir)
    const configuredKataBinary =
      firstRunStartupMode === 'binary_missing' ? path.join(dataDir, 'missing-kata-binary') : mockKataBinary

    const binaryMissingPathDir = path.join(dataDir, 'empty-path')
    if (firstRunStartupMode === 'binary_missing') {
      mkdirSync(binaryMissingPathDir, { recursive: true })
    }

    seedAuthFixture(authFilePath, firstRunProfileMode)

    const mainEntry = path.join(__dirname, '../../dist/main.cjs')
    const preloadEntry = path.join(__dirname, '../../dist/preload.cjs')

    // The e2e fixture expects build outputs to exist before test launch.
    // Run: bun run build:main && bun run build:preload && bun run build:renderer
    if (!existsSync(mainEntry) || !existsSync(preloadEntry)) {
      throw new Error(
        `Missing build output(s). Expected ${mainEntry} and ${preloadEntry}. ` +
          'Run bun run build:main && bun run build:preload && bun run build:renderer first.',
      )
    }

    const args = [
      mainEntry,
      `--user-data-dir=${dataDir}`,
    ]

    if (isCI) {
      args.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
    }

    const app = await electron.launch({
      args,
      env: {
        ...process.env,
        ...(firstRunStartupMode === 'binary_missing' ? { PATH: binaryMissingPathDir } : {}),
        NODE_ENV: 'test',
        KATA_TEST_MODE: '1',
        KATA_WORKSPACE_PATH: workspaceDir,
        KATA_DESKTOP_SYMPHONY_MOCK: symphonyMockMode,
        KATA_DESKTOP_SYMPHONY_DASHBOARD_MOCK: symphonyMockMode,
        KATA_SYMPHONY_URL: 'http://127.0.0.1:8080',
        KATA_DESKTOP_MCP_CONFIG_PATH: mcpConfigPath,
        KATA_DESKTOP_AUTH_FILE_PATH: authFilePath,
        KATA_DESKTOP_RELIABILITY_CHAT_FAULT: chatRuntimeFaultMode,
        KATA_BIN_PATH: configuredKataBinary,
        // Force packaged-file mode for deterministic e2e: if a parent shell exported
        // VITE_DEV_SERVER_URL we would silently bind to an arbitrary dev server.
        VITE_DEV_SERVER_URL: '',
        // Don't override HOME — that breaks CLI binary discovery and auth.json lookup.
        // The --user-data-dir flag isolates Electron's own data (localStorage, cookies).
      },
    })

    try {
      await use(app)
    } finally {
      // app.close() can hang for 30s+ waiting for the kata CLI subprocess to shut
      // down gracefully. Race it with a hard kill to keep test runs fast.
      const pid = app.process().pid
      const closePromise = app.close().catch(() => {})
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3_000))
      await Promise.race([closePromise, timeout])
      if (pid) {
        try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
      }
    }
  },

  mcpConfigPath: async ({ workspaceDir }, use) => {
    const configPath = path.join(path.dirname(workspaceDir), '.kata-cli', 'agent', 'mcp.json')
    await use(configPath)
  },

  authFilePath: async ({ workspaceDir }, use) => {
    const filePath = path.join(path.dirname(workspaceDir), '.kata-cli', 'agent', 'auth.json')
    await use(filePath)
  },

  mainWindow: async ({ electronApp }, use) => {
    const existingWindows = electronApp.windows()
    const window = existingWindows.length > 0
      ? existingWindows[0]
      : await electronApp.firstWindow()
    await waitForAppReady(window)
    await use(window)
  },

  /** mainWindow with onboarding auto-dismissed — use for tests that need the chat shell. */
  readyWindow: async ({ electronApp }, use) => {
    const existingWindows = electronApp.windows()
    const window = existingWindows.length > 0
      ? existingWindows[0]
      : await electronApp.firstWindow()
    await waitForAppReady(window)
    await dismissOnboardingIfPresent(window)
    await use(window)
  },
})

export { expect } from '@playwright/test'
