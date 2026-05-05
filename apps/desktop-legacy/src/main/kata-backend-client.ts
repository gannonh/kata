import type { WorkflowBoardSnapshot, WorkflowBoardTask, WorkflowColumnId } from '../shared/types'

const COLUMN_TITLES: Array<{ id: WorkflowColumnId; title: string }> = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'Todo' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'agent_review', title: 'Agent Review' },
  { id: 'human_review', title: 'Human Review' },
  { id: 'merging', title: 'Merging' },
  { id: 'done', title: 'Done' },
]

export class KataBackendClient {
  constructor(private readonly api: any) {}

  async getBoardSnapshot(): Promise<WorkflowBoardSnapshot> {
    const [project, milestone, execution] = await Promise.all([
      this.api.project.getContext(),
      this.api.milestone.getActive(),
      this.api.execution.getStatus(),
    ])

    const scopeId = milestone?.id ?? `project:${project.workspacePath}`
    const slices = await this.api.slice.list({ milestoneId: scopeId })

    const cards = await Promise.all(
      slices.map(async (slice: any) => {
        const tasks = (await this.api.task.list({ sliceId: slice.id })).map((task: any) =>
          this.toWorkflowTask(task, execution),
        )

        return {
          id: slice.id,
          identifier: slice.identifier ?? slice.id,
          title: slice.title,
          columnId: slice.status,
          stateName: slice.stateName ?? slice.status,
          stateType: slice.stateType ?? project.backend,
          milestoneId: slice.milestoneId,
          milestoneName: slice.milestoneName ?? milestone?.title ?? slice.milestoneId,
          taskCounts: {
            total: tasks.length,
            done: tasks.filter((task: WorkflowBoardTask) => task.columnId === 'done').length,
          },
          tasks,
          url: slice.url,
          symphony: {
            pendingEscalations: execution.escalations.length,
            assignmentState: execution.activeWorkers > 0 ? 'assigned' : 'unassigned',
            freshness: 'fresh',
            provenance: 'dashboard-derived',
          },
        }
      }),
    )

    const now = new Date().toISOString()
    return {
      backend: project.backend,
      fetchedAt: now,
      status: 'fresh',
      source: { projectId: project.workspacePath, activeMilestoneId: milestone?.id },
      activeMilestone: milestone ? { id: milestone.id, name: milestone.title } : null,
      columns: COLUMN_TITLES.map((column) => ({
        id: column.id,
        title: column.title,
        cards: cards.filter((card: any) => card.columnId === column.id),
      })),
      poll: {
        status: 'success',
        backend: project.backend,
        lastAttemptAt: now,
      },
    }
  }

  private toWorkflowTask(task: any, execution: any): WorkflowBoardTask {
    return {
      id: task.id,
      identifier: task.identifier ?? task.id,
      title: task.title,
      description: task.description,
      columnId: task.status,
      stateName: task.stateName ?? task.status,
      stateType: task.stateType ?? 'kata',
      parentSliceId: task.sliceId,
      url: task.url,
      symphony: {
        pendingEscalations: execution.escalations.length,
        assignmentState: execution.activeWorkers > 0 ? 'assigned' : 'unassigned',
        freshness: 'fresh',
        provenance: 'dashboard-derived',
      },
    }
  }
}
