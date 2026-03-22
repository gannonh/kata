/**
 * Kata Session Lock — OS-level exclusive locking for auto-mode sessions.
 *
 * Prevents multiple kata processes from running auto-mode concurrently on
 * the same project. Uses proper-lockfile for OS-level file locking
 * to avoid advisory-lock race conditions.
 *
 * The lock file (.kata-cli/auto.lock) stores JSON metadata for diagnostics,
 * while the actual exclusion is enforced by the OS-level lock.
 */

import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import { atomicWriteSync } from "./atomic-write.js";
import { canonicalizeExistingPath } from "./repo-identity.js";
import { getMainRepoPath } from "./worktree-resolver.js";

const _require = createRequire(
  process.env.PI_PACKAGE_DIR
    ? join(process.env.PI_PACKAGE_DIR, "package.json")
    : import.meta.url,
);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionLockData {
  pid: number;
  startedAt: string;
  unitType: string;
  unitId: string;
  unitStartedAt: string;
  completedUnits: number;
  sessionFile?: string;
}

export type SessionLockResult =
  | { acquired: true }
  | { acquired: false; reason: string; existingPid?: number };

export type SessionLockFailureReason =
  | "compromised"
  | "missing-metadata"
  | "pid-mismatch";

export interface SessionLockStatus {
  valid: boolean;
  failureReason?: SessionLockFailureReason;
  existingPid?: number;
  expectedPid?: number;
  recovered?: boolean;
}

// ─── Module State ───────────────────────────────────────────────────────────

/** Release function from proper-lockfile — calling it releases the OS lock. */
let _releaseFunction: (() => void) | null = null;

/** Canonical base path we currently hold a lock on. */
let _lockedPath: string | null = null;

/** Our PID at lock acquisition time. */
let _lockPid = 0;

/** Set true when proper-lockfile fires onCompromised. */
let _lockCompromised = false;

/** Whether we've registered a process.on("exit") handler already. */
let _exitHandlerRegistered = false;

/** Timestamp when lock was acquired for compromise false-positive suppression. */
let _lockAcquiredAt = 0;

const LOCK_FILE = "auto.lock";
const STALE_WINDOW_MS = 1_800_000; // 30m

function normalizeBasePath(basePath: string): string {
  const canonicalBasePath = canonicalizeExistingPath(basePath);
  try {
    return getMainRepoPath(canonicalBasePath);
  } catch {
    return canonicalBasePath;
  }
}

function kataStateDir(basePath: string): string {
  return join(normalizeBasePath(basePath), ".kata-cli");
}

function lockPath(basePath: string): string {
  return join(kataStateDir(basePath), LOCK_FILE);
}

function clearHeldLockState(): void {
  _lockedPath = null;
  _lockPid = 0;
  _lockCompromised = false;
  _lockAcquiredAt = 0;
}

// ─── Stray Lock Cleanup ─────────────────────────────────────────────────────

/**
 * Remove numbered lock variants from cloud sync conflicts (e.g. auto 2.lock)
 * and stray proper-lockfile directories beyond the canonical `.kata-cli.lock`.
 */
export function cleanupStrayLockFiles(basePath: string): void {
  const stateDir = kataStateDir(basePath);

  // Clean numbered auto lock files inside .kata-cli/
  try {
    if (existsSync(stateDir)) {
      for (const entry of readdirSync(stateDir)) {
        if (entry !== LOCK_FILE && /^auto\s.+\.lock$/i.test(entry)) {
          try {
            unlinkSync(join(stateDir, entry));
          } catch {
            // best-effort cleanup
          }
        }
      }
    }
  } catch {
    // non-fatal
  }

  // Clean stray proper-lockfile directories (e.g. ".kata-cli 2.lock/")
  try {
    const parentDir = dirname(stateDir);
    const stateDirName = basename(stateDir) || ".kata-cli";
    if (existsSync(parentDir)) {
      for (const entry of readdirSync(parentDir)) {
        if (
          entry !== `${stateDirName}.lock`
          && entry.startsWith(stateDirName)
          && entry.endsWith(".lock")
        ) {
          const fullPath = join(parentDir, entry);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              rmSync(fullPath, { recursive: true, force: true });
            }
          } catch {
            // best-effort
          }
        }
      }
    }
  } catch {
    // non-fatal
  }
}

function ensureExitHandler(): void {
  if (_exitHandlerRegistered) return;
  _exitHandlerRegistered = true;

  process.once("exit", () => {
    const heldPath = _lockedPath;
    if (!heldPath) return;

    const stateDir = kataStateDir(heldPath);
    const lp = lockPath(heldPath);

    try {
      if (_releaseFunction) {
        _releaseFunction();
        _releaseFunction = null;
      }
    } catch {
      // best-effort
    }

    try {
      if (existsSync(lp)) unlinkSync(lp);
    } catch {
      // best-effort
    }

    try {
      const lockDir = `${stateDir}.lock`;
      if (existsSync(lockDir)) rmSync(lockDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function acquireSessionLock(basePath: string): SessionLockResult {
  const normalizedBasePath = normalizeBasePath(basePath);
  const lp = lockPath(normalizedBasePath);

  // Re-entrant acquire on same path: release first so timers reset cleanly.
  if (_releaseFunction && _lockedPath === normalizedBasePath) {
    try {
      _releaseFunction();
    } catch {
      // may already be released
    }
    _releaseFunction = null;
    clearHeldLockState();
  }

  // Holding a lock on a different path. Release before acquiring new path.
  if (_releaseFunction && _lockedPath && _lockedPath !== normalizedBasePath) {
    try {
      _releaseFunction();
    } catch {
      // may already be released
    }
    _releaseFunction = null;
    clearHeldLockState();
  }

  mkdirSync(dirname(lp), { recursive: true });
  cleanupStrayLockFiles(normalizedBasePath);
  const stateDir = kataStateDir(normalizedBasePath);
  const lockDir = `${stateDir}.lock`;

  // If the lock directory exists but metadata is missing, lock ownership is
  // indeterminate. Refuse to acquire to avoid stealing an unknown lock owner.
  if (existsSync(lockDir) && !readExistingLockData(lp)) {
    return {
      acquired: false,
      reason:
        "Session lock metadata is missing for an existing lock directory. Refusing to acquire.",
    };
  }

  const lockData: SessionLockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    unitType: "starting",
    unitId: "bootstrap",
    unitStartedAt: new Date().toISOString(),
    completedUnits: 0,
  };

  let lockfile: typeof import("proper-lockfile");
  try {
    lockfile = _require("proper-lockfile") as typeof import("proper-lockfile");
  } catch {
    return acquireFallbackLock(normalizedBasePath, lp, lockData);
  }

  try {
    mkdirSync(stateDir, { recursive: true });

    const release = lockfile.lockSync(stateDir, {
      realpath: false,
      stale: STALE_WINDOW_MS,
      update: 10_000,
      onCompromised: () => {
        const elapsed = Date.now() - _lockAcquiredAt;
        if (elapsed < STALE_WINDOW_MS) {
          process.stderr.write(
            `[kata] Lock heartbeat mismatch after ${Math.round(elapsed / 1000)}s; continuing.\n`,
          );
          return;
        }
        _lockCompromised = true;
        _releaseFunction = null;
      },
    });

    _releaseFunction = release;
    _lockedPath = normalizedBasePath;
    _lockPid = process.pid;
    _lockCompromised = false;
    _lockAcquiredAt = Date.now();

    ensureExitHandler();

    atomicWriteSync(lp, JSON.stringify(lockData, null, 2));
    return { acquired: true };
  } catch {
    const existingData = readExistingLockData(lp);
    const existingPid = existingData?.pid;

    if (existingPid && !isPidAlive(existingPid)) {
      try {
        if (existsSync(lockDir)) rmSync(lockDir, { recursive: true, force: true });
        if (existsSync(lp)) unlinkSync(lp);

        const release = lockfile.lockSync(stateDir, {
          realpath: false,
          stale: STALE_WINDOW_MS,
          update: 10_000,
          onCompromised: () => {
            const elapsed = Date.now() - _lockAcquiredAt;
            if (elapsed < STALE_WINDOW_MS) {
              process.stderr.write(
                `[kata] Lock heartbeat mismatch after ${Math.round(elapsed / 1000)}s; continuing.\n`,
              );
              return;
            }
            _lockCompromised = true;
            _releaseFunction = null;
          },
        });

        _releaseFunction = release;
        _lockedPath = normalizedBasePath;
        _lockPid = process.pid;
        _lockCompromised = false;
        _lockAcquiredAt = Date.now();

        ensureExitHandler();

        atomicWriteSync(lp, JSON.stringify(lockData, null, 2));
        return { acquired: true };
      } catch {
        // fall through to contention path
      }
    }

    const reason = existingPid
      ? `Another auto-mode session (PID ${existingPid}) appears to be running.`
      : "Another auto-mode session is already running on this project.";

    return { acquired: false, reason, existingPid };
  }
}

function acquireFallbackLock(
  normalizedBasePath: string,
  lp: string,
  lockData: SessionLockData,
): SessionLockResult {
  const existing = readExistingLockData(lp);
  if (existing && existing.pid !== process.pid) {
    if (isPidAlive(existing.pid)) {
      return {
        acquired: false,
        reason: `Another auto-mode session (PID ${existing.pid}) is already running on this project.`,
        existingPid: existing.pid,
      };
    }
    // stale lock from dead process: continue and take over
  }

  atomicWriteSync(lp, JSON.stringify(lockData, null, 2));
  _lockedPath = normalizedBasePath;
  _lockPid = process.pid;
  return { acquired: true };
}

export function updateSessionLock(
  basePath: string,
  unitType: string,
  unitId: string,
  completedUnits: number,
  sessionFile?: string,
): void {
  const normalizedBasePath = normalizeBasePath(basePath);
  if (_lockedPath !== normalizedBasePath) return;

  const lp = lockPath(normalizedBasePath);
  try {
    const existing = readExistingLockData(lp);
    const data: SessionLockData = {
      pid: process.pid,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      unitType,
      unitId,
      unitStartedAt: new Date().toISOString(),
      completedUnits,
      sessionFile,
    };
    atomicWriteSync(lp, JSON.stringify(data, null, 2));
  } catch {
    // non-fatal
  }
}

export function getSessionLockStatus(basePath: string): SessionLockStatus {
  const normalizedBasePath = normalizeBasePath(basePath);

  if (_lockCompromised) {
    const lp = lockPath(normalizedBasePath);
    const existing = readExistingLockData(lp);
    if (existing && existing.pid === process.pid) {
      try {
        const result = acquireSessionLock(normalizedBasePath);
        if (result.acquired) {
          process.stderr.write(
            "[kata] Lock recovered after onCompromised; lock file PID matched.\n",
          );
          return { valid: true, recovered: true };
        }
      } catch {
        // fall through
      }
    }
    return {
      valid: false,
      failureReason: "compromised",
      existingPid: existing?.pid,
      expectedPid: process.pid,
    };
  }

  if (_releaseFunction && _lockedPath === normalizedBasePath) {
    return { valid: true };
  }

  const lp = lockPath(normalizedBasePath);
  const existing = readExistingLockData(lp);
  if (!existing) {
    return {
      valid: false,
      failureReason: "missing-metadata",
      expectedPid: process.pid,
    };
  }

  if (existing.pid !== process.pid) {
    return {
      valid: false,
      failureReason: "pid-mismatch",
      existingPid: existing.pid,
      expectedPid: process.pid,
    };
  }

  return { valid: true };
}

export function validateSessionLock(basePath: string): boolean {
  return getSessionLockStatus(basePath).valid;
}

export function releaseSessionLock(basePath: string): void {
  const normalizedBasePath = normalizeBasePath(basePath);
  if (_lockedPath !== normalizedBasePath) return;

  if (_releaseFunction) {
    try {
      _releaseFunction();
    } catch {
      // may already be released
    }
    _releaseFunction = null;
  }

  const lp = lockPath(normalizedBasePath);
  try {
    if (existsSync(lp)) unlinkSync(lp);
  } catch {
    // non-fatal
  }

  try {
    const lockDir = `${kataStateDir(normalizedBasePath)}.lock`;
    if (existsSync(lockDir)) rmSync(lockDir, { recursive: true, force: true });
  } catch {
    // non-fatal
  }

  cleanupStrayLockFiles(normalizedBasePath);

  clearHeldLockState();
}

export function readSessionLockData(basePath: string): SessionLockData | null {
  return readExistingLockData(lockPath(normalizeBasePath(basePath)));
}

export function isSessionLockProcessAlive(data: SessionLockData): boolean {
  return isPidAlive(data.pid);
}

export function isSessionLockHeld(basePath: string): boolean {
  const normalizedBasePath = normalizeBasePath(basePath);
  return _lockedPath === normalizedBasePath && _lockPid === process.pid;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function readExistingLockData(lp: string): SessionLockData | null {
  try {
    if (!existsSync(lp)) return null;
    const raw = readFileSync(lp, "utf-8");
    return JSON.parse(raw) as SessionLockData;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}
