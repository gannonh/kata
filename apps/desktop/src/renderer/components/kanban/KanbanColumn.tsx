import type { WorkflowBoardColumn } from '@shared/types'
import { SliceCard } from '@/components/kanban/SliceCard'

interface KanbanColumnProps {
  column: WorkflowBoardColumn
}

export function KanbanColumn({ column }: KanbanColumnProps) {
  return (
    <section className="flex min-h-0 min-w-[260px] max-w-[320px] flex-1 flex-col rounded-xl border border-border/70 bg-muted/20">
      <header className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{column.title}</h3>
        <span className="text-xs text-muted-foreground">{column.cards.length}</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {column.cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">No slices</p>
        ) : (
          column.cards.map((card) => <SliceCard key={card.id} card={card} />)
        )}
      </div>
    </section>
  )
}
