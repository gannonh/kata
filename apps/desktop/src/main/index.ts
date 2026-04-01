import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { AuthBridge } from './auth-bridge'
import log from './logger'
import { PiAgentBridge } from './pi-agent-bridge'
import { registerSessionIpc } from './ipc'
import { DesktopSessionManager } from './session-manager'

const SETTINGS_PATH = path.join(homedir(), '.kata-cli', 'agent', 'settings.json')

let mainWindow: BrowserWindow | null = null
let bridge: PiAgentBridge | null = null
let unregisterSessionIpc: (() => void) | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Kata Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
    window.webContents.openDevTools({ mode: 'detach' })
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

async function loadPersistedModel(): Promise<string | null> {
  const settings = await readSettings()
  const model = settings.model
  return typeof model === 'string' && model.trim() ? model.trim() : null
}

async function persistSelectedModel(model: string): Promise<void> {
  const trimmedModel = model.trim()
  if (!trimmedModel) {
    return
  }

  await writeSettings({ model: trimmedModel })

  log.info('[desktop-main] persisted model preference', {
    model: trimmedModel,
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
  const workspacePath = await resolveInitialWorkspacePath()
  const persistedModel = await loadPersistedModel()

  bridge = new PiAgentBridge(workspacePath, 'kata', 30_000, persistedModel)
  const authBridge = new AuthBridge()
  const sessionManager = new DesktopSessionManager()
  mainWindow = createWindow()

  unregisterSessionIpc = registerSessionIpc({
    bridge,
    authBridge,
    sessionManager,
    window: mainWindow,
    onModelSelected: persistSelectedModel,
    onWorkspaceSelected: persistWorkspacePath,
  })

  mainWindow.on('closed', () => {
    unregisterSessionIpc?.()
    unregisterSessionIpc = null
    mainWindow = null
  })

  log.info('[desktop-main] ready', {
    workspacePath,
    model: persistedModel,
  })
})

app.on('before-quit', async (event) => {
  if (!bridge) {
    return
  }

  event.preventDefault()
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
