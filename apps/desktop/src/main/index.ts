import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { AuthBridge } from './auth-bridge'
import log from './logger'
import { PiAgentBridge } from './pi-agent-bridge'
import { registerSessionIpc } from './ipc'

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

async function loadPersistedModel(): Promise<string | null> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    if (!raw.trim()) {
      return null
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const model = parsed.model
    return typeof model === 'string' && model.trim() ? model.trim() : null
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return null
    }

    log.warn('[desktop-main] failed to read settings model', {
      path: SETTINGS_PATH,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function persistSelectedModel(model: string): Promise<void> {
  const trimmedModel = model.trim()
  if (!trimmedModel) {
    return
  }

  const settingsDir = path.dirname(SETTINGS_PATH)
  await fs.mkdir(settingsDir, { recursive: true })

  let current: Record<string, unknown> = {}
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    if (raw.trim()) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        current = parsed as Record<string, unknown>
      }
    }
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT')) {
      throw error
    }
  }

  const next = {
    ...current,
    model: trimmedModel,
  }

  const tempPath = `${SETTINGS_PATH}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(tempPath, SETTINGS_PATH)

  log.info('[desktop-main] persisted model preference', {
    model: trimmedModel,
    path: SETTINGS_PATH,
  })
}

app.whenReady().then(async () => {
  const workspacePath = process.env.KATA_WORKSPACE_PATH || process.cwd()
  const persistedModel = await loadPersistedModel()

  bridge = new PiAgentBridge(workspacePath, 'kata', 30_000, persistedModel)
  const authBridge = new AuthBridge()
  mainWindow = createWindow()

  unregisterSessionIpc = registerSessionIpc({
    bridge,
    authBridge,
    window: mainWindow,
    onModelSelected: persistSelectedModel,
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
