import { useAtomValue, useSetAtom } from 'jotai'
import {
  agentActivityModeAtom,
  agentActivitySeverityFilterAtom,
  agentActivitySourceFilterAtom,
  setAgentActivityModeAtom,
} from '@/atoms/agent-activity'
import { clearRightPaneOverrideAtom, setRightPaneOverrideAtom } from '@/atoms/right-pane'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ActivityTimeline } from './ActivityTimeline'
import { PinnedErrorPanel } from './PinnedErrorPanel'
import { RuntimeOverviewPanel } from './RuntimeOverviewPanel'

export function AgentActivityPane() {
  const mode = useAtomValue(agentActivityModeAtom)
  const sourceFilter = useAtomValue(agentActivitySourceFilterAtom)
  const severityFilter = useAtomValue(agentActivitySeverityFilterAtom)
  const setMode = useSetAtom(setAgentActivityModeAtom)
  const setSourceFilter = useSetAtom(agentActivitySourceFilterAtom)
  const setSeverityFilter = useSetAtom(agentActivitySeverityFilterAtom)
  const setRightPaneOverride = useSetAtom(setRightPaneOverrideAtom)
  const clearRightPaneOverride = useSetAtom(clearRightPaneOverrideAtom)

  return (
    <aside className="flex h-full flex-col bg-muted/40" data-testid="agent-activity-pane">
      <Card className="m-3 flex min-h-0 flex-1 flex-col border border-border bg-card/60 py-0">
        <CardHeader className="space-y-2 px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm text-foreground">Agent Activity</CardTitle>
            <div className="flex items-center gap-2">
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(value) => {
                  if (value === 'events' || value === 'verbose') {
                    setMode(value)
                  }
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="events" data-testid="agent-activity-mode-events">
                  Events
                </ToggleGroupItem>
                <ToggleGroupItem value="verbose" data-testid="agent-activity-mode-verbose">
                  Verbose
                </ToggleGroupItem>
              </ToggleGroup>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setRightPaneOverride('kanban')}
                data-testid="agent-activity-open-kanban"
              >
                Kanban
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setRightPaneOverride('planning')}
                data-testid="agent-activity-open-planning"
              >
                Planning
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => clearRightPaneOverride()}
                data-testid="agent-activity-return-auto"
              >
                Auto
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={sourceFilter}
              onValueChange={(value) => setSourceFilter(value as typeof sourceFilter)}
            >
              <SelectTrigger size="sm" className="w-40" data-testid="agent-activity-source-filter">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="runtime">Runtime</SelectItem>
                <SelectItem value="worker">Worker</SelectItem>
                <SelectItem value="escalation">Escalation</SelectItem>
                <SelectItem value="connection">Connection</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value as typeof severityFilter)}
            >
              <SelectTrigger size="sm" className="w-40" data-testid="agent-activity-severity-filter">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-2">
          <RuntimeOverviewPanel />
          <PinnedErrorPanel />
          <ActivityTimeline />
        </CardContent>
      </Card>
    </aside>
  )
}
