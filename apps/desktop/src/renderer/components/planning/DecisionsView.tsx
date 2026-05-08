import { ArrowUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ParsedDecision, ParsedDecisions } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type DecisionSortColumn = 'id' | 'when' | 'scope' | 'decision' | 'choice' | 'revisable'
type DecisionSortDirection = 'asc' | 'desc'

interface DecisionSort {
  column: DecisionSortColumn
  direction: DecisionSortDirection
}

const DEFAULT_SORT: DecisionSort = {
  column: 'id',
  direction: 'asc',
}

export interface DecisionsViewProps {
  decisions: ParsedDecisions
}

export function DecisionsView({ decisions }: DecisionsViewProps) {
  const [sort, setSort] = useState<DecisionSort>(DEFAULT_SORT)

  const sortedRows = useMemo(() => {
    return [...decisions.rows].sort((left, right) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1
      const leftValue = getSortValue(left, sort.column)
      const rightValue = getSortValue(right, sort.column)

      return leftValue.localeCompare(rightValue, undefined, { numeric: true }) * sortMultiplier
    })
  }, [decisions.rows, sort])

  const toggleSort = (column: DecisionSortColumn) => {
    setSort((currentSort) => {
      if (currentSort.column !== column) {
        return {
          column,
          direction: 'asc',
        }
      }

      return {
        column,
        direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
      }
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <SortableHeader label="#" column="id" activeSort={sort} onToggleSort={toggleSort} />
              <SortableHeader label="When" column="when" activeSort={sort} onToggleSort={toggleSort} />
              <SortableHeader label="Scope" column="scope" activeSort={sort} onToggleSort={toggleSort} />
              <SortableHeader
                label="Decision"
                column="decision"
                activeSort={sort}
                onToggleSort={toggleSort}
              />
              <SortableHeader label="Choice" column="choice" activeSort={sort} onToggleSort={toggleSort} />
              <SortableHeader
                label="Revisable"
                column="revisable"
                activeSort={sort}
                onToggleSort={toggleSort}
              />
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {sortedRows.map((row, rowIndex) => (
              <tr key={row.id} className={cn(rowIndex % 2 === 1 && 'bg-muted/20')}>
                <td className="px-3 py-2 font-medium">{row.id}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.when || '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.scope || '—'}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{row.decision}</p>
                  {row.rationale ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.rationale}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.choice || '—'}</td>
                <td className="px-3 py-2">{renderRevisableBadge(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderRevisableBadge(row: ParsedDecision) {
  if (row.revisable === false) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        No
      </Badge>
    )
  }

  if (row.revisable === true) {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        {row.revisableCondition ? `Yes — ${row.revisableCondition}` : 'Yes'}
      </Badge>
    )
  }

  return <Badge variant="outline">{row.revisableLabel || 'Unknown'}</Badge>
}

function SortableHeader({
  label,
  column,
  activeSort,
  onToggleSort,
}: {
  label: string
  column: DecisionSortColumn
  activeSort: DecisionSort
  onToggleSort: (column: DecisionSortColumn) => void
}) {
  const isActive = activeSort.column === column

  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onToggleSort(column)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          isActive && 'text-foreground',
        )}
      >
        {label}
        <ArrowUpDown className="size-3" />
      </button>
    </th>
  )
}

function getSortValue(row: ParsedDecision, column: DecisionSortColumn): string {
  if (column === 'revisable') {
    if (row.revisable === true) {
      return `1-${row.revisableCondition ?? ''}`
    }

    if (row.revisable === false) {
      return '0'
    }

    return `2-${row.revisableLabel}`
  }

  return row[column] ?? ''
}
