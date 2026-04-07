import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronsLeftRightEllipsis } from 'lucide-react'
import type { WorkflowBoardColumn } from '@shared/types'
import { isWorkflowCardCollapsedAtom, toggleWorkflowCardCollapsedAtom } from '@/atoms/workflow-board'
import { SliceCard } from '@/components/kanban/SliceCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface KanbanColumnProps {
  column: WorkflowBoardColumn
  collapsed: boolean
  onToggleCollapse: () => void
}

export function KanbanColumn({ column, collapsed, onToggleCollapse }: KanbanColumnProps) {
  if (collapsed) {
    return (
      <section
        className="flex min-h-0 w-20 flex-col items-center rounded-xl border border-border/70 bg-muted/20 p-2"
        data-testid={`kanban-column-${column.id}`}
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={onToggleCollapse}
          aria-label={`Expand ${column.title} column`}
          data-testid={`kanban-column-toggle-${column.id}`}
        >
          <ChevronsLeftRightEllipsis className="size-3.5" />
        </Button>

        <p className="mt-2 text-center text-[11px] font-semibold leading-tight text-muted-foreground">{column.title}</p>

        {column.cards.length > 0 ? (
          <Badge variant="secondary" className="mt-2 text-[10px]" data-testid={`kanban-column-hidden-${column.id}`}>
            {column.cards.length} hidden
          </Badge>
        ) : null}
      </section>
    )
  }

  return (
    <section
      className="flex min-h-0 min-w-[260px] max-w-[320px] flex-1 flex-col rounded-xl border border-border/70 bg-muted/20"
      data-testid={`kanban-column-${column.id}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-xs font-semibold tracking-wide uppercase text-muted-foreground">{column.title}</h3>
          <span className="text-xs text-muted-foreground">{column.cards.length}</span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={onToggleCollapse}
          aria-label={`Collapse ${column.title} column`}
          data-testid={`kanban-column-toggle-${column.id}`}
        >
          <ChevronsLeftRightEllipsis className="size-3.5" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {column.cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">No slices</p>
        ) : (
          column.cards.map((card) => (
            <SliceCardWithCollapse key={card.id} card={card} />
          ))
        )}
      </div>
    </section>
  )
}

function SliceCardWithCollapse({ card }: { card: WorkflowBoardColumn['cards'][number] }) {
  const isCollapsed = useAtomValue(isWorkflowCardCollapsedAtom)
  const toggleCollapse = useSetAtom(toggleWorkflowCardCollapsedAtom)

  return (
    <SliceCard
      card={card}
      collapsed={isCollapsed(card.id)}
      onToggleCollapse={() => toggleCollapse(card.id)}
    />
  )
}
