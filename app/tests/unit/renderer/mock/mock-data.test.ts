import { describe, expect, it } from 'vitest'

import { mockAgents } from '../../../../src/renderer/mock/agents'
import { mockFiles } from '../../../../src/renderer/mock/files'
import { mockGit } from '../../../../src/renderer/mock/git'
import { mockProject } from '../../../../src/renderer/mock/project'

describe('renderer mock data contracts', () => {
  it('defines orchestrator and sub-agent fixtures', () => {
    expect(mockAgents).toHaveLength(3)
    expect(mockAgents[0]?.id).toBe('orchestrator')
    expect(mockAgents[0]?.status).toBe('running')
    expect(mockAgents[0]?.tokenUsage.total).toBe(
      (mockAgents[0]?.tokenUsage.prompt ?? 0) + (mockAgents[0]?.tokenUsage.completion ?? 0)
    )
  })

  it('defines project spec tasks and acceptance criteria fixtures', () => {
    expect(mockProject.id).toBe('phase-1')
    expect(mockProject.tasks).toHaveLength(2)
    expect(mockProject.tasks.some((task) => task.status === 'in_progress')).toBe(true)
    expect(mockProject.acceptanceCriteria.some((criterion) => criterion.met)).toBe(true)
  })

  it('defines git snapshot fixtures for staged and unstaged files', () => {
    expect(mockGit.branch).toContain('wave-2A')
    expect(mockGit.ahead).toBeGreaterThanOrEqual(0)
    expect(mockGit.staged[0]?.state).toBe('added')
    expect(mockGit.unstaged.map((file) => file.state)).toContain('modified')
  })

  it('defines a recursive file tree fixture', () => {
    const srcNode = mockFiles[0]
    const rendererNode = srcNode?.children?.[0]
    const componentsNode = rendererNode?.children?.[0]
    const sharedNode = componentsNode?.children?.[0]

    expect(srcNode?.type).toBe('directory')
    expect(sharedNode?.name).toBe('shared')
    expect(sharedNode?.children?.some((node) => node.name === 'TabBar.tsx')).toBe(true)
    expect(sharedNode?.children?.every((node) => node.path.startsWith('src/renderer/components/shared/'))).toBe(true)
  })
})
