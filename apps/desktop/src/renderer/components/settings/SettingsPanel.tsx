import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { FirstRunReadinessSnapshot } from '@shared/types'
import type { SettingsTabId } from '@/atoms/right-pane'
import { useReliabilitySnapshot } from '@/atoms/reliability'
import { buildFirstRunGuidance, getFirstRunCheckpoint } from '@/lib/first-run-readiness'
import { ProviderAuthPanel } from './ProviderAuthPanel'
import { SymphonyRuntimePanel } from './SymphonyRuntimePanel'
import { SymphonyDashboard } from '../symphony/SymphonyDashboard'
import { McpServerPanel } from './McpServerPanel'

interface SettingsPanelProps {
  open: boolean
  activeTab: SettingsTabId
  onOpenChange: (open: boolean) => void
  onActiveTabChange: (tab: SettingsTabId) => void
  onReturnToWorkflowBoard?: () => void
  returnToWorkflowDisabled?: boolean
  returnToWorkflowDisabledReason?: string | null
}

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'providers', label: 'Providers' },
  { id: 'mcp', label: 'MCP' },
  { id: 'symphony', label: 'Symphony' },
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
]

export function shouldShowReturnToWorkflowAction(
  activeTab: SettingsTabId,
  onReturnToWorkflowBoard?: () => void,
): boolean {
  return Boolean(onReturnToWorkflowBoard) && activeTab === 'mcp'
}

export function formatFirstRunStartupGuidance(
  readiness: FirstRunReadinessSnapshot | null | undefined,
): string | null {
  return buildFirstRunGuidance(getFirstRunCheckpoint(readiness, 'startup'))
}

export function SettingsPanel({
  open,
  activeTab,
  onOpenChange,
  onActiveTabChange,
  onReturnToWorkflowBoard,
  returnToWorkflowDisabled,
  returnToWorkflowDisabledReason,
}: SettingsPanelProps) {
  const showReturnToWorkflow = shouldShowReturnToWorkflowAction(activeTab, onReturnToWorkflowBoard)
  const reliabilitySnapshot = useReliabilitySnapshot()
  const startupGuidance = formatFirstRunStartupGuidance(reliabilitySnapshot.firstRunReadiness)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[min(48rem,90vh)] w-[min(70rem,95vw)] max-w-[min(70rem,95vw)] sm:max-w-[min(70rem,95vw)] grid-rows-[auto_auto_1fr] gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Settings
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Manage providers, preferences, and desktop defaults.
              </DialogDescription>
              {showReturnToWorkflow && returnToWorkflowDisabledReason ? (
                <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="settings-return-disabled-reason">
                  {returnToWorkflowDisabledReason}
                </p>
              ) : null}
              {startupGuidance ? (
                <p className="text-xs text-muted-foreground" data-testid="settings-startup-guidance">
                  {startupGuidance}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {showReturnToWorkflow ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReturnToWorkflowBoard}
                  disabled={Boolean(returnToWorkflowDisabled)}
                  title="Return to workflow board (⌘⇧B / Ctrl+Shift+B)"
                  data-testid="settings-return-to-workflow"
                >
                  Return to workflow board
                </Button>
              ) : null}

              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">
                  Close
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => onActiveTabChange(value as SettingsTabId)}
          className="flex min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <TabsList className="h-full w-48 shrink-0 items-start rounded-none bg-background/40 p-3" variant="line">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="justify-start text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <Separator orientation="vertical" />

          <div className="flex-1 overflow-hidden">
            <TabsContent value="providers" className="mt-0 h-full overflow-auto p-4">
              <ProviderAuthPanel />
            </TabsContent>

            <TabsContent value="mcp" className="mt-0 h-full overflow-auto p-4">
              <McpServerPanel />
            </TabsContent>

            <TabsContent value="symphony" className="mt-0 h-full overflow-auto p-4">
              <div className="space-y-4">
                <SymphonyRuntimePanel />
                <SymphonyDashboard />
              </div>
            </TabsContent>

            <TabsContent value="general" className="mt-0 h-full overflow-auto p-4">
              <Card className="border border-border bg-card/60 py-0">
                <CardHeader className="px-4 pt-4 pb-0">
                  <CardTitle className="text-sm text-foreground">General settings</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 text-xs text-muted-foreground">
                  Additional preferences will be added in a future slice.
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="mt-0 h-full overflow-auto p-4">
              <Card className="border border-border bg-card/60 py-0">
                <CardHeader className="px-4 pt-4 pb-0">
                  <CardTitle className="text-sm text-foreground">Appearance</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 text-xs text-muted-foreground">
                  Theme and typography controls are coming in a future slice.
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
