// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

type LoadMainOptions = {
  platform?: NodeJS.Platform
  rendererUrl?: string
  whenReadyReject?: Error
}

type WindowInstance = {
  options: {
    webPreferences: {
      preload: string
    }
  }
  show: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  triggerReadyToShow: () => void
}

async function loadMainModule(options: LoadMainOptions = {}) {
  vi.resetModules()

  const listeners = new Map<string, () => void>()
  const instances: WindowInstance[] = []
  let visibleWindows: WindowInstance[] = []

  class MockBrowserWindow {
    static getAllWindows = vi.fn(() => visibleWindows)

    private readyToShowHandler: (() => void) | undefined
    options: WindowInstance['options']
    show = vi.fn()
    loadURL = vi.fn(async () => undefined)
    loadFile = vi.fn(async () => undefined)

    constructor(windowOptions: WindowInstance['options']) {
      this.options = windowOptions
      const instance = this as unknown as WindowInstance
      instance.triggerReadyToShow = () => {
        this.readyToShowHandler?.()
      }
      instances.push(instance)
      visibleWindows = instances
    }

    once(event: string, callback: () => void): void {
      if (event === 'ready-to-show') {
        this.readyToShowHandler = callback
      }
    }
  }

  const appMock = {
    whenReady: vi.fn(() =>
      options.whenReadyReject ? Promise.reject(options.whenReadyReject) : Promise.resolve()
    ),
    on: vi.fn((event: string, callback: () => void) => {
      listeners.set(event, callback)
      return appMock
    }),
    quit: vi.fn()
  }

  const registerIpcHandlers = vi.fn()

  vi.doMock('electron', () => ({
    app: appMock,
    BrowserWindow: MockBrowserWindow
  }))
  vi.doMock('../../../src/main/ipc-handlers', () => ({
    registerIpcHandlers
  }))

  const previousRendererUrl = process.env.ELECTRON_RENDERER_URL
  if (options.rendererUrl) {
    process.env.ELECTRON_RENDERER_URL = options.rendererUrl
  } else {
    delete process.env.ELECTRON_RENDERER_URL
  }

  const previousPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: options.platform ?? previousPlatform,
    configurable: true
  })

  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  await import('../../../src/main/index')
  await new Promise((resolve) => setTimeout(resolve, 0))

  const restore = () => {
    if (previousRendererUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL
    } else {
      process.env.ELECTRON_RENDERER_URL = previousRendererUrl
    }
    Object.defineProperty(process, 'platform', {
      value: previousPlatform,
      configurable: true
    })
    consoleErrorSpy.mockRestore()
    vi.unmock('electron')
    vi.unmock('../../../src/main/ipc-handlers')
  }

  return {
    appMock,
    registerIpcHandlers,
    listeners,
    instances,
    setVisibleWindows(next: WindowInstance[]) {
      visibleWindows = next
    },
    consoleErrorSpy,
    restore
  }
}

describe('main process startup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('creates a window, loads renderer URL, and handles activation/close events', async () => {
    const harness = await loadMainModule({
      rendererUrl: 'http://localhost:5173',
      platform: 'linux'
    })

    try {
      expect(harness.registerIpcHandlers).toHaveBeenCalledTimes(1)
      expect(harness.instances).toHaveLength(1)

      const mainWindow = harness.instances[0]
      expect(mainWindow.options.webPreferences.preload).toMatch(/preload[\\/]+index\.mjs$/)
      expect(mainWindow.loadURL).toHaveBeenCalledWith('http://localhost:5173')
      expect(mainWindow.loadFile).not.toHaveBeenCalled()

      mainWindow.triggerReadyToShow()
      expect(mainWindow.show).toHaveBeenCalledTimes(1)

      const activateHandler = harness.listeners.get('activate')
      expect(activateHandler).toBeTypeOf('function')

      harness.setVisibleWindows([])
      activateHandler?.()
      expect(harness.instances).toHaveLength(2)

      harness.setVisibleWindows([harness.instances[0]])
      activateHandler?.()
      expect(harness.instances).toHaveLength(2)

      const closeHandler = harness.listeners.get('window-all-closed')
      closeHandler?.()
      expect(harness.appMock.quit).toHaveBeenCalledTimes(1)
    } finally {
      harness.restore()
    }
  })

  it('loads local renderer html and keeps app open on darwin close event', async () => {
    const harness = await loadMainModule({ platform: 'darwin' })

    try {
      expect(harness.instances).toHaveLength(1)

      const mainWindow = harness.instances[0]
      expect(mainWindow.loadURL).not.toHaveBeenCalled()
      expect(mainWindow.loadFile).toHaveBeenCalledTimes(1)
      expect(mainWindow.loadFile.mock.calls[0]?.[0]).toMatch(/renderer[\\/]+index\.html$/)

      const closeHandler = harness.listeners.get('window-all-closed')
      closeHandler?.()
      expect(harness.appMock.quit).not.toHaveBeenCalled()
    } finally {
      harness.restore()
    }
  })

  it('logs startup failures and quits when whenReady rejects', async () => {
    const startupError = new Error('boom')
    const harness = await loadMainModule({
      whenReadyReject: startupError,
      platform: 'linux'
    })

    try {
      expect(harness.registerIpcHandlers).not.toHaveBeenCalled()
      expect(harness.instances).toHaveLength(0)
      expect(harness.consoleErrorSpy).toHaveBeenCalledWith('Kata desktop failed to start:', startupError)
      expect(harness.appMock.quit).toHaveBeenCalledTimes(1)
    } finally {
      harness.restore()
    }
  })
})
