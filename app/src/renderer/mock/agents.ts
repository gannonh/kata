import type { AgentSummary } from '../types/agent'

export const mockAgents: AgentSummary[] = [
  {
    id: 'orchestrator',
    name: 'MVP Planning Coordinator',
    role: 'Coordinator',
    status: 'running',
    model: 'gpt-5',
    tokenUsage: {
      prompt: 3812,
      completion: 1544,
      total: 5356
    },
    currentTask: "I'm checking live Wave 1 task and agent states now, then I'll give an updated plan.",
    lastUpdated: '2026-02-20T14:49:00.000Z',
    children: [
      {
        id: 'task-block-parser',
        name: 'Task Block Parser',
        role: 'Specialist',
        status: 'running',
        model: 'gpt-5-mini',
        tokenUsage: {
          prompt: 1140,
          completion: 308,
          total: 1448
        },
        currentTask: "I'm implementing task-block parsing and task-note conversion logic.",
        delegatedBy: 'MVP Planning Coordinator',
        lastUpdated: '2026-02-20T15:03:00.000Z'
      },
      {
        id: 'implement-spec-panel',
        name: 'Implement Spec Panel',
        role: 'Specialist',
        status: 'running',
        model: 'gpt-5-mini',
        tokenUsage: {
          prompt: 1290,
          completion: 392,
          total: 1682
        },
        currentTask: 'Adding minimal pnpm test wiring and shared component contracts.',
        delegatedBy: 'MVP Planning Coordinator',
        lastUpdated: '2026-02-20T15:02:00.000Z'
      },
      {
        id: 'worktree-lifecycle',
        name: 'Implement Worktree Lifecycle',
        role: 'Specialist',
        status: 'idle',
        model: 'gpt-5-mini',
        tokenUsage: {
          prompt: 820,
          completion: 122,
          total: 942
        },
        currentTask: 'Queued behind scaffold initialization and dependency install.',
        delegatedBy: 'MVP Planning Coordinator',
        lastUpdated: '2026-02-20T14:58:00.000Z'
      },
      {
        id: 'space-metadata',
        name: 'Space Metadata Impl',
        role: 'Specialist',
        status: 'blocked',
        model: 'gpt-5-mini',
        tokenUsage: {
          prompt: 920,
          completion: 177,
          total: 1097
        },
        currentTask: 'Blocked on shared metadata contract from shell state scaffolding.',
        delegatedBy: 'MVP Planning Coordinator',
        lastUpdated: '2026-02-20T14:57:00.000Z'
      },
      {
        id: 'bootstrap-shell-state',
        name: 'Bootstrap Shell State',
        role: 'Specialist',
        status: 'complete',
        model: 'gpt-5-mini',
        tokenUsage: {
          prompt: 731,
          completion: 181,
          total: 912
        },
        currentTask: 'Initial shell data contract scaffold committed and verified.',
        delegatedBy: 'MVP Planning Coordinator',
        lastUpdated: '2026-02-20T14:52:00.000Z'
      }
    ]
  }
]
