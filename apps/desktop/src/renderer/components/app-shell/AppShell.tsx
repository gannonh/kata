import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  Group,
  Panel,
  Separator as PanelSeparator,
  type Layout,
} from 'react-resizable-panels'
import type { WorkflowShellActionEvent } from '@shared/types'
import { initializeSessionsAtom } from '@/atoms/session'
import {
  closeSettingsPanelAtom,
  openSettingsPanelAtom,
  settingsPanelOpenAtom,
  settingsPanelTabAtom,
  setRightPaneOverrideAtom,
} from '@/atoms/right-pane'
import {
  captureWorkflowBoardReturnContextAtom,
  clearWorkflowBoardReturnContextAtom,
  refreshWorkflowBoardAtom,
  workflowBoardLoadingAtom,
  workflowBoardRefreshingAtom,
  workflowBoardReturnContextAtom,
  workflowBoardScopeAtom,
  workflowMutationPendingAtom,
} from '@/atoms/workflow-board'
import { mcpMutationPendingAtom, mcpStatusPendingByServerAtom } from '@/atoms/mcp'
import {
  formatReliabilityActionLabel,
  formatReliabilityClassLabel,
  formatReliabilitySurfaceLabel,
  formatStabilityMetricLabel,
  formatStabilityStatusLabel,
  reliabilityRecoveryPendingAtom,
  reliabilitySeverityTone,
  requestReliabilityRecoveryActionAtom,
  useReliabilityBridge,
  useReliabilitySnapshot,
  useStabilitySnapshot,
} from '@/atoms/reliability'
import { Button } from '@/components/ui/button'
import { LeftPane } from './LeftPane'
import { RightPane } from './RightPane'
import { SettingsPanel } from '../settings/SettingsPanel'

const LAYOUT_STORAGE_KEY = 'kata-desktop:app-shell-layout'
const LEFT_PANEL_ID = 'chat-pane'
const RIGHT_PANEL_ID = 'context-pane'
const DEFAULT_LAYOUT: Layout = {
  [LEFT_PANEL_ID]: 64,
  [RIGHT_PANEL_ID]: 36,
}

function readInitialLayout(): Layout {
  if (typeof window === 'undefined') {
    return DEFAULT_LAYOUT
  }

  const value = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
  if (!value) {
    return DEFAULT_LAYOUT
  }

  try {
    const parsed = JSON.parse(value)
    const left = parsed?.[LEFT_PANEL_ID]
    const right = parsed?.[RIGHT_PANEL_ID]

    if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isFinite(left) &&
      Number.isFinite(right) &&
      left > 0 &&
      right > 0
    ) {
      return {
        [LEFT_PANEL_ID]: left,
        [RIGHT_PANEL_ID]: right,
      }
    }
  } catch {
    // Ignore malformed local storage data.
  }

  return DEFAULT_LAYOUT
}

function isKeyboardShortcutEvent(event: KeyboardEvent, key: string): boolean {
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) {
    return false
  }

  return event.key.toLowerCase() === key
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function reliabilitySeverityRank(severity: string | undefined): number {
  if (severity === 'critical') return 4
  if (severity === 'error') return 3
  if (severity === 'warning') return 2
  if (severity === 'info') return 1
  return 0
}

export function AppShell() {
  useReliabilityBridge()

  const defaultLayout = useMemo(readInitialLayout, [])
  const initializeSessions = useSetAtom(initializeSessionsAtom)
  const initializedSessionsRef = useRef(false)

  const settingsOpen = useAtomValue(settingsPanelOpenAtom)
  const settingsTab = useAtomValue(settingsPanelTabAtom)
  const workflowScope = useAtomValue(workflowBoardScopeAtom)
  const workflowReturnContext = useAtomValue(workflowBoardReturnContextAtom)
  const workflowLoading = useAtomValue(workflowBoardLoadingAtom)
  const workflowRefreshing = useAtomValue(workflowBoardRefreshingAtom)
  const workflowMutationPending = useAtomValue(workflowMutationPendingAtom)

  const mcpMutationPending = useAtomValue(mcpMutationPendingAtom)
  const mcpStatusPendingByServer = useAtomValue(mcpStatusPendingByServerAtom)
  const mcpBusy =
    mcpMutationPending ||
    Object.values(mcpStatusPendingByServer).some((isPending) => Boolean(isPending))

  const reliabilitySnapshot = useReliabilitySnapshot()
  const stabilitySnapshot = useStabilitySnapshot()
  const reliabilityPendingBySurface = useAtomValue(reliabilityRecoveryPendingAtom)
  const requestReliabilityRecovery = useSetAtom(requestReliabilityRecoveryActionAtom)

  const openSettingsPanel = useSetAtom(openSettingsPanelAtom)
  const closeSettingsPanel = useSetAtom(closeSettingsPanelAtom)
  const setSettingsTab = useSetAtom(settingsPanelTabAtom)
  const captureReturnContext = useSetAtom(captureWorkflowBoardReturnContextAtom)
  const clearReturnContext = useSetAtom(clearWorkflowBoardReturnContextAtom)
  const setWorkflowScope = useSetAtom(workflowBoardScopeAtom)
  const setRightPaneOverride = useSetAtom(setRightPaneOverrideAtom)
  const refreshWorkflowBoard = useSetAtom(refreshWorkflowBoardAtom)

  useEffect(() => {
    if (initializedSessionsRef.current) {
      return
    }

    initializedSessionsRef.current = true
    void initializeSessions()
  }, [initializeSessions])

  const primaryReliabilitySurface = useMemo(() => {
    const degraded = reliabilitySnapshot.surfaces.filter((surface) => surface.status === 'degraded' && surface.signal)
    if (degraded.length === 0) {
      return null
    }

    return degraded.reduce((selected, candidate) => {
      const selectedSignal = selected.signal
      const candidateSignal = candidate.signal
      if (!selectedSignal || !candidateSignal) {
        return selected
      }

      const selectedRank = reliabilitySeverityRank(selectedSignal.severity)
      const candidateRank = reliabilitySeverityRank(candidateSignal.severity)
      if (candidateRank > selectedRank) {
        return candidate
      }

      if (candidateRank < selectedRank) {
        return selected
      }

      return candidateSignal.timestamp > selectedSignal.timestamp ? candidate : selected
    })
  }, [reliabilitySnapshot])

  const handleWorkflowShellAction = useCallback(
    async (event: WorkflowShellActionEvent) => {
      if (event.action === 'open_mcp_settings') {
        if (workflowMutationPending) {
          return
        }

        captureReturnContext()
        openSettingsPanel('mcp')
        return
      }

      if (event.action === 'refresh_board') {
        if (workflowLoading || workflowRefreshing || workflowMutationPending) {
          return
        }

        await refreshWorkflowBoard()
        return
      }

      if (event.action === 'return_to_kanban') {
        if (mcpBusy) {
          return
        }

        closeSettingsPanel()
        setRightPaneOverride('kanban')

        if (workflowReturnContext?.scope && workflowReturnContext.scope !== workflowScope) {
          setWorkflowScope(workflowReturnContext.scope)
        }

        clearReturnContext()
        await refreshWorkflowBoard()
      }
    },
    [
      workflowLoading,
      workflowRefreshing,
      workflowMutationPending,
      captureReturnContext,
      openSettingsPanel,
      refreshWorkflowBoard,
      mcpBusy,
      closeSettingsPanel,
      setRightPaneOverride,
      workflowReturnContext,
      workflowScope,
      setWorkflowScope,
      clearReturnContext,
    ],
  )

  useEffect(() => {
    return window.api.workflow.onShellAction((event) => {
      handleWorkflowShellAction(event).catch((error) => {
        console.error('[AppShell] Workflow shell action failed:', error)
      })
    })
  }, [handleWorkflowShellAction])

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditableTarget(event.target)) {
        return
      }

      let action: WorkflowShellActionEvent['action'] | null = null

      if (isKeyboardShortcutEvent(event, 'm')) {
        action = 'open_mcp_settings'
      } else if (isKeyboardShortcutEvent(event, 'b')) {
        action = 'return_to_kanban'
      } else if (isKeyboardShortcutEvent(event, 'r')) {
        action = 'refresh_board'
      }

      if (!action) {
        return
      }

      event.preventDefault()
      void window.api.workflow.dispatchShellAction({
        action,
        source: 'keyboard_shortcut',
      })
    }

    window.addEventListener('keydown', handleKeyboardShortcut)
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcut)
    }
  }, [])

  const primarySignal = primaryReliabilitySurface?.signal ?? null

  const primaryStabilityBreach = useMemo(() => {
    if (stabilitySnapshot.breaches.length === 0) {
      return null
    }

    return [...stabilitySnapshot.breaches].sort((left, right) => {
      if (left.breached !== right.breached) {
        return left.breached ? -1 : 1
      }

      const leftRank = reliabilitySeverityRank(left.severity)
      const rightRank = reliabilitySeverityRank(right.severity)
      if (leftRank !== rightRank) {
        return rightRank - leftRank
      }

      return right.timestamp.localeCompare(left.timestamp)
    })[0]
  }, [stabilitySnapshot])

  const reliabilityTone = reliabilitySeverityTone(primarySignal?.severity)
  const stabilityTone = reliabilitySeverityTone(primaryStabilityBreach?.severity)

  return (
    <main className="flex size-full min-h-0 flex-col bg-background text-foreground">
      {primaryReliabilitySurface && primarySignal ? (
        <div
          className={
            reliabilityTone === 'error'
              ? 'border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive'
              : reliabilityTone === 'warning'
                ? 'border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200'
                : 'border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground'
          }
          data-testid="reliability-banner"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-medium">
                {formatReliabilitySurfaceLabel(primaryReliabilitySurface.sourceSurface)} ·{' '}
                {formatReliabilityClassLabel(primarySignal.class)}
              </p>
              <p>
                {primarySignal.message} · Recommended: {formatReliabilityActionLabel(primarySignal.recoveryAction)} ·{' '}
                {primarySignal.code}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void requestReliabilityRecovery({
                  sourceSurface: primaryReliabilitySurface.sourceSurface,
                  action: primarySignal.recoveryAction,
                })
              }}
              disabled={reliabilityPendingBySurface[primaryReliabilitySurface.sourceSurface]}
              data-testid="reliability-banner-recover"
            >
              {reliabilityPendingBySurface[primaryReliabilitySurface.sourceSurface]
                ? 'Recovering…'
                : formatReliabilityActionLabel(primarySignal.recoveryAction)}
            </Button>
          </div>
        </div>
      ) : primaryStabilityBreach ? (
        <div
          className={
            stabilityTone === 'error'
              ? 'border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive'
              : 'border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200'
          }
          data-testid="stability-banner"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-medium">
                Stability {formatStabilityStatusLabel(stabilitySnapshot.status)} ·{' '}
                {formatStabilityMetricLabel(primaryStabilityBreach.metric)}
              </p>
              <p>
                {primaryStabilityBreach.message} · Recovery: {primaryStabilityBreach.suggestedRecovery}
                {primaryStabilityBreach.lastKnownGoodAt
                  ? ` · Last known good: ${new Date(primaryStabilityBreach.lastKnownGoodAt).toLocaleTimeString()}`
                  : ''}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void requestReliabilityRecovery({
                  sourceSurface: primaryStabilityBreach.sourceSurface,
                  action: primaryStabilityBreach.recoveryAction,
                })
              }}
              disabled={reliabilityPendingBySurface[primaryStabilityBreach.sourceSurface]}
              data-testid="stability-banner-recover"
            >
              {reliabilityPendingBySurface[primaryStabilityBreach.sourceSurface]
                ? 'Recovering…'
                : formatReliabilityActionLabel(primaryStabilityBreach.recoveryAction)}
            </Button>
          </div>
        </div>
      ) : null}

      <Group
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={(layout) => {
          try {
            window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
          } catch {
            // Ignore storage persistence failures.
          }
        }}
      >
        <Panel id={LEFT_PANEL_ID} defaultSize={defaultLayout[LEFT_PANEL_ID]} minSize={45}>
          <LeftPane
            onOpenSettings={() => {
              clearReturnContext()
              openSettingsPanel('providers')
            }}
          />
        </Panel>

        <PanelSeparator className="w-px bg-border transition-colors hover:bg-accent" />

        <Panel id={RIGHT_PANEL_ID} defaultSize={defaultLayout[RIGHT_PANEL_ID]} minSize={20}>
          <RightPane />
        </Panel>
      </Group>

      <SettingsPanel
        open={settingsOpen}
        activeTab={settingsTab}
        onActiveTabChange={setSettingsTab}
        onOpenChange={(open) => {
          if (open) {
            openSettingsPanel(settingsTab)
            return
          }

          closeSettingsPanel()
          clearReturnContext()
        }}
        onReturnToWorkflowBoard={() => {
          void window.api.workflow.dispatchShellAction({
            action: 'return_to_kanban',
            source: 'settings_panel',
          })
        }}
        returnToWorkflowDisabled={mcpBusy}
        returnToWorkflowDisabledReason={mcpBusy ? 'MCP operation in progress' : null}
      />
    </main>
  )
}
