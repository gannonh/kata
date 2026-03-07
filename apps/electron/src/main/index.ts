// Load user's shell environment first (before other imports that may use env)
// This ensures tools like Homebrew, nvm, etc. are available to the agent
import { loadShellEnv } from './shell-env'
loadShellEnv()

// DIAGNOSTIC: Log startup info on every launch (even production)
// This writes to ~/.kata-agents/startup-debug.log
// TODO: Remove once production issues are resolved
import { logStartupDiagnostics, logIsPackagedResult, logDiagnostic } from './startup-diagnostics'
logStartupDiagnostics()

import { app, BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import { hostname, homedir } from 'os'
import * as Sentry from '@sentry/electron/main'
import { isPackagedApp } from './is-packaged'

// Initialize Sentry error tracking as early as possible after app import.
// Only enabled in production (packaged) builds to avoid noise during development.
// DSN is baked in at build time via esbuild --define (same pattern as OAuth secrets).
//
// NOTE: Source map upload is intentionally disabled. Stack traces in Sentry will show
// bundled/minified code. To enable source map upload in the future:
//   1. Add SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT to CI secrets
//   2. Re-enable the @sentry/vite-plugin in vite.config.ts (handles renderer maps)
//   3. Add @sentry/esbuild-plugin to scripts/electron-build-main.ts (handles main process maps)
Sentry.init({
  dsn: process.env.SENTRY_ELECTRON_INGEST_URL,
  environment: isPackagedApp() ? 'production' : 'development',
  release: app.getVersion(),
  // Enabled whenever the ingest URL is available — works in both production (baked via CI)
  // and development (injected via .env / 1Password). Filter by environment in Sentry dashboard.
  enabled: !!process.env.SENTRY_ELECTRON_INGEST_URL,

  // Scrub sensitive data before sending to Sentry.
  // Removes authorization headers, API keys/tokens, and credential-like values.
  beforeSend(event) {
    // Scrub request headers (authorization, cookies)
    if (event.request?.headers) {
      const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key']
      for (const header of sensitiveHeaders) {
        if (event.request.headers[header]) {
          event.request.headers[header] = '[REDACTED]'
        }
      }
    }

    // Scrub breadcrumb data that may contain sensitive values
    if (event.breadcrumbs) {
      for (const breadcrumb of event.breadcrumbs) {
        if (breadcrumb.data) {
          for (const key of Object.keys(breadcrumb.data)) {
            const lowerKey = key.toLowerCase()
            if (lowerKey.includes('token') || lowerKey.includes('key') ||
                lowerKey.includes('secret') || lowerKey.includes('password') ||
                lowerKey.includes('credential') || lowerKey.includes('auth')) {
              breadcrumb.data[key] = '[REDACTED]'
            }
          }
        }
      }
    }

    return event
  },
})

// Set anonymous machine ID for Sentry user tracking (no PII — just a hash).
// Uses hostname + homedir to produce a stable per-machine identifier.
const machineId = createHash('sha256').update(hostname() + homedir()).digest('hex').slice(0, 16)
Sentry.setUser({ id: machineId })

import { join } from 'path'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { SessionManager } from './sessions'
import { DaemonManager } from './daemon-manager'
import { deliverChannelConfigs } from './channel-config-delivery'
import { TrayManager } from './tray-manager'
import { registerIpcHandlers } from './ipc'
import { createApplicationMenu } from './menu'
import { WindowManager } from './window-manager'
import { loadWindowState, saveWindowState } from './window-state'
import { getWorkspaces, getWorkspaceByNameOrId, loadStoredConfig } from '@craft-agent/shared/config'
import { getCredentialManager } from '@craft-agent/shared/credentials'
import { initializeDocs } from '@craft-agent/shared/docs'
import { ensureDefaultPermissions } from '@craft-agent/shared/agent/permissions-config'
import { ensureToolIcons } from '@craft-agent/shared/config'
import { setBundledAssetsRoot } from '@craft-agent/shared/utils'
import { IPC_CHANNELS } from '../shared/types'
import { handleDeepLink } from './deep-link'
import { registerThumbnailScheme, registerThumbnailHandler } from './thumbnail-protocol'
import log, { isDebugMode, mainLog, getLogFilePath } from './logger'
import { setPerfEnabled, enableDebug } from '@craft-agent/shared/utils'
import { initNotificationService, clearBadgeCount, initBadgeIcon, initInstanceBadge } from './notifications'
import { checkForUpdatesOnLaunch, setWindowManager as setAutoUpdateWindowManager, isUpdating } from './auto-update'

// Initialize electron-log for renderer process support
log.initialize()

// Enable debug/perf in dev mode (running from source)
// CRAFT_DEBUG is set for subprocess propagation (see agent/options.ts)
if (isDebugMode) {
  process.env.CRAFT_DEBUG = '1'
  enableDebug()
  setPerfEnabled(true)
}

// DIAGNOSTIC: Log the isPackaged detection result
logIsPackagedResult(isPackagedApp(), isDebugMode)

// Custom URL scheme for deeplinks (e.g., kata://auth-complete)
// Supports both KATA_ and legacy CRAFT_ env vars for migration
const DEEPLINK_SCHEME = process.env.KATA_DEEPLINK_SCHEME || process.env.CRAFT_DEEPLINK_SCHEME || 'kata'

let windowManager: WindowManager | null = null
let sessionManager: SessionManager | null = null
let daemonManager: DaemonManager | null = null
let trayManager: TrayManager | null = null

// Store pending deep link if app not ready yet (cold start)
let pendingDeepLink: string | null = null

// Set app name early (before app.whenReady) to ensure correct macOS menu bar title
// Supports both KATA_ and legacy CRAFT_ env vars for migration
app.setName(process.env.KATA_APP_NAME || process.env.CRAFT_APP_NAME || 'Kata Agents')

// Register as default protocol client for craftagents:// URLs
// This must be done before app.whenReady() on some platforms
if (process.defaultApp) {
  // Development mode: need to pass the app path
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEPLINK_SCHEME, process.execPath, [process.argv[1]])
  }
} else {
  // Production mode
  app.setAsDefaultProtocolClient(DEEPLINK_SCHEME)
}

// Register thumbnail:// custom protocol for file preview thumbnails in the sidebar.
// Must happen before app.whenReady() — Electron requires early scheme registration.
registerThumbnailScheme()

// Handle deeplink on macOS (when app is already running)
app.on('open-url', (event, url) => {
  event.preventDefault()
  mainLog.info('Received deeplink:', url)

  if (windowManager) {
    handleDeepLink(url, windowManager).catch(err => {
      mainLog.error('Failed to handle deep link:', err)
    })
  } else {
    // App not ready - store for later
    pendingDeepLink = url
  }
})

// Handle deeplink on Windows/Linux (single instance check)
// Skip single-instance lock when KATA_CONFIG_DIR is set (multi-instance/test mode)
// This allows multiple instances to run with different config directories
const isMultiInstanceMode = !!process.env.KATA_CONFIG_DIR
const gotTheLock = isMultiInstanceMode ? true : app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine, _workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    // On Windows/Linux, the deeplink is in commandLine
    const url = commandLine.find(arg => arg.startsWith(`${DEEPLINK_SCHEME}://`))
    if (url && windowManager) {
      mainLog.info('Received deeplink from second instance:', url)
      handleDeepLink(url, windowManager).catch(err => {
        mainLog.error('Failed to handle deep link:', err)
      })
    } else if (windowManager) {
      // No deep link - just focus the first window
      const windows = windowManager.getAllWindows()
      if (windows.length > 0) {
        const win = windows[0].window
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    }
  })
}

// Helper to create initial windows on startup
async function createInitialWindows(): Promise<void> {
  if (!windowManager) return

  // Load saved window state
  const savedState = loadWindowState()
  const workspaces = getWorkspaces()
  const validWorkspaceIds = workspaces.map(ws => ws.id)

  if (workspaces.length === 0) {
    // No workspaces configured - create window without workspace (will show onboarding)
    windowManager.createWindow({ workspaceId: '' })
    return
  }

  if (savedState?.windows.length) {
    // Restore windows from saved state
    let restoredCount = 0

    for (const saved of savedState.windows) {
      // Extract workspaceId from URL if available (more reliable than saved.workspaceId
      // which can become stale if user switches workspaces and the state isn't saved properly)
      let workspaceId = saved.workspaceId
      if (saved.url) {
        try {
          const url = new URL(saved.url)
          const urlWorkspaceId = url.searchParams.get('workspaceId')
          if (urlWorkspaceId && validWorkspaceIds.includes(urlWorkspaceId)) {
            workspaceId = urlWorkspaceId
          }
        } catch {
          // URL parsing failed, use saved.workspaceId
        }
      }

      // Skip invalid workspaces
      if (!validWorkspaceIds.includes(workspaceId)) continue

      // Restore main window with focused mode if it was saved
      mainLog.info(`Restoring window: workspaceId=${workspaceId}, focused=${saved.focused ?? false}, url=${saved.url ?? 'none'}`)
      const win = windowManager.createWindow({
        workspaceId,
        focused: saved.focused,
        restoreUrl: saved.url,
      })
      win.setBounds(saved.bounds)

      restoredCount++
    }

    if (restoredCount > 0) {
      mainLog.info(`Restored ${restoredCount} window(s) from saved state`)
      return
    }
  }

  // Default: open window for active workspace (from config), fallback to first
  const config = loadStoredConfig()
  const activeWsId = config?.activeWorkspaceId
  const targetWorkspace = workspaces.find(ws => ws.id === activeWsId) ?? workspaces[0]
  windowManager.createWindow({ workspaceId: targetWorkspace.id })
  mainLog.info(`Created window for workspace: ${targetWorkspace.name}`)
}

app.whenReady().then(async () => {
  logDiagnostic('\n=== app.whenReady() started ===')

  // Register bundled assets root so all seeding functions can find their files
  // (docs, permissions, themes, tool-icons resolve via getBundledAssetsDir)
  setBundledAssetsRoot(__dirname)
  logDiagnostic('setBundledAssetsRoot done')

  // Initialize bundled docs
  logDiagnostic('initializeDocs starting...')
  initializeDocs()
  logDiagnostic('initializeDocs done')

  // Ensure default permissions file exists (copies bundled default.json on first run)
  logDiagnostic('ensureDefaultPermissions starting...')
  ensureDefaultPermissions()
  logDiagnostic('ensureDefaultPermissions done')

  // Seed tool icons to ~/.kata-agents/tool-icons/ (copies bundled SVGs on first run)
  logDiagnostic('ensureToolIcons starting...')
  ensureToolIcons()
  logDiagnostic('ensureToolIcons done')

  // Register thumbnail:// protocol handler (scheme was registered earlier, before app.whenReady)
  logDiagnostic('registerThumbnailHandler starting...')
  registerThumbnailHandler()
  logDiagnostic('registerThumbnailHandler done')

  // Note: electron-updater handles pending updates internally via autoInstallOnAppQuit

  // Application menu is created after windowManager initialization (see below)

  // Set dock icon on macOS (required for dev mode, bundled apps use Info.plist)
  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = join(__dirname, '../resources/icon.png')
    if (existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath)
      // Initialize badge icon for canvas-based badge overlay
      initBadgeIcon(dockIconPath)
    }

    // Multi-instance dev: show instance number badge on dock icon
    // CRAFT_INSTANCE_NUMBER is set by detect-instance.sh for numbered folders
    const instanceNum = process.env.CRAFT_INSTANCE_NUMBER
    if (instanceNum) {
      const num = parseInt(instanceNum, 10)
      if (!isNaN(num) && num > 0) {
        initInstanceBadge(num)
      }
    }
  }

  try {
    // Initialize window manager
    logDiagnostic('Creating WindowManager...')
    windowManager = new WindowManager()
    logDiagnostic('WindowManager created')

    // Create the application menu (needs windowManager for New Window action)
    logDiagnostic('Creating application menu...')
    createApplicationMenu(windowManager)
    logDiagnostic('Application menu created')

    // Initialize session manager
    logDiagnostic('Creating SessionManager...')
    sessionManager = new SessionManager()
    logDiagnostic('SessionManager created')
    sessionManager.setWindowManager(windowManager)
    logDiagnostic('WindowManager set on SessionManager')

    // Resolve the adapter type (e.g. "slack") from a channel's config.json on disk.
    // The daemon sends the channel slug (e.g. "slack-kata-agent") as channelId, but
    // the renderer needs the adapter type to look up the correct icon.
    const adapterTypeCache = new Map<string, string>()
    async function resolveAdapterType(workspaceId: string, channelSlug: string): Promise<string> {
      const cacheKey = `${workspaceId}:${channelSlug}`
      const cached = adapterTypeCache.get(cacheKey)
      if (cached) return cached

      try {
        const workspace = getWorkspaceByNameOrId(workspaceId)
        if (!workspace) return channelSlug

        const rootPath = workspace.rootPath.replace(/^~/, homedir())
        const configPath = join(rootPath, 'channels', channelSlug, 'config.json')
        if (!existsSync(configPath)) return channelSlug

        const raw = await readFile(configPath, 'utf-8')
        const config = JSON.parse(raw)
        const adapterType = config.adapter || channelSlug
        adapterTypeCache.set(cacheKey, adapterType)
        return adapterType
      } catch (err) {
        mainLog.error(`[resolveAdapterType] Failed for ${channelSlug}:`, err)
        return channelSlug
      }
    }

    // Initialize daemon manager (does not auto-start; Phase 12+ triggers start)
    logDiagnostic('Creating DaemonManager...')
    const configDir = process.env.KATA_CONFIG_DIR || process.env.CRAFT_CONFIG_DIR || join(homedir(), '.kata-agents')
    const daemonScript = join(__dirname, '../../../packages/shared/src/daemon/entry.ts')
    daemonManager = new DaemonManager(
      'bun',
      daemonScript,
      configDir,
      (event) => {
        mainLog.info('[daemon] event:', event.type)
        if (event.type === 'plugin_error') {
          mainLog.error(`[daemon] Plugin error - ${event.pluginId}: ${event.error}`)
        }

        // Handle process_message internally (daemon -> main -> daemon round-trip)
        if (event.type === 'process_message' && sessionManager && daemonManager) {
          // Capture reference before async gap to avoid stale non-null assertion
          const dm = daemonManager
          resolveAdapterType(event.workspaceId, event.channelId).then((adapter) =>
            sessionManager!.processDaemonMessage(
              event.workspaceId,
              event.sessionKey,
              event.content,
              { adapter, slug: event.channelId },
            ),
          ).then((response) => {
            dm.sendCommand({
              type: 'message_processed',
              messageId: event.messageId,
              response,
              success: true,
            })
          }).catch((err) => {
            mainLog.error('[daemon] Message processing error:', err)
            dm.sendCommand({
              type: 'message_processed',
              messageId: event.messageId,
              response: '',
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          })
          return // Don't broadcast internal events to renderer
        }

        // Broadcast other events to renderer windows
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.DAEMON_EVENT, event)
        }
        if (event.type === 'status_changed' && event.status === 'running' && daemonManager) {
          deliverChannelConfigs(daemonManager, getCredentialManager).catch((err) => {
            mainLog.error('[daemon] Failed to deliver channel configs:', err)
          })
        }
      },
      (state) => {
        mainLog.info('[daemon] state:', state)
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.DAEMON_STATE_CHANGED, state)
        }
        trayManager?.updateState(state)
      },
    )
    logDiagnostic('DaemonManager created')

    // Initialize system tray icon (provides background access when windows are closed)
    logDiagnostic('Creating TrayManager...')
    const resourcesDir = join(__dirname, '../resources')
    trayManager = new TrayManager(
      resourcesDir,
      () => {
        // Show window callback: focus existing or create new
        if (windowManager?.hasWindows()) {
          const windows = windowManager.getAllWindows()
          if (windows.length > 0) {
            const win = windows[0].window
            if (win.isMinimized()) win.restore()
            win.show()
            win.focus()
          }
        } else if (windowManager) {
          const workspaces = getWorkspaces()
          if (workspaces.length > 0) {
            windowManager.createWindow({ workspaceId: workspaces[0].id })
          }
        }
      },
      async () => {
        // Start daemon callback
        if (daemonManager) {
          await daemonManager.start()
        }
      },
      async () => {
        // Stop daemon callback
        if (daemonManager) {
          await daemonManager.stop()
        }
      },
    )
    trayManager.create()
    logDiagnostic('TrayManager created')

    // Initialize notification service
    logDiagnostic('Initializing notification service...')
    initNotificationService(windowManager)
    logDiagnostic('Notification service initialized')

    // Register IPC handlers (must happen before window creation)
    logDiagnostic('Registering IPC handlers...')
    registerIpcHandlers(sessionManager, windowManager, daemonManager)
    logDiagnostic('IPC handlers registered')

    // Create initial windows (restores from saved state or opens first workspace)
    logDiagnostic('Creating initial windows...')
    await createInitialWindows()
    logDiagnostic('Initial windows created')

    // Initialize auth (must happen after window creation for error reporting)
    logDiagnostic('Initializing SessionManager (auth)...')
    await sessionManager.initialize()
    logDiagnostic('SessionManager initialized')

    // Set Sentry context tags for error grouping (no PII — just config classification).
    // Runs after init so config and auth state are available.
    try {
      const config = loadStoredConfig()
      const workspaces = getWorkspaces()
      Sentry.setTag('authType', config?.authType ?? 'unknown')
      Sentry.setTag('hasCustomEndpoint', String(!!config?.anthropicBaseUrl))
      Sentry.setTag('model', config?.model ?? 'default')
      Sentry.setTag('customModel', config?.customModel ?? 'none')
      Sentry.setTag('workspaceCount', String(workspaces.length))
    } catch (err) {
      mainLog.warn('Failed to set Sentry context tags:', err)
    }

    // Initialize auto-update (check immediately on launch)
    // Skip in dev mode to avoid replacing /Applications app and launching it instead
    setAutoUpdateWindowManager(windowManager)
    if (isPackagedApp()) {
      checkForUpdatesOnLaunch().catch(err => {
        mainLog.error('[auto-update] Launch check failed:', err)
      })
    } else {
      mainLog.info('[auto-update] Skipping auto-update in dev mode')
    }

    // Process pending deep link from cold start
    if (pendingDeepLink) {
      mainLog.info('Processing pending deep link:', pendingDeepLink)
      await handleDeepLink(pendingDeepLink, windowManager)
      pendingDeepLink = null
    }

    mainLog.info('App initialized successfully')
    if (isDebugMode) {
      mainLog.info('Debug mode enabled - logs at:', getLogFilePath())
    }
  } catch (error) {
    mainLog.error('Failed to initialize app:', error)
    // Continue anyway - the app will show errors in the UI
  }

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (!windowManager?.hasWindows()) {
      // Open first workspace or last focused
      const workspaces = getWorkspaces()
      if (workspaces.length > 0 && windowManager) {
        const savedState = loadWindowState()
        const wsId = savedState?.lastFocusedWorkspaceId || workspaces[0].id
        // Verify workspace still exists
        if (workspaces.some(ws => ws.id === wsId)) {
          windowManager.createWindow({ workspaceId: wsId })
        } else {
          windowManager.createWindow({ workspaceId: workspaces[0].id })
        }
      }
    }
  })
})

app.on('window-all-closed', () => {
  // Keep app alive when daemon is running (tray provides access)
  const daemonRunning = daemonManager?.getState() === 'running'
  if (process.platform === 'darwin' || daemonRunning) {
    return // Stay alive: macOS convention or daemon needs to keep running
  }
  app.quit()
})

// Track if we're in the process of quitting (to avoid re-entry)
let isQuitting = false

// Save window state and clean up resources before quitting
app.on('before-quit', async (event) => {
  // Avoid re-entry when we call app.exit()
  if (isQuitting) return
  isQuitting = true

  if (windowManager) {
    // Get full window states (includes bounds, type, and query)
    const windows = windowManager.getWindowStates()
    // Get the focused window's workspace as last focused
    const focusedWindow = BrowserWindow.getFocusedWindow()
    let lastFocusedWorkspaceId: string | undefined
    if (focusedWindow) {
      lastFocusedWorkspaceId = windowManager.getWorkspaceForWindow(focusedWindow.webContents.id) ?? undefined
    }

    saveWindowState({
      windows,
      lastFocusedWorkspaceId,
    })
    mainLog.info('Saved window state:', windows.length, 'windows')
  }

  // Flush all pending session writes before quitting
  if (sessionManager) {
    // Prevent quit until sessions are flushed
    event.preventDefault()
    try {
      await sessionManager.flushAllSessions()
      mainLog.info('Flushed all pending session writes')
    } catch (error) {
      mainLog.error('Failed to flush sessions:', error)
    }
    // Clean up SessionManager resources (file watchers, timers, etc.)
    sessionManager.cleanup()

    // Stop daemon subprocess
    if (daemonManager) {
      try {
        await daemonManager.stop()
        mainLog.info('Daemon stopped')
      } catch (error) {
        mainLog.error('Failed to stop daemon:', error)
      }
    }

    // Destroy tray icon
    if (trayManager) {
      trayManager.destroy()
      trayManager = null
    }

    // If update is in progress, let electron-updater handle the quit flow
    // Force exit breaks the NSIS installer on Windows
    if (isUpdating()) {
      mainLog.info('Update in progress, letting electron-updater handle quit')
      app.quit()
      return
    }

    // Now actually quit
    app.exit(0)
  }
})

// Handle uncaught exceptions — forward to Sentry explicitly since registering
// a custom handler can interfere with @sentry/electron's automatic capture.
process.on('uncaughtException', (error) => {
  mainLog.error('Uncaught exception:', error)
  Sentry.captureException(error)
})

process.on('unhandledRejection', (reason, promise) => {
  mainLog.error('Unhandled rejection at:', promise, 'reason:', reason)
  Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)))
})
