import { describe, expect, test } from 'vitest'
import type { PlanningArtifactState } from '@/atoms/planning'
import { formatMilestoneTitle, getPrimaryPlanningArtifacts } from '../ArtifactTabs'

function makeArtifact(overrides: Partial<PlanningArtifactState>): PlanningArtifactState {
  return {
    artifactKey: overrides.artifactKey ?? Math.random().toString(36).slice(2),
    title: overrides.title ?? 'Untitled',
    content: overrides.content ?? '',
    updatedAt: overrides.updatedAt ?? '2026-04-25T00:00:00.000Z',
    scope: overrides.scope ?? 'project',
    projectId: overrides.projectId,
    issueId: overrides.issueId,
    artifactType: overrides.artifactType,
    sliceData: overrides.sliceData,
  }
}

describe('ArtifactTabs', () => {
  test('getPrimaryPlanningArtifacts prefers the active milestone roadmap while keeping global docs', () => {
    const artifacts = [
      makeArtifact({ artifactKey: 'm001', title: '[M001] Earlier milestone', artifactType: 'roadmap', updatedAt: '2026-04-24T00:00:00.000Z' }),
      makeArtifact({ artifactKey: 'm002', title: '[M002] Active milestone', artifactType: 'roadmap', updatedAt: '2026-04-23T00:00:00.000Z' }),
      makeArtifact({ artifactKey: 'req', title: 'REQUIREMENTS', artifactType: 'requirements', updatedAt: '2026-04-25T00:00:00.000Z' }),
      makeArtifact({ artifactKey: 'dec', title: 'DECISIONS', artifactType: 'decisions', updatedAt: '2026-04-25T00:00:00.000Z' }),
    ]

    const primary = getPrimaryPlanningArtifacts(artifacts, 'M002')

    expect(primary.map((artifact) => artifact.artifactKey)).toEqual(['m002', 'req', 'dec'])
  })

  test('formats KATA-DOC milestone roadmap titles for display', () => {
    expect(formatMilestoneTitle('KATA-DOC: M001-ROADMAP')).toBe('M001: Milestone')
  })
})
