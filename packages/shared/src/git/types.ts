/**
 * Git state for a workspace directory.
 * All fields are nullable to handle non-git directories gracefully.
 */
export interface GitState {
  /** Current branch name, or null if detached HEAD or not a git repo */
  branch: string | null
  /** True if directory is inside a git repository */
  isRepo: boolean
  /** True if in detached HEAD state (e.g., during rebase or checkout of commit) */
  isDetached: boolean
  /** Short commit hash when in detached HEAD state */
  detachedHead: string | null
}

/**
 * PR information for a branch.
 * All fields correspond to gh pr view --json output.
 * Immutable - fields are readonly to prevent accidental mutation.
 */
export interface PrInfo {
  /** PR number (e.g., 123) */
  readonly number: number
  /** PR title */
  readonly title: string
  /** PR state: OPEN, CLOSED, or MERGED */
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED'
  /** Whether this is a draft PR */
  readonly isDraft: boolean
  /** URL to view the PR on GitHub */
  readonly url: string
}
