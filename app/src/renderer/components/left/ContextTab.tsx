import { Check, List } from 'lucide-react'

import type { ProjectSpec } from '../../types/project'
import { LeftSection } from './LeftSection'
import { LEFT_PANEL_TYPOGRAPHY } from './left-typography'

export type ContextPreviewState = 0 | 1 | 2 | 3

type ContextTabProps = {
  project: ProjectSpec
  previewState?: ContextPreviewState
}

type ContextTaskStatus = 'todo' | 'in_progress' | 'done'
type ContextBadgeTone = 'violet' | 'lime' | 'amber' | 'emerald'

type ContextTask = {
  id: string
  title: string
  status: ContextTaskStatus
  badgeTone?: ContextBadgeTone
}

type ContextState = {
  tasks: ContextTask[]
  showNotes: boolean
  highlightTeamNote: boolean
}

const BASE_TASKS: ContextTask[] = [
  { id: 'spec-scaffold-rust', title: 'Scaffold Rust project with dependencies', status: 'todo' },
  { id: 'spec-github-client', title: 'Implement GitHub API client module', status: 'todo' },
  { id: 'spec-state-events', title: 'Build app state and event handling', status: 'todo' },
  { id: 'spec-ratatui', title: 'Build TUI rendering with Ratatui widgets', status: 'todo' },
  { id: 'spec-main-wire', title: 'Wire everything together in main and test end-to-end', status: 'todo' }
]

const ACTIVE_TASKS: ContextTask[] = [
  { id: 'task-bootstrap', title: 'Bootstrap desktop shell and workspace state', status: 'in_progress', badgeTone: 'violet' },
  { id: 'task-space-create', title: 'Implement space creation and metadata management', status: 'in_progress', badgeTone: 'amber' },
  { id: 'task-branch-lifecycle', title: 'Add git branch and worktree lifecycle for spaces', status: 'in_progress', badgeTone: 'emerald' },
  { id: 'task-spec-panel', title: 'Build spec note panel with autosave and comment threads', status: 'in_progress', badgeTone: 'violet' },
  { id: 'task-task-block', title: 'Implement task block parsing and task-note conversion', status: 'done', badgeTone: 'violet' },
  { id: 'task-orchestrator-loop', title: 'Ship orchestrator planning loop and specialist task delegation', status: 'todo' },
  { id: 'task-changes-tab', title: 'Build changes tab with diff inspection and selective staging', status: 'todo' },
  { id: 'task-pr-workflow', title: 'Add GitHub PR creation workflow in Changes tab', status: 'todo' },
  { id: 'task-browser-preview', title: 'Add in-app browser preview for local development', status: 'todo' },
  { id: 'task-context-engine', title: 'Integrate context engine adapter and initial providers', status: 'todo' },
  { id: 'task-model-runtime', title: 'Implement real model provider runtime and authentication', status: 'todo' }
]

const STATE_MAP: Record<ContextPreviewState, ContextState> = {
  0: {
    tasks: BASE_TASKS,
    showNotes: false,
    highlightTeamNote: false
  },
  1: {
    tasks: BASE_TASKS,
    showNotes: true,
    highlightTeamNote: true
  },
  2: {
    tasks: ACTIVE_TASKS,
    showNotes: false,
    highlightTeamNote: false
  },
  3: {
    tasks: BASE_TASKS,
    showNotes: true,
    highlightTeamNote: false
  }
}

const BADGE_TONE_CLASS: Record<ContextBadgeTone, string> = {
  violet: 'bg-violet-400/95 text-violet-950',
  lime: 'bg-lime-300/95 text-lime-950',
  amber: 'bg-yellow-300/95 text-yellow-950',
  emerald: 'bg-emerald-300/95 text-emerald-950'
}

function ContextStatusMarker({ status }: { status: ContextTaskStatus }) {
  if (status === 'done') {
    return (
      <span
        data-context-task-status={status}
        className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-status-done text-background"
      >
        <Check className="h-2.5 w-2.5" />
      </span>
    )
  }

  if (status === 'in_progress') {
    return (
      <span
        data-context-task-status={status}
        className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-status-in-progress text-status-in-progress"
      >
        <span className="h-1.5 w-0.5 rounded-full bg-current" />
      </span>
    )
  }

  return (
    <span
      data-context-task-status={status}
      className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/70"
    />
  )
}

function ContextBadge({ tone }: { tone: ContextBadgeTone }) {
  return (
    <span
      data-context-task-badge
      className={`inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold ${BADGE_TONE_CLASS[tone]}`}
    >
      ■
    </span>
  )
}

function contextStateForPreview(previewState: ContextPreviewState): ContextState {
  return STATE_MAP[previewState] ?? STATE_MAP[0]
}

export function getContextTabCount(previewState: ContextPreviewState): number {
  const state = contextStateForPreview(previewState)
  const notesCount = state.showNotes ? 3 : 0
  return 1 + state.tasks.length + notesCount
}

const noop = () => {}

export function ContextTab({ project, previewState = 0 }: ContextTabProps) {
  const state = contextStateForPreview(previewState)

  return (
    <LeftSection
      title="Context"
      description=""
      addActionLabel="Add context"
      onAddAction={noop}
    >
      <div
        data-testid="context-tab"
        data-context-state={previewState}
        data-context-project={project.id}
        className="space-y-1.5"
      >
        <p className={LEFT_PANEL_TYPOGRAPHY.listItem}>
          Project specs, tasks, and notes are stored as markdown files in{' '}
          <code className="whitespace-nowrap rounded border border-border/70 bg-muted/35 px-0.5 py-px font-mono text-[10px] leading-none text-foreground/95">
            ./notes
          </code>
        </p>

        <div
          data-testid="context-spec-section"
          className="space-y-1 pt-2"
        >
          <p className={`flex items-start gap-2 ${LEFT_PANEL_TYPOGRAPHY.listItemStrong}`}>
            <List className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">Spec</span>
          </p>

          <div className="space-y-1 pl-5">
            {state.tasks.map((task) => (
              <p
                key={task.id}
                className={`flex items-start gap-2 ${LEFT_PANEL_TYPOGRAPHY.listItem}`}
              >
                <ContextStatusMarker status={task.status} />
                <span className="min-w-0 flex-1">{task.title}</span>
                {task.badgeTone ? (
                  <ContextBadge tone={task.badgeTone} />
                ) : null}
              </p>
            ))}
          </div>
        </div>

        {state.showNotes ? (
          <div className="space-y-1 pt-1">
            <p
              data-testid="context-notes-heading"
              className={`flex items-center gap-2 ${LEFT_PANEL_TYPOGRAPHY.listItemStrong}`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Notes</span>
            </p>
            <p
              data-testid="context-note-row-team-brainstorm-2-22-26"
              data-context-note-selected={state.highlightTeamNote}
              className={[
                `flex items-center gap-2 border px-3 py-1.5 ${LEFT_PANEL_TYPOGRAPHY.listItem}`,
                state.highlightTeamNote ? 'border-border/70 bg-muted/25' : 'border-transparent'
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="w-2 text-center text-muted-foreground/80"
              >
                -
              </span>
              <span>Team Brainstorm - 2/22/26</span>
            </p>
            <p
              data-testid="context-note-row-scratchpad"
              data-context-note-selected="false"
              className={`flex items-center gap-2 border border-transparent px-3 py-1.5 ${LEFT_PANEL_TYPOGRAPHY.listItem}`}
            >
              <span
                aria-hidden="true"
                className="w-2 text-center text-muted-foreground/80"
              >
                -
              </span>
              <span>Scratchpad</span>
            </p>
          </div>
        ) : null}
      </div>
    </LeftSection>
  )
}
