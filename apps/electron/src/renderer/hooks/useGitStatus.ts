/**
 * useGitStatus - Hook for accessing workspace git status
 *
 * Provides git status for the current workspace with automatic fetching.
 * Handles workspace switching by re-fetching when workspaceId changes.
 *
 * Usage:
 *   const { gitState, isLoading, refresh } = useGitStatus(workspaceId, workspaceRootPath)
 */

import { useEffect, useCallback, useState, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  gitStateForWorkspaceAtom,
  gitLoadingForWorkspaceAtom,
  setGitStateAtom,
  setGitLoadingAtom,
} from '@/atoms/git'
import type { GitState } from '../../shared/types'

interface UseGitStatusResult {
  /** Current git state for the workspace, null if not yet fetched or not a git repo */
  gitState: GitState | null
  /** True if git status is being fetched */
  isLoading: boolean
  /** Manually refresh git status */
  refresh: () => Promise<void>
}

/**
 * Hook to access git status for a workspace.
 *
 * @param workspaceId - Current workspace ID
 * @param workspaceRootPath - Absolute path to workspace root directory
 * @returns Git state, loading state, and refresh function
 */
export function useGitStatus(
  workspaceId: string | null,
  workspaceRootPath: string | null
): UseGitStatusResult {
  const getGitState = useAtomValue(gitStateForWorkspaceAtom)
  const getLoading = useAtomValue(gitLoadingForWorkspaceAtom)
  const setGitState = useSetAtom(setGitStateAtom)
  const setLoading = useSetAtom(setGitLoadingAtom)

  const gitState = workspaceId ? getGitState(workspaceId) : null
  const isLoading = workspaceId ? getLoading(workspaceId) : false

  // Track window focus for LIVE-03
  const [isFocused, setIsFocused] = useState(true)
  // Deduplication: skip refresh if one completed within threshold
  const lastFetchTimeRef = useRef<number>(0)
  const DEDUP_THRESHOLD_MS = 500

  const refresh = useCallback(async () => {
    if (!workspaceId || !workspaceRootPath) return

    const now = Date.now()
    if (now - lastFetchTimeRef.current < DEDUP_THRESHOLD_MS) return
    lastFetchTimeRef.current = now

    // Set loading state
    setLoading({ workspaceId, loading: true })

    try {
      // Fetch git status via IPC (optional chaining for safety)
      const state = await window.electronAPI?.getGitStatus?.(workspaceRootPath)
      if (state) {
        setGitState({ workspaceId, state })
      } else {
        // electronAPI not available (e.g., outside Electron)
        setGitState({
          workspaceId,
          state: {
            branch: null,
            isRepo: false,
            isDetached: false,
            detachedHead: null,
          },
        })
      }
    } catch (error) {
      console.error('[useGitStatus] Failed to fetch git status:', {
        workspaceId,
        workspaceRootPath,
        error: error instanceof Error ? error.message : String(error),
      })
      setGitState({
        workspaceId,
        state: {
          branch: null,
          isRepo: false,
          isDetached: false,
          detachedHead: null,
        },
      })
    } finally {
      setLoading({ workspaceId, loading: false })
    }
  }, [workspaceId, workspaceRootPath, setGitState, setLoading])

  // Fetch git status when workspace changes (only if not already fetched)
  // null means either "not fetched yet" or "not a git repo"; use refresh() to force re-fetch
  useEffect(() => {
    if (workspaceId && workspaceRootPath && !gitState) {
      refresh()
    }
  }, [workspaceId, workspaceRootPath, gitState, refresh])

  // Listen for git changes from file watcher (LIVE-01)
  useEffect(() => {
    if (!workspaceRootPath) return

    const unsubscribe = window.electronAPI?.onGitStatusChanged?.((changedDir: string) => {
      // Only refresh if the change is for our workspace
      if (changedDir === workspaceRootPath) {
        console.debug('[useGitStatus] Git change detected, refreshing')
        refresh()
      }
    })

    return () => unsubscribe?.()
  }, [workspaceRootPath, refresh])

  // Listen for window focus changes (LIVE-03)
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onWindowFocusChange?.((focused) => {
      setIsFocused(focused)
    })
    return () => unsubscribe?.()
  }, [])

  // Refresh git status when window gains focus (LIVE-03)
  useEffect(() => {
    if (isFocused && workspaceId && workspaceRootPath) {
      // Add small delay to avoid duplicate fetches with file watcher
      const timer = setTimeout(() => {
        console.debug('[useGitStatus] Window focused, refreshing')
        refresh()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isFocused, workspaceId, workspaceRootPath, refresh])

  return {
    gitState,
    isLoading,
    refresh,
  }
}
