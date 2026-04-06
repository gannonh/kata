import { useEffect, useMemo, useState } from 'react'
import { WORKFLOW_COLUMNS, type WorkflowColumnId } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export interface TaskMutationDialogValues {
  title: string
  description: string
  columnId: WorkflowColumnId
}

export interface TaskMutationDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  heading: string
  subheading?: string
  confirmLabel: string
  initialValues?: Partial<TaskMutationDialogValues>
  includeStateField?: boolean
  stateOptions?: ReadonlyArray<{ id: WorkflowColumnId; title: string }>
  loading?: boolean
  submitting?: boolean
  errorMessage?: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TaskMutationDialogValues) => Promise<void> | void
}

export function validateTaskMutationValues(values: TaskMutationDialogValues): string | null {
  if (!values.title.trim()) {
    return 'Task title is required.'
  }

  if (values.title.trim().length > 240) {
    return 'Task title must be 240 characters or fewer.'
  }

  return null
}

const DEFAULT_VALUES: TaskMutationDialogValues = {
  title: '',
  description: '',
  columnId: 'todo',
}

export function TaskMutationDialog({
  open,
  mode,
  heading,
  subheading,
  confirmLabel,
  initialValues,
  includeStateField = false,
  stateOptions = WORKFLOW_COLUMNS,
  loading = false,
  submitting = false,
  errorMessage = null,
  onOpenChange,
  onSubmit,
}: TaskMutationDialogProps) {
  const mergedInitialValues = useMemo(
    () => ({
      ...DEFAULT_VALUES,
      ...initialValues,
      title: initialValues?.title ?? DEFAULT_VALUES.title,
      description: initialValues?.description ?? DEFAULT_VALUES.description,
      columnId: initialValues?.columnId ?? DEFAULT_VALUES.columnId,
    }),
    [initialValues],
  )

  const [values, setValues] = useState<TaskMutationDialogValues>(mergedInitialValues)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setValidationError(null)
      return
    }

    setValues(mergedInitialValues)
    setValidationError(null)
  }, [open, mergedInitialValues])

  const submit = async () => {
    if (loading || submitting) {
      return
    }

    const nextValidationError = validateTaskMutationValues(values)
    if (nextValidationError) {
      setValidationError(nextValidationError)
      return
    }

    setValidationError(null)
    await onSubmit({
      title: values.title.trim(),
      description: values.description,
      columnId: values.columnId,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[34rem]" showCloseButton={!loading && !submitting}>
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          {subheading ? <DialogDescription>{subheading}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-mutation-title">Title</Label>
            <Input
              id="task-mutation-title"
              value={values.title}
              placeholder="Describe the task"
              onChange={(event) => {
                const title = event.target.value
                setValues((current) => ({ ...current, title }))
              }}
              data-testid="task-mutation-title"
              disabled={loading || submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-mutation-description">Description</Label>
            <Textarea
              id="task-mutation-description"
              value={values.description}
              placeholder={mode === 'create' ? 'Optional task details' : 'Update task details'}
              onChange={(event) => {
                const description = event.target.value
                setValues((current) => ({ ...current, description }))
              }}
              data-testid="task-mutation-description"
              disabled={loading || submitting}
            />
          </div>

          {includeStateField ? (
            <div className="space-y-1.5">
              <Label htmlFor="task-mutation-state">State</Label>
              <Select
                value={values.columnId}
                onValueChange={(value) => {
                  setValues((current) => ({
                    ...current,
                    columnId: value as WorkflowColumnId,
                  }))
                }}
                disabled={loading || submitting}
              >
                <SelectTrigger id="task-mutation-state" className="w-full rounded-md border border-border/70">
                  <SelectValue placeholder="Select task state" />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {loading ? (
            <p className="text-xs text-muted-foreground" data-testid="task-mutation-loading">
              Loading task details…
            </p>
          ) : null}

          {validationError ? (
            <p className="text-xs text-destructive" data-testid="task-mutation-validation-error">
              {validationError}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="text-xs text-destructive" data-testid="task-mutation-submit-error">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading || submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            data-testid="task-mutation-submit"
            disabled={loading || submitting}
          >
            {loading ? 'Loading…' : submitting ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
