import { afterEach, describe, expect, it } from 'vitest'

import { mockAgents } from '../../../../src/renderer/mock/agents'
import { mockFiles } from '../../../../src/renderer/mock/files'
import { mockGit } from '../../../../src/renderer/mock/git'
import { mockMessages } from '../../../../src/renderer/mock/messages'
import { getMockProject, mockProject } from '../../../../src/renderer/mock/project'

const LEFT_STATUS_SCENARIO_KEY = 'kata-left-status-scenario'

describe('renderer mock data contracts', () => {
  afterEach(() => {
    window.localStorage.removeItem(LEFT_STATUS_SCENARIO_KEY)
  })

  it('defines orchestrator and sub-agent fixtures', () => {
    expect(mockAgents).toHaveLength(1)
    expect(mockAgents[0]?.id).toBe('orchestrator')
    expect(mockAgents[0]?.status).toBe('running')
    expect(mockAgents[0]?.children?.length).toBeGreaterThanOrEqual(4)
    expect(mockAgents[0]?.children?.some((agent) => agent.delegatedBy === mockAgents[0]?.name)).toBe(true)
    expect(mockAgents[0]?.tokenUsage.total).toBe(
      (mockAgents[0]?.tokenUsage.prompt ?? 0) + (mockAgents[0]?.tokenUsage.completion ?? 0)
    )
  })

  it('defines project spec tasks and acceptance criteria fixtures', () => {
    expect(mockProject.id).toBe('phase-1')
    expect(mockProject.tasks).toHaveLength(2)
    expect(mockProject.tasks.every((task) => task.status === 'todo')).toBe(true)
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

  it('defines chat fixtures with realistic messages and tool call records', () => {
    expect(mockMessages.length).toBeGreaterThanOrEqual(10)
    expect(mockMessages.length).toBeLessThanOrEqual(15)
    expect(mockMessages.some((message) => message.role === 'user')).toBe(true)
    expect(mockMessages.some((message) => message.role === 'assistant')).toBe(true)
    expect(
      mockMessages.some((message) =>
        (message.toolCalls ?? []).some((toolCall) => toolCall.name.length > 0 && toolCall.output.length > 0)
      )
    ).toBe(true)
  })

  it('supports simple/progress/overflow left-status scenario overrides', () => {
    window.localStorage.setItem(LEFT_STATUS_SCENARIO_KEY, 'simple')
    const simpleProject = getMockProject()
    expect(simpleProject.tasks.some((task) => task.status === 'done')).toBe(false)

    window.localStorage.setItem(LEFT_STATUS_SCENARIO_KEY, 'progress')
    const progressProject = getMockProject()
    expect(progressProject.tasks.some((task) => task.status === 'done')).toBe(true)
    expect(progressProject.tasks.some((task) => task.status === 'in_progress')).toBe(true)

    window.localStorage.setItem(LEFT_STATUS_SCENARIO_KEY, 'overflow')
    const overflowProject = getMockProject()
    expect(overflowProject.tasks).toHaveLength(60)
    expect(overflowProject.tasks.filter((task) => task.status === 'done')).toHaveLength(50)
  })

  it('falls back to default project for unknown scenario values', () => {
    window.localStorage.setItem(LEFT_STATUS_SCENARIO_KEY, 'unsupported')
    const project = getMockProject()

    expect(project.id).toBe('phase-1')
    expect(project.tasks).toHaveLength(2)
    expect(project.tasks.every((task) => task.status === 'todo')).toBe(true)
  })
})
