import type { ReactNode } from 'react'
import { ArrowRight, FileText, GitBranch, RefreshCw } from 'lucide-react'

import { cn } from '../../lib/cn'
import type { GitFileChange, GitSnapshot } from '../../types/git'
import { Button } from '../ui/button'
import { LeftSection } from './LeftSection'
import { LEFT_PANEL_TYPOGRAPHY } from './left-typography'

export type ChangesPreviewState = 0 | 1 | 2 | 3

type ChangesTabProps = {
  git: GitSnapshot
  previewState?: ChangesPreviewState
}

type DiffStats = {
  added?: number
  removed?: number
}

type ChangesView = {
  changedCount: number
  summary: string
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  showUnstageAction: boolean
  showArchiveAction: boolean
  showCreatePrAction: boolean
  showMergeAction: boolean
  showConnectRemoteAction: boolean
  showPullRequestAuthPrompt: boolean
}

const PREVIEW_STATE_REMAP: Record<ChangesPreviewState, ChangesPreviewState> = {
  0: 2,
  1: 3,
  2: 1,
  3: 0
}

const DIFF_BY_STATE: Record<GitFileChange['state'], DiffStats> = {
  added: { added: 42 },
  modified: { added: 3, removed: 9 },
  deleted: { removed: 15 },
  renamed: { added: 2, removed: 1 },
  untracked: { added: 6 }
}

function getFileParts(path: string): { name: string; directory: string } {
  const pathSegments = path.split('/')
  const name = pathSegments[pathSegments.length - 1] ?? path
  const directory = pathSegments.slice(0, -1).join('/')
  return { name, directory }
}

function getChangesView(previewState: ChangesPreviewState, git: GitSnapshot): ChangesView {
  const mappedPreviewState = PREVIEW_STATE_REMAP[previewState] ?? 0
  const changedCount = git.staged.length + git.unstaged.length

  if (mappedPreviewState === 1) {
    return {
      changedCount,
      summary: changedCount > 0 ? `${changedCount} files changed in Space` : 'No changes yet',
      staged: [],
      unstaged: [...git.unstaged, ...git.staged],
      showUnstageAction: false,
      showArchiveAction: false,
      showCreatePrAction: false,
      showMergeAction: true,
      showConnectRemoteAction: true,
      showPullRequestAuthPrompt: false
    }
  }

  if (mappedPreviewState === 2) {
    return {
      changedCount: 0,
      summary: 'No changes yet',
      staged: [],
      unstaged: [],
      showUnstageAction: false,
      showArchiveAction: true,
      showCreatePrAction: false,
      showMergeAction: false,
      showConnectRemoteAction: false,
      showPullRequestAuthPrompt: false
    }
  }

  if (mappedPreviewState === 3) {
    return {
      changedCount: 0,
      summary: 'No changes yet',
      staged: [],
      unstaged: [],
      showUnstageAction: false,
      showArchiveAction: false,
      showCreatePrAction: true,
      showMergeAction: true,
      showConnectRemoteAction: false,
      showPullRequestAuthPrompt: false
    }
  }

  return {
    changedCount,
    summary: changedCount > 0 ? `${changedCount} files changed in Space` : 'No changes yet',
    staged: git.staged,
    unstaged: git.unstaged,
    showUnstageAction: git.unstaged.length > 0 && git.staged.length > 0,
    showArchiveAction: false,
    showCreatePrAction: false,
    showMergeAction: true,
    showConnectRemoteAction: true,
    showPullRequestAuthPrompt: false
  }
}

export function getChangesTabCount(previewState: ChangesPreviewState, git: GitSnapshot): number {
  return getChangesView(previewState, git).changedCount
}

function renderFileChanges(items: GitFileChange[]) {
  if (items.length === 0) {
    return null
  }

  return (
    <ul className="mt-2 grid gap-1.5">
      {items.map((item) => {
        const diff = DIFF_BY_STATE[item.state]
        const file = getFileParts(item.path)

        return (
          <li
            key={`${item.state}:${item.path}`}
            className="flex items-start gap-2 text-sm"
          >
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm text-foreground/95"
                title={item.path}
              >
                {file.name}
              </p>
              {file.directory ? (
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={file.directory}
                >
                  {file.directory}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs tabular-nums">
              {diff.added ? <span className="text-emerald-400">+{diff.added}</span> : null}
              {diff.removed ? <span className="text-rose-400">-{diff.removed}</span> : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function renderSectionHeading(label: string, toneClassName: string, rightContent?: ReactNode) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        <span className={cn('h-1.5 w-1.5 rounded-full', toneClassName)} />
        <span>{label}</span>
      </p>
      {rightContent}
    </div>
  )
}

export function ChangesTab({ git, previewState = 0 }: ChangesTabProps) {
  const view = getChangesView(previewState, git)

  return (
    <LeftSection
      title="Changes"
      description="View and accept file changes."
      addActionLabel="Add change"
    >
      <p className={LEFT_PANEL_TYPOGRAPHY.bodyMuted}>Your code lives in:</p>
      <div className="mt-1 flex items-center gap-2 text-sm text-foreground/95">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span
          className="max-w-[11rem] truncate"
          title={git.branch}
        >
          {git.branch}
        </span>
        <span className="h-px flex-1 bg-border/70" />
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>main</span>
      </div>
      <p className={cn('mt-1', LEFT_PANEL_TYPOGRAPHY.meta)}>and will be merged into:</p>

      <p className={cn('mt-4 flex items-center gap-2', LEFT_PANEL_TYPOGRAPHY.bodyMuted)}>
        <RefreshCw className="h-3.5 w-3.5" />
        <span>{view.summary}</span>
      </p>

      <div className="relative mt-4 border-y border-border/40">
        <span
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-border/45"
          style={{ left: '-0.1rem' }}
        />
        <div className="relative border-b border-border/40 py-3">
          <div className="relative pl-3">
            {renderSectionHeading(
              'UNSTAGED / NEW',
              view.unstaged.length > 0 ? 'bg-amber-400' : 'bg-muted-foreground/70',
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Auto-commit</span>
                <span className="inline-flex h-3.5 w-6 items-center rounded-full bg-emerald-400/90 px-0.5">
                  <span className="ml-auto h-2.5 w-2.5 rounded-full bg-background" />
                </span>
              </div>
            )}
            {renderFileChanges(view.unstaged)}
            {view.unstaged.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                >
                  Stage all
                </Button>
                {view.showUnstageAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                  >
                    Unstage all
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative border-b border-border/40 py-3">
          <div className="relative pl-3">
            {renderSectionHeading('STAGED / APPROVED', view.staged.length > 0 ? 'bg-emerald-400' : 'bg-muted-foreground/70')}
            {renderFileChanges(view.staged)}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={view.staged.length === 0}
              >
                Commit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={view.staged.length === 0}
              >
                Export
              </Button>
            </div>
          </div>
        </div>

        <div className="relative py-3">
          <div className="relative pl-3">
            {renderSectionHeading('COMMITS', 'bg-muted-foreground/70')}
            <div className="mt-2 h-px bg-border/45" />
            {!view.showArchiveAction ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {view.showCreatePrAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                  >
                    Create PR
                  </Button>
                ) : null}
                {view.showMergeAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                  >
                    Merge
                  </Button>
                ) : null}
                {view.showConnectRemoteAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                  >
                    Connect Remote
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {view.showPullRequestAuthPrompt ? (
        <div className="mt-3 border-y border-border/40 py-3">
          <div className="relative pl-3">
            {renderSectionHeading('PULL REQUESTS', 'bg-muted-foreground/70')}
            <p className={cn('mt-2', LEFT_PANEL_TYPOGRAPHY.bodyMuted)}>Please authenticate with Augment first.</p>
            <p className={cn('mt-1', LEFT_PANEL_TYPOGRAPHY.bodyMuted)}>Run auggie login in your terminal.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
            >
              Merge
            </Button>
          </div>
        </div>
      ) : null}

      {view.showArchiveAction ? (
        <div className="mt-3 border-t border-border/40 pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
          >
            Archive and start new space
          </Button>
          <p className={cn('mt-2 text-center', LEFT_PANEL_TYPOGRAPHY.bodyMuted)}>
            Continue working on this repo in a fresh workspace
          </p>
        </div>
      ) : null}
    </LeftSection>
  )
}
