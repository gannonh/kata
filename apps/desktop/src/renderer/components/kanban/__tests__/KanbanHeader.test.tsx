// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { WorkflowBoardSnapshot, WorkflowContextSnapshot } from '@shared/types'
import { KanbanHeader } from '../KanbanHeader'

function workflowContext(): WorkflowContextSnapshot {
  return {
    mode: 'execution',
    reason: 'tracker_configured_board_pending',
    trackerConfigured: true,
    boardAvailable: true,
    updatedAt: new Date().toISOString(),
  }
}

function board(): WorkflowBoardSnapshot {
  return {
    backend: 'github',
    fetchedAt: new Date().toISOString(),
    status: 'fresh',
    source: {
      projectId: 'github:gannonh/kata',
      trackerKind: 'github',
      githubStateMode: 'projects_v2',
      repoOwner: 'gannonh',
      repoName: 'kata',
    },
    activeMilestone: {
      id: 'github-project:17',
      name: 'GitHub Project #17',
    },
    columns: [],
    poll: {
      status: 'success',
      backend: 'github',
      lastAttemptAt: new Date().toISOString(),
    },
  }
}

function renderHeader() {
  render(
    <KanbanHeader
      board={board()}
      loading={false}
      refreshing={false}
      selectedScope="milestone"
      collapsedColumnCount={0}
      hiddenCardCount={0}
      hasExplicitColumnOverrides={false}
      rightPaneOverride={null}
      paneResolution={{ mode: 'kanban', source: 'automatic', reason: 'tracker_configured_board_pending' }}
      workflowContext={workflowContext()}
      refreshDisabled={false}
      onScopeChange={vi.fn()}
      onExpandAllColumns={vi.fn()}
      onResetColumnOverrides={vi.fn()}
      onExpandAllCards={vi.fn()}
      onCollapseAllCards={vi.fn()}
      onOpenAgentActivityView={vi.fn()}
      onRefresh={vi.fn()}
      onClearOverride={vi.fn()}
    />,
  )
}

describe('KanbanHeader', () => {
  test('uses labeled icon buttons for right pane navigation and refresh actions', () => {
    renderHeader()

    expect(screen.getByRole('button', { name: 'Open Symphony view' }).textContent).toContain('Symphony')
    expect(screen.getByRole('button', { name: 'Refresh workflow board' }).textContent).toContain('Refresh')
  })
})
