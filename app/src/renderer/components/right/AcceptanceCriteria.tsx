import { StatusBadge } from '../shared/StatusBadge'
import type { AcceptanceCriterion } from '../../types/project'
import { Card, CardContent } from '../ui/card'

type AcceptanceCriteriaProps = {
  criteria: AcceptanceCriterion[]
}

export function AcceptanceCriteria({ criteria }: AcceptanceCriteriaProps) {
  const metCount = criteria.filter((criterion) => criterion.met).length

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {metCount} of {criteria.length} met
      </p>
      <ul className="grid gap-2">
        {criteria.map((criterion) => (
          <li key={criterion.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <p className="text-sm">{criterion.text}</p>
                <StatusBadge
                  label={criterion.met ? 'Met' : 'Open'}
                  tone={criterion.met ? 'success' : 'warning'}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
