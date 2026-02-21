export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked'

export type ProjectTask = {
  id: string
  title: string
  status: TaskStatus
  owner?: string
}

export type AcceptanceCriterion = {
  id: string
  text: string
  met: boolean
}

export type ProjectSpec = {
  id: string
  name: string
  sessionTitle?: string
  repositorySubtitle?: string
  goal: string
  nonGoals: string[]
  assumptions: string[]
  notes: string
  tasks: ProjectTask[]
  acceptanceCriteria: AcceptanceCriterion[]
}
