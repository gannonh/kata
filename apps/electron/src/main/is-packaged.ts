/**
 * Reliable packaged app detection
 *
 * Electron's `app.isPackaged` can incorrectly return `false` when `asar: false`
 * is set in electron-builder config. This utility provides a more reliable check
 * by examining the executable path to determine if we're in a packaged app.
 *
 * Detection methods:
 * - macOS: Check if running from inside a .app bundle (path contains '.app/Contents/')
 * - Windows: Check if running from Program Files or AppData install locations
 * - Linux: Check if running from /usr, /opt, or AppImage mount point
 * - Fallback: Use Electron's app.isPackaged
 *
 * IMPORTANT: This check uses process.execPath which is available immediately,
 * NOT app.getAppPath() which may return incorrect values before app.whenReady().
 */

import { app } from 'electron'

// Cache the result after first evaluation
let _isPackaged: boolean | null = null

/**
 * Returns true if the app is running as a packaged distribution,
 * false if running from source (development).
 *
 * More reliable than `app.isPackaged` when `asar: false` is set.
 * Uses process.execPath for early detection (available before app.whenReady).
 */
export function isPackagedApp(): boolean {
  // Return cached result if available
  if (_isPackaged !== null) {
    return _isPackaged
  }

  // First, trust app.isPackaged if it says true
  if (app.isPackaged) {
    _isPackaged = true
    return true
  }

  // app.isPackaged returned false - do additional checks using process.execPath
  // (process.execPath is reliable before app.whenReady, unlike app.getAppPath)
  const execPath = process.execPath.toLowerCase()

  // macOS: Check if inside a .app bundle, BUT not if it's the development
  // Electron binary in node_modules (which also lives inside Electron.app)
  if (process.platform === 'darwin') {
    if (execPath.includes('.app/contents/') && !execPath.includes('node_modules')) {
      _isPackaged = true
      return true
    }
  }

  // Windows: Check common install locations
  if (process.platform === 'win32') {
    const isInProgramFiles = execPath.includes('program files') ||
                             execPath.includes('programfiles') ||
                             execPath.includes('appdata\\local\\programs')
    if (isInProgramFiles) {
      _isPackaged = true
      return true
    }
  }

  // Linux: Check common install locations and AppImage
  if (process.platform === 'linux') {
    const isInstalled = execPath.startsWith('/usr/') ||
                        execPath.startsWith('/opt/') ||
                        execPath.includes('/tmp/.mount_') || // AppImage mount point
                        process.env.APPIMAGE !== undefined
    if (isInstalled) {
      _isPackaged = true
      return true
    }
  }

  // Check if we're NOT in a node_modules directory (strong indicator of packaged app)
  // Development typically runs from within node_modules (electron binary)
  if (!execPath.includes('node_modules')) {
    // Additional check: make sure we're not just running `electron .` from project root
    // by checking if the executable path looks like a real install location
    if (!execPath.includes('/dev/') && !execPath.includes('\\dev\\')) {
      _isPackaged = true
      return true
    }
  }

  // Fall back to Electron's detection
  _isPackaged = app.isPackaged
  return _isPackaged
}

/**
 * Debug mode is enabled when running from source or with --debug flag.
 * Uses the reliable isPackagedApp() instead of app.isPackaged.
 */
export const isDebugMode = !isPackagedApp() || process.argv.includes('--debug')
