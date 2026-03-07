/**
 * GitStatusBadge - Display current git branch in workspace UI
 *
 * Requirements:
 * - GIT-01: Show current branch name
 * - GIT-02: Show nothing when not a git repository
 * - GIT-03: Update when switching workspaces (via useGitStatus hook)
 * - Handle detached HEAD state gracefully (show short commit hash)
 */

import * as React from 'react'
import { GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGitStatus } from '@/hooks/useGitStatus'
import { Tooltip, TooltipTrigger, TooltipContent } from '@craft-agent/ui'

interface GitStatusBadgeProps {
  /** Current workspace ID */
  workspaceId: string | null
  /** Absolute path to workspace root directory */
  workspaceRootPath: string | null
  /** Additional CSS classes */
  className?: string
  /** Whether to show in collapsed/icon-only mode */
  isCollapsed?: boolean
}

/**
 * Git status badge showing current branch name.
 * Returns null (renders nothing) when:
 * - workspaceId or workspaceRootPath is null
 * - Directory is not a git repository
 */
export function GitStatusBadge({
  workspaceId,
  workspaceRootPath,
  className,
  isCollapsed = false,
}: GitStatusBadgeProps) {
  const { gitState, isLoading } = useGitStatus(workspaceId, workspaceRootPath)

  // GIT-02: Show nothing for non-git directories
  if (!gitState || !gitState.isRepo) {
    return null
  }

  // Determine display text
  let displayText: string
  let tooltipText: string

  if (gitState.isDetached) {
    // Detached HEAD: show short commit hash
    displayText = gitState.detachedHead ?? 'detached'
    tooltipText = `Detached HEAD at ${gitState.detachedHead ?? 'unknown'}`
  } else {
    // Normal branch: show branch name
    displayText = gitState.branch ?? ''
    tooltipText = `Branch: ${gitState.branch}`
  }

  // Don't render if no text to show
  if (!displayText) {
    return null
  }

  // Collapsed mode: icon only with tooltip
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-testid="git-status-badge"
            data-git-branch={displayText}
            data-git-detached={gitState.isDetached}
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-md',
              'text-muted-foreground hover:bg-foreground/5 transition-colors',
              className
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-mono text-xs">{displayText}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  // Expanded mode: icon + branch name
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-testid="git-status-badge"
          data-git-branch={displayText}
          data-git-detached={gitState.isDetached}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md',
            'text-xs text-muted-foreground',
            'hover:bg-foreground/5 transition-colors',
            'max-w-[140px] overflow-hidden',
            className
          )}
        >
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono">{displayText}</span>
          {isLoading && (
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
