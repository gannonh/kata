import { useAtomValue, useSetAtom } from 'jotai'
import { useMemo, useRef, useState } from 'react'
import {
  WORKFLOW_COLUMNS,
  type WorkflowBoardTask,
  type WorkflowColumnId,
} from '@shared/types'
import {
  loadWorkflowTaskDetailAtom,
  moveWorkflowEntityAtom,
  updateWorkflowTaskAtom,
  workflowEntityMutationKey,
  workflowEntityMutationStateAtom,
} from '@/atoms/workflow-board'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskMutationDialog } from '@/components/kanban/TaskMutationDialog'
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

interface TaskEditDialogState {
  taskId: string
  identifier?: string
  title: string
  description: string
  columnId: WorkflowColumnId
  teamId?: string
  projectId?: string
  stateId?: string
}

export function TaskList({ tasks, issueActions = {}, onOpenIssue }: TaskListProps) {
  const moveEntity = useSetAtom(moveWorkflowEntityAtom)
  const loadTaskDetail = useSetAtom(loadWorkflowTaskDetailAtom)
  const updateTask = useSetAtom(updateWorkflowTaskAtom)
  const mutationStates = useAtomValue(workflowEntityMutationStateAtom)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editDialogLoading, setEditDialogLoading] = useState(false)
  const [editDialogSubmitting, setEditDialogSubmitting] = useState(false)
  const [editDialogError, setEditDialogError] = useState<string | null>(null)
  const [editDialogState, setEditDialogState] = useState<TaskEditDialogState | null>(null)
  const editDialogRequestIdRef = useRef(0)

  const editStateOptions = useMemo(() => WORKFLOW_COLUMNS, [])

  const openEditDialog = async (task: WorkflowBoardTask) => {
    const requestId = ++editDialogRequestIdRef.current

    setEditDialogOpen(true)
    setEditDialogLoading(true)
    setEditDialogSubmitting(false)
    setEditDialogError(null)
    setEditDialogState({
      taskId: task.id,
      identifier: task.identifier,
      title: task.title,
      description: task.description ?? '',
      columnId: task.columnId,
      teamId: task.teamId,
      projectId: task.projectId,
      stateId: task.stateId,
    })

    try {
      const response = await loadTaskDetail({ taskId: task.id })
      if (requestId !== editDialogRequestIdRef.current) {
        return
      }

      if (!response.success || !response.task) {
        setEditDialogError(response.message)
        setEditDialogState(null)
        return
      }

      setEditDialogState({
        taskId: response.task.id,
        identifier: response.task.identifier,
        title: response.task.title,
        description: response.task.description,
        columnId: response.task.columnId,
        teamId: response.task.teamId,
        projectId: response.task.projectId,
        stateId: response.task.stateId,
      })
    } catch (error) {
      if (requestId !== editDialogRequestIdRef.current) {
        return
      }

      setEditDialogError(error instanceof Error ? error.message : 'Unable to load task details.')
      setEditDialogState(null)
    } finally {
      if (requestId === editDialogRequestIdRef.current) {
        setEditDialogLoading(false)
      }
    }
  }

  const submitTaskEdit = async (values: { title: string; description: string; columnId: WorkflowColumnId }) => {
    if (!editDialogState) {
      return
    }

    setEditDialogSubmitting(true)
    setEditDialogError(null)

    const result = await updateTask({
      taskId: editDialogState.taskId,
      title: values.title,
      description: values.description,
      targetColumnId: values.columnId,
      teamId: editDialogState.teamId,
      projectId: editDialogState.projectId,
      currentStateId: editDialogState.stateId,
    })

    if (!result.success) {
      setEditDialogError(result.message)
      setEditDialogSubmitting(false)
      return
    }

    setEditDialogSubmitting(false)
    setEditDialogError(null)
    setEditDialogOpen(false)
  }

  if (tasks.length === 0) {
    return <p className="text-xs text-muted-foreground">No child tasks</p>
  }

  return (
    <>
      <ul className="space-y-2">
        {tasks.map((task) => {
          const issueAction = issueActions[task.id]
          const mutationState = mutationStates[workflowEntityMutationKey('task', task.id)]
          const moveTargetOptions = getTaskMoveTargetOptions(task.columnId)

          return (
            <li key={task.id} className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-foreground">
                  {task.identifier ? (
                    <>
                      {task.url && onOpenIssue ? (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => onOpenIssue(task)}
                        >
                          {task.identifier}
                        </button>
                      ) : (
                        <span>{task.identifier}</span>
                      )}
                      {' · '}
                    </>
                  ) : null}
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

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  data-testid={`task-edit-${task.identifier ?? task.id}`}
                  onClick={() => {
                    void openEditDialog(task)
                  }}
                  disabled={editDialogSubmitting && editDialogState?.taskId === task.id}
                >
                  Edit task
                </Button>

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

      <TaskMutationDialog
        open={editDialogOpen}
        mode="edit"
        heading={editDialogState?.identifier ? `Edit ${editDialogState.identifier}` : 'Edit task'}
        subheading="Load current task details, then save updates back to Linear."
        confirmLabel="Save task"
        initialValues={{
          title: editDialogState?.title ?? '',
          description: editDialogState?.description ?? '',
          columnId: editDialogState?.columnId ?? 'todo',
        }}
        includeStateField
        stateOptions={editStateOptions}
        loading={editDialogLoading}
        submitting={editDialogSubmitting}
        errorMessage={editDialogError}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            editDialogRequestIdRef.current += 1
            setEditDialogError(null)
            setEditDialogLoading(false)
            setEditDialogSubmitting(false)
            setEditDialogState(null)
          }
        }}
        onSubmit={async (values) => {
          await submitTaskEdit(values)
        }}
      />
    </>
  )
}
