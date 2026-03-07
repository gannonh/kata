import { existsSync } from 'node:fs'
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git'

import type { GitState } from './types'

/**
 * Check if a directory is inside a git repository.
 * Uses git rev-parse which is fast (single subprocess call via simple-git).
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  // Avoid simple-git errors for non-existent directories
  if (!existsSync(dirPath)) {
    return false
  }

  try {
    const git: SimpleGit = simpleGit(dirPath)
    await git.revparse(['--is-inside-work-tree'])
    return true
  } catch (error) {
    // Expected for non-git directories; log for debugging permission/path issues
    if (process.env.DEBUG_GIT) {
      console.debug('[GitService] isGitRepository check failed:', dirPath, error)
    }
    return false
  }
}

/**
 * Get git status for a directory.
 * Returns null values for non-git directories (graceful degradation).
 *
 * IMPORTANT: This function is async-only to prevent main process blocking.
 * Never use execSync or synchronous git operations.
 */
export async function getGitStatus(dirPath: string): Promise<GitState> {
  // Default state for non-git directories
  const defaultState: GitState = {
    branch: null,
    isRepo: false,
    isDetached: false,
    detachedHead: null,
  }

  // Avoid simple-git errors for non-existent directories
  if (!existsSync(dirPath)) {
    return defaultState
  }

  try {
    const git: SimpleGit = simpleGit(dirPath, {
      maxConcurrentProcesses: 5, // Prevent subprocess spam
      timeout: {
        block: 5000, // 5 second timeout
      },
    })

    // Quick check if this is a git repo
    try {
      await git.revparse(['--is-inside-work-tree'])
    } catch (error) {
      // Expected for non-git directories; log for debugging permission/path issues
      if (process.env.DEBUG_GIT) {
        console.debug('[GitService] Not a git repo or check failed:', dirPath, error)
      }
      return defaultState
    }

    // Get branch info
    const status: StatusResult = await git.status()

    // Check for detached HEAD state
    const isDetached = status.detached
    let detachedHead: string | null = null

    if (isDetached) {
      // Get short commit hash for detached HEAD display
      try {
        const result = await git.revparse(['--short', 'HEAD'])
        detachedHead = result.trim()
      } catch (error) {
        // In detached state but couldn't get commit hash - log warning
        console.warn('[GitService] In detached HEAD but could not get commit hash:', dirPath, error)
      }
    }

    return {
      branch: status.current,
      isRepo: true,
      isDetached,
      detachedHead,
    }
  } catch (error) {
    // Log error but return safe default (don't crash on git errors)
    console.error('[GitService] Error getting git status:', dirPath, error)
    return defaultState
  }
}
