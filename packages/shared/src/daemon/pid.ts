/**
 * PID File Management
 *
 * Utilities for writing, reading, and cleaning up the daemon PID file.
 * Used to detect stale daemon processes on app startup.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Get the path to the daemon PID file.
 */
export function getPidFilePath(configDir: string): string {
  return join(configDir, 'daemon.pid');
}

/**
 * Write the daemon's PID to the PID file.
 */
export function writePidFile(configDir: string, pid: number): void {
  writeFileSync(getPidFilePath(configDir), String(pid));
}

/**
 * Remove the PID file if it exists. Ignores ENOENT (already gone).
 */
export function removePidFile(configDir: string): void {
  try {
    unlinkSync(getPidFilePath(configDir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[daemon] Failed to remove PID file:`, err);
    }
  }
}

/**
 * Detect and clean up a stale daemon process from a previous run.
 *
 * If a PID file exists:
 * 1. Read and parse the PID
 * 2. If the process is still running, send SIGTERM
 * 3. Remove the PID file in all cases
 */
export function cleanupStaleDaemon(configDir: string): void {
  const pidPath = getPidFilePath(configDir);
  if (!existsSync(pidPath)) return;

  let raw: string;
  try {
    raw = readFileSync(pidPath, 'utf-8').trim();
  } catch {
    // Can't read the file; remove it
    removePidFile(configDir);
    return;
  }

  const pid = parseInt(raw, 10);
  if (isNaN(pid)) {
    removePidFile(configDir);
    return;
  }

  try {
    // Check if process exists (signal 0 doesn't kill, just checks)
    process.kill(pid, 0);
    // Process exists, kill it
    process.kill(pid, 'SIGTERM');
    process.stderr.write(`[daemon] Killed stale daemon process ${pid}\n`);
  } catch {
    // Process doesn't exist, stale PID file
  }

  removePidFile(configDir);
}
