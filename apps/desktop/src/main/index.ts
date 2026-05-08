import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, nativeImage } from 'electron'

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function expandEnvReferences(value: string, loadedValues: Map<string, string>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const fromProcess = process.env[name]
    if (fromProcess !== undefined) {
      return fromProcess
    }

    const fromLoaded = loadedValues.get(name)
    return fromLoaded ?? ''
  })
}

function loadEnvFileIfPresent(envPath: string): void {
  if (!existsSync(envPath)) {
    return
  }

  const envContent = readFileSync(envPath, 'utf8')
  const loadedValues = new Map<string, string>()

  for (const rawLine of envContent.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const key = match[1]?.trim()
    if (!key) continue

    const rawValue = match[2] ?? ''
    const value = expandEnvReferences(stripWrappingQuotes(rawValue), loadedValues)
    loadedValues.set(key, value)

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function resolveGitCommonRoot(startDir: string): string | null {
  try {
    const commonDirRaw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: startDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
      windowsHide: true,
    }).trim()

    if (!commonDirRaw) return null

    const absoluteCommonDir = path.isAbsolute(commonDirRaw)
      ? commonDirRaw
      : path.resolve(startDir, commonDirRaw)

    return path.dirname(absoluteCommonDir)
  } catch {
    return null
  }
}

function applyGithubTokenAliases(): void {
  const ghToken = process.env.GH_TOKEN?.trim()
  if (!ghToken) return

  if (!process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = ghToken
  }

  if (!process.env.KATA_GITHUB_TOKEN) {
    process.env.KATA_GITHUB_TOKEN = ghToken
  }
}

function loadDevEnvironment(): void {
  // Canonical project secrets live in <repo-root>/.env.
  // Resolve git common root so worktrees still use one shared secret location.
  const commonRoot =
    resolveGitCommonRoot(process.cwd()) ??
    resolveGitCommonRoot(path.resolve(__dirname, '..')) ??
    resolveGitCommonRoot(path.resolve(__dirname, '..', '..'))

  if (commonRoot) {
    loadEnvFileIfPresent(path.join(commonRoot, '.env'))
  }

  // Keep local desktop-only dev overrides (non-secret machine config) in
  // .env.development for convenience.
  const desktopEnvCandidates = [
    path.join(__dirname, '..', '.env.development'),
    path.resolve(process.cwd(), 'apps', 'desktop', '.env.development'),
    path.resolve(process.cwd(), '.env.development'),
  ]

  for (const candidate of desktopEnvCandidates) {
    if (existsSync(candidate)) {
      loadEnvFileIfPresent(candidate)
      break
    }
  }

  applyGithubTokenAliases()
}

// Must run before any code reads process.env.
if (!app.isPackaged) {
  loadDevEnvironment()
}
import { AuthBridge } from './auth-bridge'
import log from './logger'
import { evaluateExternalWindowRequest } from './external-window-policy'
import { PiAgentBridge } from './pi-agent-bridge'
import { registerSessionIpc } from './ipc'
import { DesktopSessionManager } from './session-manager'
import { SymphonySupervisor } from './symphony-supervisor'
import { SymphonyOperatorService } from './symphony-operator-service'
import { AgentActivityJournal } from './agent-activity-journal'

const SETTINGS_PATH = path.join(homedir(), '.kata-cli', 'agent', 'settings.json')

let mainWindow: BrowserWindow | null = null
let bridge: PiAgentBridge | null = null
let symphonySupervisor: SymphonySupervisor | null = null
let symphonyOperatorService: SymphonyOperatorService | null = null
let agentActivityJournal: AgentActivityJournal | null = null
let unregisterSessionIpc: (() => void) | null = null

function createWindow(): BrowserWindow {
  const isTestMode = process.env.KATA_TEST_MODE === '1'
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 720,
    show: !isTestMode,
    title: 'Kata Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Give in-app popups (PR badges, external links from the renderer) a
  // comfortable default size instead of Electron's 800x600 default, and
  // isolate them from the main preload so they have no IPC access. See
  // `evaluateExternalWindowRequest` — non-http(s) schemes are denied and
  // URLs are never logged raw (they may carry OAuth query params).
  window.webContents.setWindowOpenHandler(({ url }) => {
    const policy = evaluateExternalWindowRequest(url)
    if (policy.decision === 'deny') {
      log.warn('[desktop-main] external window denied', policy.logPayload)
      return { action: 'deny' }
    }

    log.info('[desktop-main] external window requested', policy.logPayload)
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1200,
        height: 1000,
        minWidth: 800,
        minHeight: 600,
        title: 'Kata Desktop',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
    if (!isTestMode) window.webContents.openDevTools({ mode: 'detach' })
  } else {
    void window.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  }

  return window
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    if (!raw.trim()) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return {}
    }

    log.warn('[desktop-main] failed to read settings', {
      path: SETTINGS_PATH,
      error: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}

async function writeSettings(updates: Record<string, unknown>): Promise<void> {
  const settingsDir = path.dirname(SETTINGS_PATH)
  await fs.mkdir(settingsDir, { recursive: true })

  const current = await readSettings()
  const next = {
    ...current,
    ...updates,
  }

  const tempPath = `${SETTINGS_PATH}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(tempPath, SETTINGS_PATH)
}

async function removeLegacyModelSetting(): Promise<void> {
  const settings = await readSettings()
  if (!Object.prototype.hasOwnProperty.call(settings, 'model')) {
    return
  }

  await writeSettings({ model: undefined })

  log.info('[desktop-main] removed legacy desktop model setting', {
    path: SETTINGS_PATH,
  })
}

async function resolveInitialWorkspacePath(): Promise<string> {
  const fallback = homedir()
  const envWorkspacePath = process.env.KATA_WORKSPACE_PATH?.trim()

  if (envWorkspacePath) {
    const resolvedEnvPath = path.resolve(envWorkspacePath)
    if (await isDirectory(resolvedEnvPath)) {
      return resolvedEnvPath
    }

    log.warn('[desktop-main] KATA_WORKSPACE_PATH is not a directory, falling back', {
      value: resolvedEnvPath,
      fallback,
    })
  }

  const settings = await readSettings()
  const storedWorkspace = settings.lastWorkingDirectory

  if (typeof storedWorkspace === 'string' && storedWorkspace.trim()) {
    const resolvedStoredPath = path.resolve(storedWorkspace)
    if (await isDirectory(resolvedStoredPath)) {
      return resolvedStoredPath
    }

    log.warn('[desktop-main] stored workspace is missing, falling back to home directory', {
      storedWorkspace: resolvedStoredPath,
      fallback,
    })
  }

  return fallback
}

async function persistWorkspacePath(workspacePath: string): Promise<void> {
  const resolvedPath = path.resolve(workspacePath)
  await writeSettings({ lastWorkingDirectory: resolvedPath })

  log.info('[desktop-main] persisted workspace preference', {
    workspacePath: resolvedPath,
    path: SETTINGS_PATH,
  })
}

app.whenReady().then(async () => {
  try {
    await removeLegacyModelSetting()
  } catch (error) {
    log.warn('[desktop-main] failed to remove legacy model setting', {
      path: SETTINGS_PATH,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const workspacePath = await resolveInitialWorkspacePath()

  bridge = new PiAgentBridge(workspacePath, 'pi', 30_000)
  symphonySupervisor = new SymphonySupervisor({
    workspacePath,
    appIsPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  })
  symphonyOperatorService = new SymphonyOperatorService({ env: process.env })
  agentActivityJournal = new AgentActivityJournal()

  const authBridge = new AuthBridge()
  const sessionManager = new DesktopSessionManager()
  mainWindow = createWindow()

  // Set dock icon in dev mode (packaged builds use Info.plist)
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, '..', 'resources', 'icon.png')
    if (existsSync(iconPath)) {
      app.dock.setIcon(nativeImage.createFromPath(iconPath))
    }
  }

  unregisterSessionIpc = registerSessionIpc({
    bridge,
    authBridge,
    sessionManager,
    window: mainWindow,
    onWorkspaceSelected: persistWorkspacePath,
    symphonySupervisor,
    symphonyOperatorService,
    agentActivityJournal,
  })

  mainWindow.on('closed', () => {
    unregisterSessionIpc?.()
    unregisterSessionIpc = null
    mainWindow = null
  })

  log.info('[desktop-main] ready', {
    workspacePath,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    startedAt: new Date().toISOString(),
  })
})

app.on('before-quit', async (event) => {
  if (!bridge) {
    return
  }

  event.preventDefault()
  try {
    await symphonySupervisor?.stop('app_quit')
    symphonyOperatorService?.dispose()
  } catch (error) {
    log.error('[desktop-main] symphony supervisor shutdown failed', error)
  }

  try {
    await bridge.shutdown()
  } catch (error) {
    log.error('[desktop-main] bridge shutdown failed', error)
  } finally {
    app.exit(0)
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
