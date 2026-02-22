import { Check, List } from 'lucide-react'

import { cn } from '../../lib/cn'
import type { ProjectSpec, TaskStatus } from '../../types/project'
import { LeftSection } from './LeftSection'
import { LEFT_PANEL_TYPOGRAPHY } from './left-typography'

export type ContextPreviewState = 0 | 1 | 2 | 3

type ContextTabProps = {
  project: ProjectSpec
  previewState?: ContextPreviewState
}

type ContextTaskStatus = TaskStatus
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

const PREVIEW_STATE_MAP: Record<ContextPreviewState, Omit<ContextState, 'tasks'>> = {
  0: {
    showNotes: false,
    highlightTeamNote: false
  },
  1: {
    showNotes: true,
    highlightTeamNote: true
  },
  2: {
    showNotes: false,
    highlightTeamNote: false
  },
  3: {
    showNotes: true,
    highlightTeamNote: false
  }
}

const BADGE_TONE_CLASS: Record<ContextBadgeTone, string> = {
  violet: 'bg-violet-400/95 text-violet-950',
  lime: 'bg-lime-300/95 text-lime-950',
  amber: 'bg-amber-300/95 text-amber-950',
  emerald: 'bg-emerald-300/95 text-emerald-950'
}

const NOTE_ROWS = ['Team Brainstorm - 2/22/26', 'Scratchpad'] as const
export const NOTES_SECTION_SIZE = 1 + NOTE_ROWS.length

function badgeToneForStatus(status: ContextTaskStatus): ContextBadgeTone | undefined {
  if (status === 'in_progress') {
    return 'violet'
  }

  if (status === 'done') {
    return 'emerald'
  }

  if (status === 'blocked') {
    return 'amber'
  }

  return undefined
}

function contextTasksFromProject(project: ProjectSpec): ContextTask[] {
  return project.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    badgeTone: badgeToneForStatus(task.status)
  }))
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

  if (status === 'blocked') {
    return (
      <span
        data-context-task-status={status}
        className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-status-blocked text-status-blocked"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
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
      className={cn(
        'inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold',
        BADGE_TONE_CLASS[tone]
      )}
    >
      ■
    </span>
  )
}

function contextStateForPreview(project: ProjectSpec, previewState: ContextPreviewState): ContextState {
  const previewConfig = PREVIEW_STATE_MAP[previewState] ?? PREVIEW_STATE_MAP[0]
  return {
    tasks: contextTasksFromProject(project),
    showNotes: previewConfig.showNotes,
    highlightTeamNote: previewConfig.highlightTeamNote
  }
}

/**
 * Returns the visible row count for the Context tab trigger tooltip badge.
 */
export function getContextTabCount(previewState: ContextPreviewState, taskCount = 0): number {
  const previewConfig = PREVIEW_STATE_MAP[previewState] ?? PREVIEW_STATE_MAP[0]
  const notesCount = previewConfig.showNotes ? NOTES_SECTION_SIZE : 0
  return 1 + taskCount + notesCount
}

/**
 * Renders project context rows plus optional notes rows for the selected preview state.
 */
export function ContextTab({ project, previewState = 0 }: ContextTabProps) {
  const state = contextStateForPreview(project, previewState)

  return (
    <LeftSection
      title="Context"
      addActionLabel="Add context"
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
          <p className={cn('flex items-start gap-2', LEFT_PANEL_TYPOGRAPHY.listItemStrong)}>
            <List className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">Spec</span>
          </p>

          <div className="space-y-1 pl-5">
            {state.tasks.map((task) => (
              <p
                key={task.id}
                className={cn('flex items-start gap-2', LEFT_PANEL_TYPOGRAPHY.listItem)}
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
          <div className="space-y-0.5 pt-1">
            <p
              data-testid="context-notes-heading"
              className={cn('flex items-center gap-2', LEFT_PANEL_TYPOGRAPHY.listItemStrong)}
            >
              <List className="h-3.5 w-3.5" />
              <span>Notes</span>
            </p>
            <p
              data-testid="context-note-row-team-brainstorm-2-22-26"
              data-context-note-selected={state.highlightTeamNote}
              className={cn(
                'flex items-center gap-2 border px-3 py-0.5 text-sm leading-4 text-muted-foreground',
                state.highlightTeamNote ? 'border-border/70 bg-muted/25' : 'border-transparent'
              )}
            >
              <span
                aria-hidden="true"
                className="w-2 text-center text-muted-foreground/80"
              >
                -
              </span>
              <span>{NOTE_ROWS[0]}</span>
            </p>
            <p
              data-testid="context-note-row-scratchpad"
              data-context-note-selected={false}
              className="flex items-center gap-2 border border-transparent px-3 py-0.5 text-sm leading-4 text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="w-2 text-center text-muted-foreground/80"
              >
                -
              </span>
              <span>{NOTE_ROWS[1]}</span>
            </p>
          </div>
        ) : null}
      </div>
    </LeftSection>
  )
}
