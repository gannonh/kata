import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, ChevronDown, MessageSquareText } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  WORKFLOW_COLUMNS,
  type WorkflowBoardEscalationRequest,
  type WorkflowBoardSliceCard,
  type WorkflowBoardTask,
} from '@shared/types'
import {
  moveWorkflowEntityAtom,
  openWorkflowIssueAtom,
  respondToWorkflowEscalationAtom,
  workflowEntityMutationKey,
  workflowEntityMutationStateAtom,
  workflowEscalationActionStateAtom,
  workflowIssueActionStateAtom,
} from '@/atoms/workflow-board'
import { TaskList } from '@/components/kanban/TaskList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SliceCardProps {
  card: WorkflowBoardSliceCard
}

function executionTone(freshness: 'fresh' | 'stale' | 'disconnected' | 'unknown'): string {
  if (freshness === 'fresh') return 'text-emerald-700 dark:text-emerald-300'
  if (freshness === 'stale') return 'text-amber-700 dark:text-amber-300'
  if (freshness === 'disconnected') return 'text-destructive'
  return 'text-muted-foreground'
}

export function formatSliceSymphonyHint(symphony: WorkflowBoardSliceCard['symphony']): string {
  if (!symphony) {
    return 'Symphony context unavailable'
  }

  if (symphony.provenance === 'runtime-disconnected') {
    return 'Symphony runtime disconnected'
  }

  if (symphony.provenance === 'operator-stale') {
    return 'Symphony context is stale'
  }

  if (symphony.assignmentState === 'assigned') {
    return `Execution: ${symphony.toolName ?? 'active'}`
  }

  return 'No active Symphony execution'
}

function escalationActionKey(cardId: string, requestId: string): string {
  return `${cardId}:${requestId}`
}

export function isInlineEscalationEnabled(symphony: WorkflowBoardSliceCard['symphony']): boolean {
  if (!symphony) {
    return false
  }

  return symphony.freshness === 'fresh' && symphony.provenance === 'dashboard-derived'
}

export function getMoveTargetOptions(currentColumnId: WorkflowBoardSliceCard['columnId']) {
  return WORKFLOW_COLUMNS.filter((column) => column.id !== currentColumnId)
}

export function SliceCard({ card }: SliceCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showEscalationComposer, setShowEscalationComposer] = useState(false)
  const [responseDraftByRequestId, setResponseDraftByRequestId] = useState<Record<string, string>>({})

  const symphony = card.symphony
  const issueActions = useAtomValue(workflowIssueActionStateAtom)
  const escalationActions = useAtomValue(workflowEscalationActionStateAtom)
  const mutationStates = useAtomValue(workflowEntityMutationStateAtom)
  const openIssue = useSetAtom(openWorkflowIssueAtom)
  const respondToEscalation = useSetAtom(respondToWorkflowEscalationAtom)
  const moveEntity = useSetAtom(moveWorkflowEntityAtom)

  const pendingEscalations = useMemo(
    () => symphony?.pendingEscalationRequests ?? [],
    [symphony?.pendingEscalationRequests],
  )
  const moveOptions = useMemo(() => getMoveTargetOptions(card.columnId), [card.columnId])
  const sliceMoveState = mutationStates[workflowEntityMutationKey('slice', card.id)]

  const canRespondInline = isInlineEscalationEnabled(symphony) && pendingEscalations.length > 0

  const issueAction = issueActions[card.id]
  const latestEscalationActionMessage = pendingEscalations
    .map((request) => escalationActions[escalationActionKey(card.id, request.requestId)]?.message)
    .find(Boolean)

  const submitEscalationResponse = async (request: WorkflowBoardEscalationRequest) => {
    const responseText = responseDraftByRequestId[request.requestId]?.trim()
    if (!responseText) {
      return
    }

    await respondToEscalation({
      cardId: card.id,
      requestId: request.requestId,
      responseText,
    })

    setResponseDraftByRequestId((current) => ({
      ...current,
      [request.requestId]: '',
    }))
  }

  const openCardIssue = () => {
    if (!card.url) {
      return
    }

    void openIssue({
      cardId: card.id,
      url: card.url,
      identifier: card.identifier,
    })
  }

  const openTaskIssue = (task: WorkflowBoardTask) => {
    if (!task.url) {
      return
    }

    void openIssue({
      cardId: task.id,
      url: task.url,
      identifier: task.identifier ?? card.identifier,
    })
  }

  const moveSliceToColumn = (targetColumnId: WorkflowBoardSliceCard['columnId']) => {
    if (targetColumnId === card.columnId) {
      return
    }

    void moveEntity({
      entityKind: 'slice',
      entityId: card.id,
      targetColumnId,
      currentColumnId: card.columnId,
      currentStateId: card.stateId,
      currentStateName: card.stateName,
      currentStateType: card.stateType,
      teamId: card.teamId,
      projectId: card.projectId,
    })
  }

  return (
    <Card size="sm" className="gap-3 rounded-xl border border-border/70 py-3 shadow-none">
      <CardHeader className="px-3 pb-0">
        <CardTitle className="text-sm leading-tight">
          {card.identifier} · {card.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2 px-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{card.stateName}</span>
          <Badge variant="outline" className="text-[10px]">
            {card.taskCounts.done}/{card.taskCounts.total} tasks done
          </Badge>
        </div>

        {symphony ? (
          <div className="space-y-1 text-[11px]">
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant={symphony.assignmentState === 'assigned' ? 'default' : 'outline'} className="text-[10px]">
                {symphony.assignmentState === 'assigned'
                  ? `Worker ${symphony.identifier ?? 'assigned'}`
                  : 'Unassigned'}
              </Badge>
              {symphony.workerState ? (
                <Badge variant="outline" className="text-[10px]">
                  {symphony.workerState}
                </Badge>
              ) : null}
              {symphony.pendingEscalations > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  {symphony.pendingEscalations} escalation{symphony.pendingEscalations === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </div>
            <p className={executionTone(symphony.freshness)} data-testid={`slice-symphony-${card.identifier}`}>
              {formatSliceSymphonyHint(symphony)}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {card.url ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={openCardIssue}
              data-testid={`slice-open-issue-${card.identifier}`}
              disabled={issueAction?.status === 'opening'}
            >
              Open Linear issue
            </Button>
          ) : null}

          {pendingEscalations.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant={showEscalationComposer ? 'secondary' : 'outline'}
              className="h-7 px-2 text-[11px]"
              data-testid={`slice-escalation-toggle-${card.identifier}`}
              onClick={() => setShowEscalationComposer((current) => !current)}
            >
              <MessageSquareText className="mr-1 size-3" />
              Respond to escalation
            </Button>
          ) : null}

          {moveOptions.length > 0 ? (
            <Select
              value={card.columnId}
              onValueChange={(value) => {
                moveSliceToColumn(value as WorkflowBoardSliceCard['columnId'])
              }}
              disabled={sliceMoveState?.phase === 'pending'}
            >
              <SelectTrigger
                size="sm"
                className="h-7 min-w-[8.25rem] rounded-md border border-border/70 bg-background px-2 text-[11px]"
                data-testid={`slice-move-select-${card.identifier}`}
              >
                <SelectValue placeholder="Move slice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={card.columnId}>Current: {card.stateName}</SelectItem>
                {moveOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    Move to {option.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {issueAction?.message ? (
          <p className="text-[11px] text-muted-foreground" data-testid={`slice-issue-action-${card.identifier}`}>
            {issueAction.message}
          </p>
        ) : null}

        {sliceMoveState ? (
          <p className="text-[11px] text-muted-foreground" data-testid={`slice-move-state-${card.identifier}`}>
            {sliceMoveState.message}
          </p>
        ) : null}

        {showEscalationComposer && pendingEscalations.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border/70 bg-background/70 p-2">
            {!canRespondInline ? (
              <div className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                <AlertCircle className="mt-0.5 size-3" />
                <p>Inline responses are disabled while Symphony context is stale or disconnected.</p>
              </div>
            ) : null}

            {pendingEscalations.map((request) => {
              const actionState = escalationActions[escalationActionKey(card.id, request.requestId)]
              const draft = responseDraftByRequestId[request.requestId] ?? ''
              const isSubmitting = actionState?.status === 'submitting'

              return (
                <div key={request.requestId} className="space-y-1 rounded border border-border/50 p-2">
                  <p className="text-[11px] font-medium text-foreground">{request.questionPreview}</p>
                  <Input
                    value={draft}
                    onChange={(event) => {
                      const value = event.target.value
                      setResponseDraftByRequestId((current) => ({
                        ...current,
                        [request.requestId]: value,
                      }))
                    }}
                    placeholder="Enter escalation response"
                    data-testid={`slice-escalation-input-${request.requestId}`}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      data-testid={`slice-escalation-submit-${request.requestId}`}
                      disabled={!canRespondInline || !draft.trim() || isSubmitting}
                      onClick={() => {
                        void submitEscalationResponse(request)
                      }}
                    >
                      {isSubmitting ? 'Submitting…' : 'Submit response'}
                    </Button>
                    {actionState?.message ? <p className="text-[11px] text-muted-foreground">{actionState.message}</p> : null}
                  </div>
                </div>
              )
            })}

            {latestEscalationActionMessage ? (
              <p className="text-[11px] text-muted-foreground" data-testid={`slice-escalation-result-${card.identifier}`}>
                {latestEscalationActionMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ChevronDown className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            {isOpen ? 'Hide tasks' : 'Show tasks'}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <TaskList tasks={card.tasks} issueActions={issueActions} onOpenIssue={openTaskIssue} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
