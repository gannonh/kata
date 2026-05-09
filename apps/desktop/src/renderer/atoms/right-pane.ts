import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type {
  RightPaneMode,
  RightPaneOverride,
  RightPaneResolution,
  WorkflowContextSnapshot,
} from '@shared/types'

export type SettingsTabId = 'providers' | 'mcp' | 'archives' | 'general' | 'appearance' | 'symphony'

export const RIGHT_PANE_OVERRIDE_STORAGE_KEY = 'kata-desktop:right-pane-override'

const defaultWorkflowContext: WorkflowContextSnapshot = {
  mode: 'unknown',
  reason: 'unknown_context',
  trackerConfigured: false,
  boardAvailable: false,
  updatedAt: new Date(0).toISOString(),
}

const storedRightPaneOverrideAtom = atomWithStorage<RightPaneOverride>(
  RIGHT_PANE_OVERRIDE_STORAGE_KEY,
  null,
)

function visibleRightPaneOverride(override: RightPaneOverride): RightPaneOverride {
  return override === 'agent_activity' || override === 'kanban' ? override : null
}

export const rightPaneOverrideAtom = atom<RightPaneOverride>((get) =>
  visibleRightPaneOverride(get(storedRightPaneOverrideAtom)),
)

export const workflowContextAtom = atom<WorkflowContextSnapshot>(defaultWorkflowContext)

export const rightPaneResolutionAtom = atom<RightPaneResolution>((get) => {
  const override = get(rightPaneOverrideAtom)
  const context = get(workflowContextAtom)

  if (override) {
    return {
      mode: override,
      source: 'manual',
      reason: 'manual_override',
    }
  }

  if (context.mode === 'execution') {
    return {
      mode: 'kanban',
      source: 'automatic',
      reason: context.reason,
    }
  }

  return {
    mode: 'kanban',
    source: 'automatic',
    reason: 'default_fallback',
  }
})

export const rightPaneModeAtom = atom<RightPaneMode>((get) => get(rightPaneResolutionAtom).mode)

export const setRightPaneOverrideAtom = atom(
  null,
  (_get, set, override: RightPaneOverride) => {
    set(storedRightPaneOverrideAtom, visibleRightPaneOverride(override))
  },
)

export const clearRightPaneOverrideAtom = atom(null, (_get, set) => {
  set(storedRightPaneOverrideAtom, null)
})

export const setWorkflowContextAtom = atom(
  null,
  (_get, set, context: WorkflowContextSnapshot) => {
    set(workflowContextAtom, context)
  },
)

export const settingsPanelOpenAtom = atom(false)
export const settingsPanelTabAtom = atom<SettingsTabId>('providers')

export const openSettingsPanelAtom = atom(
  null,
  (_get, set, targetTab: SettingsTabId = 'providers') => {
    set(settingsPanelTabAtom, targetTab)
    set(settingsPanelOpenAtom, true)
  },
)

export const closeSettingsPanelAtom = atom(null, (_get, set) => {
  set(settingsPanelOpenAtom, false)
})
