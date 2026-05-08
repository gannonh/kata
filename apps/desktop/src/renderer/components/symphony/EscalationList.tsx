import type {
  SymphonyEscalationResponseResult,
  SymphonyOperatorEscalationItem,
} from '@shared/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface EscalationListProps {
  escalations: SymphonyOperatorEscalationItem[]
  drafts: Record<string, string>
  submittingRequestId?: string
  lastResult?: SymphonyEscalationResponseResult
  onDraftChange: (requestId: string, value: string) => void
  onSubmit: (requestId: string) => void
}

export function EscalationList({
  escalations,
  drafts,
  submittingRequestId,
  lastResult,
  onDraftChange,
  onSubmit,
}: EscalationListProps) {
  return (
    <section className="space-y-2" data-testid="symphony-escalation-list">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending escalations</h3>

      {lastResult ? (
        <Alert variant={lastResult.ok ? 'default' : 'destructive'} data-testid="symphony-escalation-result">
          <AlertTitle>{lastResult.ok ? 'Escalation response sent' : 'Escalation response failed'}</AlertTitle>
          <AlertDescription>{lastResult.message}</AlertDescription>
        </Alert>
      ) : null}

      {escalations.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" data-testid="symphony-escalation-empty">
          No pending escalations.
        </p>
      ) : (
        <div className="space-y-3">
          {escalations.map((escalation) => {
            const draft = drafts[escalation.requestId] ?? ''
            const submitting = submittingRequestId === escalation.requestId

            return (
              <article
                key={escalation.requestId}
                className="space-y-2 rounded-md border border-border bg-background/50 p-3"
                data-testid={`symphony-escalation-${escalation.requestId}`}
              >
                <header>
                  <p className="text-xs font-semibold text-foreground">{escalation.issueIdentifier}</p>
                  <p className="text-xs text-muted-foreground">{escalation.questionPreview}</p>
                </header>

                <Textarea
                  value={draft}
                  placeholder="Type your response for Symphony…"
                  onChange={(event) => onDraftChange(escalation.requestId, event.target.value)}
                  data-testid={`symphony-escalation-input-${escalation.requestId}`}
                  rows={3}
                />

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onSubmit(escalation.requestId)}
                    disabled={submitting || draft.trim().length === 0}
                    data-testid={`symphony-escalation-submit-${escalation.requestId}`}
                  >
                    {submitting ? 'Submitting…' : 'Submit response'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
