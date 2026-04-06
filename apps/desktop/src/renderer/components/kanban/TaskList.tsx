import { useAtomValue, useSetAtom } from 'jotai'
import {
  WORKFLOW_COLUMNS,
  type WorkflowBoardTask,
} from '@shared/types'
import {
  moveWorkflowEntityAtom,
  workflowEntityMutationKey,
  workflowEntityMutationStateAtom,
} from '@/atoms/workflow-board'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface TaskListProps {
  tasks: WorkflowBoardTask[]
  issueActions?: Record<string, { status: 'idle' | 'opening' | 'success' | 'error' | 'disabled'; message?: string }>
  onOpenIssue?: (task: WorkflowBoardTask) => void
}

const DEFAULT_TASK_TONE = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'

const TASK_STATE_TONE: Record<WorkflowBoardTask['columnId'], string> = {
  backlog: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  todo: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  agent_review: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  human_review: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  merging: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

export function getTaskMoveTargetOptions(currentColumnId: WorkflowBoardTask['columnId']) {
  return WORKFLOW_COLUMNS.filter((column) => column.id !== currentColumnId)
}

export function TaskList({ tasks, issueActions = {}, onOpenIssue }: TaskListProps) {
  const moveEntity = useSetAtom(moveWorkflowEntityAtom)
  const mutationStates = useAtomValue(workflowEntityMutationStateAtom)

  if (tasks.length === 0) {
    return <p className="text-xs text-muted-foreground">No child tasks</p>
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const issueAction = issueActions[task.id]
        const mutationState = mutationStates[workflowEntityMutationKey('task', task.id)]
        const moveTargetOptions = getTaskMoveTargetOptions(task.columnId)

        return (
          <li key={task.id} className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-foreground">
                {task.identifier ? `${task.identifier} · ` : ''}
                {task.title}
              </p>
              <Badge
                variant="outline"
                className={cn('border-transparent text-[10px]', TASK_STATE_TONE[task.columnId] ?? DEFAULT_TASK_TONE)}
              >
                {task.stateName}
              </Badge>
            </div>
            {task.symphony ? (
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                <span>
                  {task.symphony.assignmentState === 'assigned'
                    ? `Worker ${task.symphony.identifier ?? '(unknown)'}`
                    : 'Unassigned'}
                </span>
                {task.symphony.workerState ? <span>· {task.symphony.workerState}</span> : null}
                {task.symphony.pendingEscalations > 0 ? (
                  <Badge variant="destructive" className="text-[10px]">
                    {task.symphony.pendingEscalations} escalation{task.symphony.pendingEscalations === 1 ? '' : 's'}
                  </Badge>
                ) : null}
              </div>
            ) : null}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Select
                value={task.columnId}
                onValueChange={(value) => {
                  if (value === task.columnId) {
                    return
                  }

                  void moveEntity({
                    entityKind: 'task',
                    entityId: task.id,
                    targetColumnId: value as WorkflowBoardTask['columnId'],
                    currentColumnId: task.columnId,
                    currentStateId: task.stateId,
                    currentStateName: task.stateName,
                    currentStateType: task.stateType,
                    teamId: task.teamId,
                    projectId: task.projectId,
                  })
                }}
                disabled={mutationState?.phase === 'pending'}
              >
                <SelectTrigger
                  size="sm"
                  className="h-6 min-w-[7.5rem] rounded-md border border-border/70 bg-background px-2 text-[10px]"
                  data-testid={`task-move-select-${task.identifier ?? task.id}`}
                >
                  <SelectValue placeholder="Move task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={task.columnId}>Current: {task.stateName}</SelectItem>
                  {moveTargetOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      Move to {option.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {task.url && onOpenIssue ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  data-testid={`task-open-issue-${task.identifier ?? task.id}`}
                  onClick={() => onOpenIssue(task)}
                  disabled={issueAction?.status === 'opening'}
                >
                  Open issue
                </Button>
              ) : null}
            </div>

            {mutationState ? (
              <p className="mt-1 text-[10px] text-muted-foreground" data-testid={`task-move-state-${task.identifier ?? task.id}`}>
                {mutationState.message}
              </p>
            ) : null}

            {issueAction?.message ? (
              <p className="mt-1 text-[10px] text-muted-foreground">{issueAction.message}</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
