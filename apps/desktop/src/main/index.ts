import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { PiAgentBridge } from './pi-agent-bridge'
import { registerSessionIpc } from './ipc'

let mainWindow: BrowserWindow | null = null
let bridge: PiAgentBridge | null = null

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

app.whenReady().then(() => {
  const workspacePath = process.env.KATA_WORKSPACE_PATH || process.cwd()

  bridge = new PiAgentBridge(workspacePath)
  mainWindow = createWindow()

  registerSessionIpc({ bridge, window: mainWindow })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  log.info('[desktop-main] ready', {
    workspacePath,
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
