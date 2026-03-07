/**
 * Git File Watcher
 *
 * Watches selective .git paths for changes to detect branch switches,
 * commits, and other git operations. Uses chokidar for cross-platform
 * reliability (handles macOS, Linux, Windows differences).
 *
 * Watched paths:
 * - .git/HEAD - Branch reference (changes on checkout, branch switch)
 * - .git/index - Staging area (changes on add, reset, commit)
 * - .git/refs/heads/ - Local branch tips (changes on commit, pull, merge)
 * - .git/refs/remotes/ - Remote refs (changes on fetch, pull)
 */

import { watch, type FSWatcher } from 'chokidar'
import { join, resolve } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { debug } from '@craft-agent/shared/utils'

// Debounce delay in milliseconds (100ms for rapid git operations like rebase)
const DEBOUNCE_MS = 100

interface GitWatcherOptions {
  debounceMs?: number
  onError?: (error: Error) => void
}

/**
 * Resolve the actual .git directory for a workspace.
 * Handles normal repos (.git is a directory), worktrees and submodules
 * (.git is a file containing a gitdir pointer).
 * Returns the absolute path to the git directory, or null if not a git repo.
 */
function resolveGitDir(workspaceDir: string): string | null {
  const gitPath = join(workspaceDir, '.git')

  try {
    const stat = statSync(gitPath)

    if (stat.isDirectory()) {
      // Normal repository: .git is a directory
      return gitPath
    }

    if (stat.isFile()) {
      // Worktree or submodule: .git is a file with "gitdir: <path>"
      const content = readFileSync(gitPath, 'utf-8').trim()
      const match = content.match(/^gitdir:\s*(.+)$/)
      if (!match) {
        debug('[GitWatcher] .git file does not contain gitdir pointer:', gitPath)
        return null
      }
      // Resolve relative paths against the workspace directory
      return resolve(workspaceDir, match[1])
    }

    return null
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      debug('[GitWatcher] Error accessing .git path:', gitPath, error)
    }
    return null
  }
}

/**
 * Watches .git directory for changes and triggers callback.
 * Per-workspace singleton - create one watcher per workspace directory.
 */
export class GitWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private readonly debounceMs: number
  private readonly onError?: (error: Error) => void

  constructor(
    private readonly workspaceDir: string,
    private readonly onGitChange: () => void,
    options: GitWatcherOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS
    this.onError = options.onError
  }

  /**
   * Start watching .git paths.
   * @returns true if watching started, false if not a git repo
   */
  start(): boolean {
    const gitDir = resolveGitDir(this.workspaceDir)

    if (!gitDir) {
      debug('[GitWatcher] Not a git repository:', this.workspaceDir)
      return false
    }

    // Watch selective paths only - not entire .git directory
    const watchPaths = [
      join(gitDir, 'HEAD'),
      join(gitDir, 'index'),
      join(gitDir, 'refs', 'heads'),
      join(gitDir, 'refs', 'remotes'),
    ]

    this.watcher = watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,      // Don't fire on startup
      depth: 2,                 // Limit recursion in refs/
      awaitWriteFinish: {       // Wait for atomic writes
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    this.watcher
      .on('all', (_event, path) => {
        debug('[GitWatcher] File change:', _event, path)
        this.handleChange()
      })
      .on('error', (error) => {
        debug('[GitWatcher] Error:', error)

        // Detect Linux inotify watch limit exhaustion
        const errorAny = error as NodeJS.ErrnoException
        if (errorAny.message?.includes('ENOSPC') || errorAny.code === 'ENOSPC') {
          debug(
            '[GitWatcher] File watcher limit reached. On Linux, increase inotify watches:',
            'echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p'
          )
        }

        try {
          this.onError?.(error)
        } catch (callbackError) {
          debug('[GitWatcher] Error in error handler:', callbackError)
        }
      })
      .on('ready', () => {
        debug('[GitWatcher] Ready:', this.workspaceDir)
      })

    return true
  }

  private handleChange(): void {
    // Debounce rapid changes (e.g., during rebase which touches multiple files)
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      try {
        this.onGitChange()
      } catch (error) {
        debug('[GitWatcher] Error in change callback:', error)
      }
    }, this.debounceMs)
  }

  /**
   * Stop watching and clean up resources.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.watcher?.close()
    this.watcher = null
    debug('[GitWatcher] Stopped:', this.workspaceDir)
  }

  /**
   * Check if watcher is currently active.
   */
  isRunning(): boolean {
    return this.watcher !== null
  }

  /**
   * Get the workspace directory being watched.
   */
  getWorkspaceDir(): string {
    return this.workspaceDir
  }
}
