/**
 * DaemonStatusIndicator - Shows daemon process status
 *
 * A small colored dot that indicates the daemon's state:
 * - Green (pulse): Running
 * - Blue: Starting / Stopping
 * - Red: Error
 * - Yellow: Paused
 * - Gray: Stopped
 *
 * Hovering shows a tooltip with the state description.
 * Follows the SourceStatusIndicator pattern.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@craft-agent/ui'
import type { DaemonManagerState } from '../../../shared/types'

export interface DaemonStatusIndicatorProps {
  /** Current daemon state */
  state: DaemonManagerState
  /** Size variant */
  size?: 'xs' | 'sm' | 'md'
  /** Additional className */
  className?: string
}

const STATE_CONFIG: Record<DaemonManagerState, {
  color: string
  pulseColor: string
  label: string
  description: string
}> = {
  running: {
    color: 'bg-success',
    pulseColor: 'bg-success/80',
    label: 'Running',
    description: 'Daemon is running and processing channel messages',
  },
  starting: {
    color: 'bg-info',
    pulseColor: 'bg-info/80',
    label: 'Starting',
    description: 'Daemon is starting up',
  },
  stopping: {
    color: 'bg-info',
    pulseColor: 'bg-info/80',
    label: 'Stopping',
    description: 'Daemon is shutting down',
  },
  error: {
    color: 'bg-destructive',
    pulseColor: 'bg-destructive/80',
    label: 'Error',
    description: 'Daemon encountered an error and will attempt to restart',
  },
  paused: {
    color: 'bg-warning',
    pulseColor: 'bg-warning/80',
    label: 'Paused',
    description: 'Daemon paused after repeated failures',
  },
  stopped: {
    color: 'bg-foreground/40',
    pulseColor: 'bg-foreground/30',
    label: 'Stopped',
    description: 'Daemon is not running',
  },
}

const SIZE_CONFIG: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
}

export function DaemonStatusIndicator({
  state,
  size = 'sm',
  className,
}: DaemonStatusIndicatorProps) {
  const config = STATE_CONFIG[state]
  const sizeClass = SIZE_CONFIG[size]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'relative inline-flex shrink-0',
            className
          )}
        >
          {/* Pulse animation for running state */}
          {state === 'running' && (
            <span
              className={cn(
                'absolute inline-flex rounded-full opacity-75 animate-ping',
                config.pulseColor,
                sizeClass
              )}
              style={{ animationDuration: '2s' }}
            />
          )}
          {/* Status dot */}
          <span
            className={cn(
              'relative inline-flex rounded-full',
              config.color,
              sizeClass
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{config.label}</span>
          <span className="text-foreground/60">{config.description}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
