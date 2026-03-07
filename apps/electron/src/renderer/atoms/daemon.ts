/**
 * Daemon State Atom
 *
 * Holds the current daemon process state, updated via IPC from main process.
 * Used by DaemonStatusIndicator and any component that needs daemon awareness.
 */

import { atom } from 'jotai'
import type { DaemonManagerState } from '../../shared/types'
import type { ChannelConfig } from '@craft-agent/shared/channels'

/**
 * Current daemon process state.
 * Updated via IPC subscription to daemon state changes.
 */
export const daemonStateAtom = atom<DaemonManagerState>('stopped')

/**
 * Channel configurations for the active workspace.
 * Loaded on workspace change and updated when channels are modified.
 */
export const channelConfigsAtom = atom<ChannelConfig[]>([])
