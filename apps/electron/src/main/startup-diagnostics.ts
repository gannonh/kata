/**
 * Startup Diagnostics
 *
 * TEMPORARY diagnostic module to debug production issues.
 * Writes to ~/.kata-agents/startup-debug.log on EVERY launch,
 * regardless of debug mode.
 *
 * This helps diagnose issues where production builds behave
 * differently from local development builds.
 *
 * TODO: Remove this file once production issues are resolved.
 */

import { app } from 'electron'
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const DEBUG_LOG_PATH = join(homedir(), '.kata-agents', 'startup-debug.log')

function ensureLogDir(): void {
  const dir = join(homedir(), '.kata-agents')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function writeLog(message: string): void {
  try {
    ensureLogDir()
    const line = `[${formatTimestamp()}] ${message}\n`
    appendFileSync(DEBUG_LOG_PATH, line)
  } catch {
    // Silently fail - we don't want diagnostics to crash the app
  }
}

/**
 * Log startup diagnostic info.
 * Call this as early as possible in the main process.
 */
export function logStartupDiagnostics(): void {
  try {
    ensureLogDir()
    // Start fresh log on each launch
    writeFileSync(DEBUG_LOG_PATH, `=== Kata Agents Startup Diagnostics ===\n`)
    writeFileSync(DEBUG_LOG_PATH, `Timestamp: ${formatTimestamp()}\n`)
    writeFileSync(DEBUG_LOG_PATH, `App Version: ${app.getVersion()}\n`)
    writeFileSync(DEBUG_LOG_PATH, `Platform: ${process.platform}\n`)
    writeFileSync(DEBUG_LOG_PATH, `Arch: ${process.arch}\n`)
    writeFileSync(DEBUG_LOG_PATH, `\n=== Path Detection ===\n`)
    writeFileSync(DEBUG_LOG_PATH, `process.execPath: ${process.execPath}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `app.isPackaged (Electron): ${app.isPackaged}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `app.getAppPath(): ${app.getAppPath()}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `__dirname: ${__dirname}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `process.cwd(): ${process.cwd()}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `process.resourcesPath: ${process.resourcesPath}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `\n=== Detection Logic ===\n`, { flag: 'a' })

    // Replicate the detection logic to show what's happening
    const execPath = process.execPath.toLowerCase()
    writeFileSync(DEBUG_LOG_PATH, `execPath.toLowerCase(): ${execPath}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `execPath.includes('.app/contents/'): ${execPath.includes('.app/contents/')}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `execPath.includes('node_modules'): ${execPath.includes('node_modules')}\n`, { flag: 'a' })
    writeFileSync(DEBUG_LOG_PATH, `execPath.includes('/dev/'): ${execPath.includes('/dev/')}\n`, { flag: 'a' })

  } catch (error) {
    // Silently fail
  }
}

/**
 * Log isPackagedApp result after it's been evaluated.
 */
export function logIsPackagedResult(isPackaged: boolean, isDebugMode: boolean): void {
  writeLog(`isPackagedApp() returned: ${isPackaged}`)
  writeLog(`isDebugMode: ${isDebugMode}`)
}

/**
 * Log workspace and session info after SessionManager initializes.
 */
export function logSessionDiagnostics(
  workspaces: Array<{ id: string; name: string; rootPath: string }>,
  sessionCount: number,
  sessionWorkspaceIds: Array<{ sessionId: string; workspaceId: string }>
): void {
  writeLog(`\n=== Workspaces ===`)
  for (const ws of workspaces) {
    writeLog(`  Workspace: id=${ws.id}, name="${ws.name}", rootPath=${ws.rootPath}`)
  }
  writeLog(`\n=== Sessions ===`)
  writeLog(`Total sessions loaded: ${sessionCount}`)
  writeLog(`Session workspaceId mapping (first 10):`)
  for (const s of sessionWorkspaceIds.slice(0, 10)) {
    writeLog(`  Session ${s.sessionId} -> workspaceId: ${s.workspaceId}`)
  }
}

/**
 * Log IPC call from renderer requesting sessions.
 */
export function logGetSessionsCall(
  callerWorkspaceId: string | undefined,
  returnedSessionCount: number
): void {
  writeLog(`\n=== IPC: getSessions called ===`)
  writeLog(`  Caller's workspaceId (from renderer): ${callerWorkspaceId ?? 'undefined'}`)
  writeLog(`  Sessions returned: ${returnedSessionCount}`)
}

/**
 * Log any error that occurs.
 */
export function logError(context: string, error: unknown): void {
  writeLog(`\n=== ERROR: ${context} ===`)
  writeLog(`  ${error instanceof Error ? error.message : String(error)}`)
  if (error instanceof Error && error.stack) {
    writeLog(`  Stack: ${error.stack.split('\n').slice(0, 3).join(' | ')}`)
  }
}

/**
 * Log a generic message.
 */
export function logDiagnostic(message: string): void {
  writeLog(message)
}
