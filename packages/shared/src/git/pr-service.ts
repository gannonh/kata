import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { PrInfo } from './types'

const execFileAsync = promisify(execFile)

/**
 * Get PR status for the currently checked-out branch in a directory.
 * Uses gh CLI to fetch PR information by running in the specified directory.
 *
 * Returns null for expected cases (no PR, gh not installed, not authenticated).
 * Logs unexpected errors to console.error for debugging.
 *
 * IMPORTANT: This function is async-only to prevent main process blocking.
 */
export async function getPrStatus(dirPath: string): Promise<PrInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', '--json', 'number,title,state,isDraft,url'],
      {
        cwd: dirPath,
        timeout: 5000, // 5 second timeout
      }
    )

    return JSON.parse(stdout.trim())
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string }

    // Expected: gh CLI not installed or not in PATH
    if (err.code === 'ENOENT') {
      if (process.env.DEBUG_GIT) {
        console.debug('[PrService] gh CLI not found')
      }
      return null
    }

    // Expected: Not a git repository (e.g., non-git workspace directory)
    if (err.stderr?.includes('not a git repository')) {
      if (process.env.DEBUG_GIT) {
        console.debug('[PrService] Not a git repository:', dirPath)
      }
      return null
    }

    // Expected: No PR exists for this branch (gh exits with specific message)
    if (
      err.stderr?.includes('no pull requests found') ||
      err.stderr?.includes('Could not resolve to a PullRequest')
    ) {
      if (process.env.DEBUG_GIT) {
        console.debug('[PrService] No PR found for branch in', dirPath)
      }
      return null
    }

    // Expected: gh not authenticated
    if (err.stderr?.includes('not logged into') || err.stderr?.includes('authentication required')) {
      if (process.env.DEBUG_GIT) {
        console.debug('[PrService] gh CLI not authenticated')
      }
      return null
    }

    // Unexpected: Log for debugging production issues
    console.error('[PrService] Unexpected error getting PR status:', {
      dirPath,
      message: err.message,
      code: err.code,
      stderr: err.stderr?.slice(0, 200),
    })
    return null
  }
}
