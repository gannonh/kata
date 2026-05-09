import { Activity, Kanban, RotateCcw } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  agentActivityModeAtom,
  agentActivitySeverityFilterAtom,
  agentActivitySnapshotAtom,
  agentActivitySourceFilterAtom,
  setAgentActivityModeAtom,
} from '@/atoms/agent-activity'
import { clearRightPaneOverrideAtom, setRightPaneOverrideAtom } from '@/atoms/right-pane'
import { RightPaneHeader } from '@/components/app-shell/RightPaneHeader'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ActivityTimeline } from './ActivityTimeline'
import { PinnedEventPanel } from './PinnedEventPanel'
import { RuntimeOverviewPanel } from './RuntimeOverviewPanel'

function formatSourceFilter(value: string): string {
  if (value === 'all') {
    return 'All sources'
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatSeverityFilter(value: string): string {
  if (value === 'all') {
    return 'All severities'
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function AgentActivityPane() {
  const mode = useAtomValue(agentActivityModeAtom)
  const snapshot = useAtomValue(agentActivitySnapshotAtom)
  const sourceFilter = useAtomValue(agentActivitySourceFilterAtom)
  const severityFilter = useAtomValue(agentActivitySeverityFilterAtom)
  const setMode = useSetAtom(setAgentActivityModeAtom)
  const setSourceFilter = useSetAtom(agentActivitySourceFilterAtom)
  const setSeverityFilter = useSetAtom(agentActivitySeverityFilterAtom)
  const setRightPaneOverride = useSetAtom(setRightPaneOverrideAtom)
  const clearRightPaneOverride = useSetAtom(clearRightPaneOverrideAtom)
  const streamCount = mode === 'events' ? snapshot.events.length : snapshot.verbose.length

  return (
    <aside className="flex h-full flex-col bg-muted/40" data-testid="agent-activity-pane">
      <RightPaneHeader
        eyebrow="Symphony"
        title={`${mode === 'events' ? 'Events' : 'Verbose'} timeline · ${streamCount} ${streamCount === 1 ? 'event' : 'events'}`}
        data-testid="agent-activity-header"
        actions={
          <>
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
              <ToggleGroupItem value="events" className="h-7 px-2 text-[11px]" data-testid="agent-activity-mode-events">
                Events
              </ToggleGroupItem>
              <ToggleGroupItem value="verbose" className="h-7 px-2 text-[11px]" data-testid="agent-activity-mode-verbose">
                Verbose
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="mr-1 flex items-center rounded-md border border-border/70 bg-background/70 p-0.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[11px]"
                aria-label="Open Kanban view"
                onClick={() => setRightPaneOverride('kanban')}
                data-testid="agent-activity-open-kanban"
              >
                <Kanban className="size-3.5" />
                Kanban
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 gap-1 px-2 text-[11px]"
                aria-label="Symphony view"
                aria-current="page"
              >
                <Activity className="size-3.5" />
                Symphony
              </Button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px]"
              aria-label="Return to auto mode"
              onClick={() => clearRightPaneOverride()}
              data-testid="agent-activity-return-auto"
            >
              <RotateCcw className="size-3.5" />
              Auto
            </Button>
          </>
        }
      />

      <Separator />

      <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        Mode: {mode === 'events' ? 'Events' : 'Verbose'} · Source: {formatSourceFilter(sourceFilter)} · Severity:{' '}
        {formatSeverityFilter(severityFilter)} · Snapshot: {new Date(snapshot.generatedAt).toLocaleTimeString()}
      </div>

      <div className="flex items-center gap-2 border-b border-border bg-background/80 px-4 py-2">
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

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <RuntimeOverviewPanel />
        <PinnedEventPanel />
        <ActivityTimeline />
      </div>
    </aside>
  )
}
