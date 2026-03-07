/**
 * TrayManager
 *
 * Encapsulates Electron Tray lifecycle: icon creation, context menu updates
 * based on daemon state, and cleanup on app quit.
 */

import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import log from './logger'
import type { DaemonManagerState } from '../shared/types'

export class TrayManager {
  private tray: Tray | null = null

  constructor(
    private readonly resourcesDir: string,
    private readonly onShowWindow: () => void,
    private readonly onStartDaemon: () => Promise<void>,
    private readonly onStopDaemon: () => Promise<void>,
  ) {}

  /**
   * Create the system tray icon and initial context menu.
   * Must be called after app.whenReady().
   */
  create(): void {
    const iconPath = join(this.resourcesDir, 'trayIconTemplate.png')
    const icon = nativeImage.createFromPath(iconPath)
    // Resize for macOS menu bar (16x16 recommended)
    const resized = icon.resize({ width: 16, height: 16 })
    // Template images auto-adapt to macOS light/dark menu bar
    if (process.platform === 'darwin') {
      resized.setTemplateImage(true)
    }
    this.tray = new Tray(resized)
    this.tray.setToolTip('Kata Agents')
    this.updateMenu('stopped')
  }

  /**
   * Update the context menu and tooltip when daemon state changes.
   */
  updateState(state: DaemonManagerState): void {
    this.updateMenu(state)
    const label = STATE_LABELS[state] ?? state
    this.tray?.setToolTip(`Kata Agents — Daemon: ${label}`)
  }

  /**
   * Destroy the tray icon. Call during app quit.
   */
  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private updateMenu(state: DaemonManagerState): void {
    const isRunning = state === 'running'
    const isBusy = state === 'starting' || state === 'stopping'
    const label = STATE_LABELS[state] ?? state

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Window',
        click: () => this.onShowWindow(),
      },
      { type: 'separator' },
      {
        label: `Daemon: ${label}`,
        enabled: false,
      },
      {
        label: isRunning ? 'Stop Daemon' : 'Start Daemon',
        enabled: !isBusy,
        click: () => {
          if (isRunning) {
            this.onStopDaemon().catch((err) => log.error('[tray] Failed to stop daemon:', err))
          } else {
            this.onStartDaemon().catch((err) => log.error('[tray] Failed to start daemon:', err))
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ])
    this.tray?.setContextMenu(contextMenu)
  }
}

/** Human-readable labels for each daemon state */
const STATE_LABELS: Record<DaemonManagerState, string> = {
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  error: 'Error',
  paused: 'Paused',
}
