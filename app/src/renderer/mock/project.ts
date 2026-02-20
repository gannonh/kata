import type { ProjectSpec } from '../types/project'

export const mockProject: ProjectSpec = {
  id: 'phase-1',
  name: 'Kata Desktop App - Phase 1',
  goal: 'Build a complete three-column desktop shell with realistic mock data and interactions.',
  nonGoals: ['Wire PI runtime packages', 'Implement production IPC data flow'],
  assumptions: ['Wave 2A contracts are stable before parallel implementation begins'],
  notes: 'This mock-first phase validates layout, interaction models, and panel contracts.',
  tasks: [
    {
      id: 'task-wave-2a',
      title: 'Create contracts and shared baseline components',
      status: 'in_progress',
      owner: 'orchestrator'
    },
    {
      id: 'task-wave-3',
      title: 'Implement left panel tabs',
      status: 'todo',
      owner: 'left-panel-agent'
    }
  ],
  acceptanceCriteria: [
    {
      id: 'ac-shell',
      text: 'Three-column shell renders and remains resizable',
      met: true
    },
    {
      id: 'ac-contracts',
      text: 'Shared component contracts support parallel panel implementation',
      met: false
    }
  ]
}
