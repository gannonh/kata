/**
 * DaemonManager
 *
 * Spawns and supervises the daemon as a Bun subprocess. Handles bidirectional
 * JSON-lines communication, crash recovery with exponential backoff, and
 * graceful shutdown during Electron lifecycle.
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import type { DaemonCommand, DaemonEvent } from '@craft-agent/core/types';

function createLineParser(
  onLine: (line: string) => void,
): { push: (chunk: string) => void; reset: () => void } {
  let buffer = '';

  return {
    push: (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          onLine(line);
        }
        newlineIndex = buffer.indexOf('\n');
      }
    },
    reset: () => {
      buffer = '';
    },
  };
}

function cleanupStaleDaemon(configDir: string): void {
  const pidFile = join(configDir, 'daemon.pid');
  if (!existsSync(pidFile)) {
    return;
  }

  try {
    const rawPid = readFileSync(pidFile, 'utf8').trim();
    if (!/^\d+$/.test(rawPid)) {
      rmSync(pidFile, { force: true });
      return;
    }

    const pid = Number(rawPid);
    if (!Number.isInteger(pid) || pid <= 0) {
      rmSync(pidFile, { force: true });
      return;
    }

    try {
      process.kill(pid, 0);
      // Process is still alive; keep pid file.
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ESRCH') {
        // Process no longer exists; remove stale pid file.
        rmSync(pidFile, { force: true });
        return;
      }

      // EPERM or unknown errors mean we cannot safely treat this pid as stale.
      return;
    }
  } catch {
    rmSync(pidFile, { force: true });
  }
}

/** Manager-level state (superset of daemon status) */
export type DaemonManagerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'paused';

export class DaemonManager {
  private process: ChildProcess | null = null;
  private state: DaemonManagerState = 'stopped';
  private lineParser: { push: (chunk: string) => void; reset: () => void };
  private consecutiveFailures = 0;
  private lastStartTime = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopPromise: Promise<void> | null = null;
  private stopResolve: (() => void) | null = null;

  private static readonly BASE_DELAY_MS = 1000;
  private static readonly MAX_DELAY_MS = 30_000;
  private static readonly MAX_CONSECUTIVE_FAILURES = 5;
  private static readonly STABILITY_THRESHOLD_MS = 60_000;
  private static readonly GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000;

  constructor(
    private readonly bunPath: string,
    private readonly daemonScript: string,
    private readonly configDir: string,
    private readonly onEvent: (event: DaemonEvent) => void,
    private readonly onStateChange: (state: DaemonManagerState) => void,
  ) {
    this.lineParser = createLineParser((line) => this.handleEvent(line));
  }

  /**
   * Start the daemon subprocess. Idempotent if already running or starting.
   * If currently stopping, waits for stop to complete before starting.
   */
  async start(): Promise<void> {
    if (this.state === 'stopping' && this.stopPromise) {
      await this.stopPromise;
    }
    if (this.state === 'running' || this.state === 'starting') {
      return;
    }

    cleanupStaleDaemon(this.configDir);
    this.lineParser.reset();
    this.setState('starting');
    this.lastStartTime = Date.now();

    try {
      this.process = spawn(this.bunPath, ['run', this.daemonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, KATA_CONFIG_DIR: this.configDir },
      });
    } catch (err) {
      console.error('[daemon-manager] Failed to spawn daemon process:', err);
      this.setState('error');
      return;
    }

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.lineParser.push(chunk.toString());
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[daemon] ${chunk.toString().trimEnd()}`);
    });

    this.process.on('error', (err) => {
      console.error('[daemon-manager] Daemon process error:', err);
    });

    this.process.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });

    this.sendCommand({ type: 'start' });
  }

  /**
   * Send a command to the daemon subprocess via stdin.
   */
  sendCommand(cmd: DaemonCommand): void {
    if (!this.process?.stdin?.writable) {
      console.error(`[daemon-manager] Cannot send command '${cmd.type}': stdin not writable`);
      return;
    }
    this.process.stdin.write(JSON.stringify(cmd) + '\n');
  }

  /**
   * Stop the daemon gracefully. Sends a stop command and waits for exit.
   * Falls back to SIGTERM after timeout.
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.cancelPendingRestart();
    this.setState('stopping');

    // No process to stop (e.g. called from 'error' state after crash)
    if (!this.process) {
      this.setState('stopped');
      return;
    }

    this.stopPromise = new Promise<void>((resolve) => {
      this.stopResolve = resolve;
    });

    this.sendCommand({ type: 'stop' });

    const timeout = setTimeout(() => {
      if (this.process) {
        console.error('[daemon] Graceful shutdown timed out, sending SIGTERM');
        this.process.kill('SIGTERM');
      }
    }, DaemonManager.GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    await this.stopPromise;
    clearTimeout(timeout);
  }

  /**
   * Get the current manager state.
   */
  getState(): DaemonManagerState {
    return this.state;
  }

  /**
   * Reset failure counter and allow restart from paused state.
   */
  reset(): void {
    this.consecutiveFailures = 0;
    if (this.state === 'paused') {
      this.setState('stopped');
    }
  }

  private setState(state: DaemonManagerState): void {
    this.state = state;
    this.onStateChange(state);
  }

  private handleEvent(line: string): void {
    let event: DaemonEvent;
    try {
      event = JSON.parse(line) as DaemonEvent;
    } catch {
      console.error(`[daemon-manager] Failed to parse daemon event: ${line}`);
      return;
    }

    if (event.type === 'status_changed' && event.status === 'running') {
      this.setState('running');
      // If the daemon has been running long enough, reset failures
      if (Date.now() - this.lastStartTime > DaemonManager.STABILITY_THRESHOLD_MS) {
        this.consecutiveFailures = 0;
      }
    }

    this.onEvent(event);
  }

  private handleExit(code: number | null, signal: string | null): void {
    this.process = null;
    this.lineParser.reset();

    // Expected shutdown
    if (this.state === 'stopping') {
      this.setState('stopped');
      this.stopResolve?.();
      this.stopPromise = null;
      this.stopResolve = null;
      return;
    }

    // Unexpected exit: evaluate restart
    const uptime = Date.now() - this.lastStartTime;
    if (uptime > DaemonManager.STABILITY_THRESHOLD_MS) {
      this.consecutiveFailures = 0;
    }

    this.consecutiveFailures++;

    if (this.consecutiveFailures > DaemonManager.MAX_CONSECUTIVE_FAILURES) {
      console.error(
        `[daemon-manager] Paused after ${this.consecutiveFailures} consecutive failures`,
      );
      this.setState('paused');
      return;
    }

    const delay = Math.min(
      DaemonManager.BASE_DELAY_MS * Math.pow(2, this.consecutiveFailures - 1),
      DaemonManager.MAX_DELAY_MS,
    );

    console.error(
      `[daemon-manager] Exited (code=${code}, signal=${signal}). ` +
        `Restarting in ${delay}ms (attempt ${this.consecutiveFailures}/${DaemonManager.MAX_CONSECUTIVE_FAILURES})`,
    );

    this.setState('error');
    this.restartTimer = setTimeout(() => this.start(), delay);
  }

  private cancelPendingRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
}
