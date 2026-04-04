import type { WorkflowBoardTask } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TaskListProps {
  tasks: WorkflowBoardTask[]
}

const TASK_STATE_TONE: Record<WorkflowBoardTask['columnId'], string> = {
  backlog: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  todo: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  agent_review: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  human_review: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  merging: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

export function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="text-xs text-muted-foreground">No child tasks</p>
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li key={task.id} className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium text-foreground">
              {task.identifier ? `${task.identifier} · ` : ''}
              {task.title}
            </p>
            <Badge variant="outline" className={cn('border-transparent text-[10px]', TASK_STATE_TONE[task.columnId])}>
              {task.stateName}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  )
}
