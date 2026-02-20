import { StatusBadge } from '../shared/StatusBadge'
import type { AcceptanceCriterion } from '../../types/project'

type AcceptanceCriteriaProps = {
  criteria: AcceptanceCriterion[]
}

export function AcceptanceCriteria({ criteria }: AcceptanceCriteriaProps) {
  const metCount = criteria.filter((criterion) => criterion.met).length

  return (
    <div>
      <p className="mb-2 font-body text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        {metCount} of {criteria.length} met
      </p>
      <ul className="grid gap-2">
        {criteria.map((criterion) => (
          <li
            key={criterion.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--line)]/70 bg-[color:var(--surface-elevated)]/40 p-3"
          >
            <p className="font-body text-sm text-[color:var(--text-primary)]">{criterion.text}</p>
            <StatusBadge
              label={criterion.met ? 'Met' : 'Open'}
              tone={criterion.met ? 'success' : 'warning'}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
