/**
 * Git State Management with Jotai
 *
 * Stores git status per workspace ID to support multi-workspace scenarios.
 * Each workspace has independent git state (branch, isRepo, etc).
 *
 * Uses Map-based state isolation for per-workspace git status,
 * similar in purpose to sessions.ts but using explicit Map management.
 */

import { atom } from 'jotai'
import type { GitState } from '../../shared/types'

/**
 * Map of workspace ID to git state.
 * Key: workspaceId, Value: GitState
 *
 * Using Map ensures workspace isolation - git state from one workspace
 * never leaks to another during rapid workspace switching.
 */
export const gitStateMapAtom = atom<Map<string, GitState>>(new Map())

/**
 * Loading state per workspace (to show loading indicators)
 */
export const gitLoadingMapAtom = atom<Map<string, boolean>>(new Map())

/**
 * Derived atom: Get git state for a specific workspace.
 * Returns null if no state exists for the workspace.
 */
export const gitStateForWorkspaceAtom = atom(
  (get) => (workspaceId: string): GitState | null => {
    const stateMap = get(gitStateMapAtom)
    return stateMap.get(workspaceId) ?? null
  }
)

/**
 * Derived atom: Check if git status is loading for a workspace.
 */
export const gitLoadingForWorkspaceAtom = atom(
  (get) => (workspaceId: string): boolean => {
    const loadingMap = get(gitLoadingMapAtom)
    return loadingMap.get(workspaceId) ?? false
  }
)

/**
 * Action atom: Update git state for a workspace.
 */
export const setGitStateAtom = atom(
  null,
  (get, set, { workspaceId, state }: { workspaceId: string; state: GitState }) => {
    const stateMap = new Map(get(gitStateMapAtom))
    stateMap.set(workspaceId, state)
    set(gitStateMapAtom, stateMap)
  }
)

/**
 * Action atom: Set loading state for a workspace.
 */
export const setGitLoadingAtom = atom(
  null,
  (get, set, { workspaceId, loading }: { workspaceId: string; loading: boolean }) => {
    const loadingMap = new Map(get(gitLoadingMapAtom))
    loadingMap.set(workspaceId, loading)
    set(gitLoadingMapAtom, loadingMap)
  }
)

/**
 * Action atom: Clear git state for a workspace (on workspace removal).
 */
export const clearGitStateAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    const stateMap = new Map(get(gitStateMapAtom))
    const loadingMap = new Map(get(gitLoadingMapAtom))
    stateMap.delete(workspaceId)
    loadingMap.delete(workspaceId)
    set(gitStateMapAtom, stateMap)
    set(gitLoadingMapAtom, loadingMap)
  }
)
