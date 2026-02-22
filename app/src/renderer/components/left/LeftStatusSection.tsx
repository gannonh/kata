import { MoreHorizontal } from 'lucide-react'

import type { ProjectTask } from '../../types/project'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { LEFT_STATUS_ROW_CAP, type SegmentTone, buildLeftStatusProgress } from './left-status-progress'

const FALLBACK_TITLE = 'Build Kata Cloud MVP'
const FALLBACK_SUBTITLE = 'gannonh/kata-cloud'

type LeftStatusSectionProps = {
  title?: string
  subtitle?: string
  tasks: ProjectTask[]
  onCyclePreviewState?: () => void
  onSelectPreviewState?: (state: 1 | 2 | 3) => void
  previewState?: 0 | 1 | 2 | 3
}

const SEGMENT_TONE_CLASS: Record<SegmentTone, string> = {
  done: 'bg-status-done/85',
  in_progress: 'bg-status-in-progress/85',
  blocked: 'bg-status-blocked/85',
  todo: 'bg-muted'
}

function segmentToneClass(segment: SegmentTone): string {
  return SEGMENT_TONE_CLASS[segment] ?? 'bg-muted'
}

function previewToneClass(state: 1 | 2 | 3, isActive: boolean) {
  if (state === 1) {
    return isActive
      ? 'border-status-todo/60 bg-status-todo/20 text-status-todo'
      : 'border-status-todo/45 text-status-todo'
  }

  if (state === 2) {
    return isActive
      ? 'border-status-in-progress/60 bg-status-in-progress/20 text-status-in-progress'
      : 'border-status-in-progress/45 text-status-in-progress'
  }

  return isActive
    ? 'border-status-done/60 bg-status-done/20 text-status-done'
    : 'border-status-done/45 text-status-done'
}

export function LeftStatusSection({
  title,
  subtitle,
  tasks,
  onCyclePreviewState,
  onSelectPreviewState,
  previewState = 0
}: LeftStatusSectionProps) {
  const progress = buildLeftStatusProgress(tasks)
  const segmentCount = Math.max(1, Math.min(progress.liveSegments.length, LEFT_STATUS_ROW_CAP))
  const isInteractive = typeof onCyclePreviewState === 'function'

  return (
    <section
      aria-label="Left panel status"
      className="border-y border-border px-4 pb-3 pt-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold leading-tight">{title ?? FALLBACK_TITLE}</h2>
          <p className="truncate text-sm text-muted-foreground">{subtitle ?? FALLBACK_SUBTITLE}</p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Status section options"
          className="-mr-2"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 grid gap-2">
        {progress.rollups.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {progress.rollups.map((rollup, index) => (
              <span
                key={`${rollup.label}-${index}`}
                className="inline-flex w-fit rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {rollup.label}
              </span>
            ))}
          </div>
        ) : null}

        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${segmentCount}, minmax(0, 1fr))` }}
        >
          {progress.liveSegments.map((segment, index) => (
            <span
              key={`${segment}-${index}`}
              data-segment-status={segment}
              className={cn('h-2 rounded-sm', segmentToneClass(segment))}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {isInteractive ? (
          <button
            type="button"
            aria-label="Cycle status preview state"
            aria-pressed={previewState > 0}
            onClick={onCyclePreviewState}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onCyclePreviewState?.()
              }
            }}
            className={cn(
              'rounded-sm text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'max-w-[70%] truncate text-left'
            )}
          >
            {progress.message}
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">{progress.message}</p>
        )}
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((state) => {
            const typedState = state as 1 | 2 | 3
            const isActive = previewState === typedState

            return (
              <button
                key={state}
                type="button"
                className={cn(
                  'h-5 min-w-5 rounded border px-1 text-[11px] leading-none transition-colors',
                  previewToneClass(typedState, isActive)
                )}
                aria-label={`Show preview state ${state}`}
                aria-pressed={isActive}
                onClick={() => onSelectPreviewState?.(typedState)}
              >
                {state}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
