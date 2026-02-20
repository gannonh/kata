import { StatusBadge, type StatusBadgeTone } from '../shared/StatusBadge'
import type { ProjectTask, TaskStatus } from '../../types/project'

type TaskListProps = {
  tasks: ProjectTask[]
}

type StatusConfig = {
  label: string
  tone: StatusBadgeTone
}

const taskStatusConfig: Record<TaskStatus, StatusConfig> = {
  todo: {
    label: 'Todo',
    tone: 'neutral'
  },
  in_progress: {
    label: 'In Progress',
    tone: 'info'
  },
  done: {
    label: 'Done',
    tone: 'success'
  },
  blocked: {
    label: 'Blocked',
    tone: 'danger'
  }
}

export function TaskList({ tasks }: TaskListProps) {
  return (
    <ul className="grid gap-2">
      {tasks.map((task) => {
        const status = taskStatusConfig[task.status]

        return (
          <li
            key={task.id}
            className="rounded-xl border border-[color:var(--line)]/70 bg-[color:var(--surface-elevated)]/40 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-body text-sm text-[color:var(--text-primary)]">{task.title}</p>
              <StatusBadge
                label={status.label}
                tone={status.tone}
              />
            </div>
            {task.owner ? (
              <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">Owner: {task.owner}</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
