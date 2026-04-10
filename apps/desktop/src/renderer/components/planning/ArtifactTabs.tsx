import type { PlanningArtifactState } from '@/atoms/planning'
import { cn } from '@/lib/utils'
import { detectArtifactType } from '@/lib/artifact-parser'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface ArtifactTabsProps {
  artifacts: PlanningArtifactState[]
  activeArtifactKey: string | null
  hasUnviewedUpdatesByKey: Record<string, boolean>
  onSelect: (artifact: PlanningArtifactState) => void
}

const TYPE_SORT_ORDER: Record<string, number> = {
  roadmap: 0,
  slice: 1,
  requirements: 2,
  decisions: 3,
  context: 4,
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
    <Tabs
      value={activeArtifactKey ?? undefined}
      onValueChange={(value) => {
        const artifact = sortedArtifacts.find((a) => a.artifactKey === value)
        if (artifact) {
          onSelect(artifact)
        }
      }}
      className="mt-2"
    >
      <TabsList variant="line" className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent px-4 py-1">
        {sortedArtifacts.map((artifact) => {
          const hasUnviewedUpdate = hasUnviewedUpdatesByKey[artifact.artifactKey] === true

          return (
            <TabsTrigger
              key={artifact.artifactKey}
              value={artifact.artifactKey}
              className={cn(
                'relative shrink-0 rounded-md border border-input bg-transparent px-3 py-1.5 text-xs text-muted-foreground shadow-none',
                'hover:bg-muted hover:text-foreground',
                'data-active:border-border data-active:bg-muted data-active:text-foreground',
                'dark:data-active:border-input dark:data-active:bg-input/30',
              )}
            >
              <span>{formatArtifactTitle(artifact.title, typeCounts)}</span>
              {hasUnviewedUpdate ? (
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" aria-label="updated" />
              ) : null}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

function formatArtifactTitle(title: string, typeCounts: Record<string, number>): string {
  const detectedType = detectArtifactType(title)
  if (!detectedType) {
    return title
  }

  if (detectedType === 'slice') {
    return title
  }

  if ((typeCounts[detectedType] ?? 0) > 1) {
    return title
  }

  return TYPE_LABEL[detectedType] ?? title
}
