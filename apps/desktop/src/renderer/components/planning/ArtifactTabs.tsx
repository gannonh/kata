import type { PlanningArtifactState } from '@/atoms/planning'
import { cn } from '@/lib/utils'
import { detectArtifactType } from '@/lib/artifact-parser'

export interface ArtifactTabsProps {
  artifacts: PlanningArtifactState[]
  activeArtifactKey: string | null
  hasUnviewedUpdatesByKey: Record<string, boolean>
  onSelect: (artifact: PlanningArtifactState) => void
}

const TYPE_SORT_ORDER: Record<string, number> = {
  roadmap: 0,
  requirements: 1,
  decisions: 2,
  context: 3,
}

const TYPE_LABEL: Record<string, string> = {
  roadmap: 'Roadmap',
  requirements: 'Requirements',
  decisions: 'Decisions',
  context: 'Context',
}

export function ArtifactTabs({
  artifacts,
  activeArtifactKey,
  hasUnviewedUpdatesByKey,
  onSelect,
}: ArtifactTabsProps) {
  const sortedArtifacts = [...artifacts].sort((left, right) => {
    const leftType = detectArtifactType(left.title)
    const rightType = detectArtifactType(right.title)

    const leftOrder = TYPE_SORT_ORDER[leftType ?? ''] ?? 99
    const rightOrder = TYPE_SORT_ORDER[rightType ?? ''] ?? 99

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    return left.title.localeCompare(right.title)
  })

  const typeCounts = sortedArtifacts.reduce<Record<string, number>>((result, artifact) => {
    const type = detectArtifactType(artifact.title)
    if (type) {
      result[type] = (result[type] ?? 0) + 1
    }
    return result
  }, {})

  return (
    <div role="tablist" className="flex min-h-10 items-end gap-1 overflow-x-auto px-4 pb-2">
      {sortedArtifacts.map((artifact) => {
        const isActive = artifact.artifactKey === activeArtifactKey
        const hasUnviewedUpdate = hasUnviewedUpdatesByKey[artifact.artifactKey] === true

        return (
          <button
            key={artifact.artifactKey}
            type="button"
            role="tab"
            aria-selected={isActive}
            id={`tab-${artifact.artifactKey}`}
            aria-controls={`panel-${artifact.artifactKey}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(artifact)}
            className={cn(
              'relative shrink-0 rounded-t-md border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
              isActive && 'border-border border-b-background bg-background text-foreground',
            )}
          >
            <span>{formatArtifactTitle(artifact.title, typeCounts)}</span>
            {hasUnviewedUpdate ? (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-label="updated" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function formatArtifactTitle(title: string, typeCounts: Record<string, number>): string {
  const detectedType = detectArtifactType(title)
  if (!detectedType) {
    return title
  }

  if ((typeCounts[detectedType] ?? 0) > 1) {
    return title
  }

  return TYPE_LABEL[detectedType] ?? title
}
