import type { ProjectSpec } from '../types/project'

export const LEFT_STATUS_SCENARIO_KEY = 'kata-left-status-scenario'

type LeftStatusScenario = 'default' | 'simple' | 'progress' | 'overflow'

const baseProject: ProjectSpec = {
  id: 'phase-1',
  name: 'Kata Desktop App - Phase 1',
  sessionTitle: 'Build Kata Cloud MVP',
  repositorySubtitle: 'gannonh/kata-cloud',
  goal: 'Build a complete three-column desktop shell with realistic mock data and interactions.',
  nonGoals: ['Wire PI runtime packages', 'Implement production IPC data flow'],
  assumptions: ['Wave 2A contracts are stable before parallel implementation begins'],
  notes: 'This mock-first phase validates layout, interaction models, and panel contracts.',
  tasks: [
    {
      id: 'task-wave-2a',
      title: 'Create contracts and shared baseline components',
      status: 'todo',
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

function isLeftStatusScenario(value: string): value is LeftStatusScenario {
  return value === 'default' || value === 'simple' || value === 'progress' || value === 'overflow'
}

function createOverflowTasks() {
  return Array.from({ length: 60 }, (_, index) => ({
    id: `task-overflow-${index + 1}`,
    title: `Overflow task ${index + 1}`,
    status: index < 50 ? ('done' as const) : ('todo' as const),
    owner: index < 50 ? 'orchestrator' : 'left-panel-agent'
  }))
}

function resolveLeftStatusScenario(): LeftStatusScenario {
  try {
    const rawScenario = globalThis.localStorage?.getItem(LEFT_STATUS_SCENARIO_KEY)
    return rawScenario && isLeftStatusScenario(rawScenario) ? rawScenario : 'default'
  } catch {
    return 'default'
  }
}

export function getMockProject(): ProjectSpec {
  const scenario = resolveLeftStatusScenario()

  if (scenario === 'simple') {
    return {
      ...baseProject,
      tasks: [
        {
          id: 'task-simple-1',
          title: 'Define baseline shell contracts',
          status: 'todo',
          owner: 'orchestrator'
        },
        {
          id: 'task-simple-2',
          title: 'Implement left panel tabs',
          status: 'todo',
          owner: 'left-panel-agent'
        }
      ]
    }
  }

  if (scenario === 'progress') {
    return {
      ...baseProject,
      tasks: [
        {
          id: 'task-progress-1',
          title: 'Define baseline shell contracts',
          status: 'done',
          owner: 'orchestrator'
        },
        {
          id: 'task-progress-2',
          title: 'Implement left panel tabs',
          status: 'in_progress',
          owner: 'left-panel-agent'
        },
        {
          id: 'task-progress-3',
          title: 'Review quality gate outputs',
          status: 'todo',
          owner: 'qa-agent'
        }
      ]
    }
  }

  if (scenario === 'overflow') {
    return {
      ...baseProject,
      tasks: createOverflowTasks()
    }
  }

  return baseProject
}

/** Default-scenario snapshot evaluated at module load time. Use getMockProject() for runtime-dynamic scenarios. */
export const mockProject = getMockProject()
