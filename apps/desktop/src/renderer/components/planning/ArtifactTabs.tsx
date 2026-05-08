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

const PRIMARY_ARTIFACT_ORDER = ['roadmap', 'requirements', 'decisions'] as const

type PrimaryArtifactType = (typeof PRIMARY_ARTIFACT_ORDER)[number]

const TYPE_SORT_ORDER: Record<PrimaryArtifactType, number> = {
  roadmap: 0,
  requirements: 1,
  decisions: 2,
}

const TYPE_LABEL: Record<Exclude<PrimaryArtifactType, 'roadmap'>, string> = {
  requirements: 'Requirements',
  decisions: 'Decisions',
}

export function getPrimaryPlanningArtifacts(
  artifacts: PlanningArtifactState[],
  activeMilestoneId?: string | null,
): PlanningArtifactState[] {
  const newestArtifactByType = new Map<PrimaryArtifactType, PlanningArtifactState>()
  const normalizedActiveMilestoneId = activeMilestoneId?.trim().toUpperCase() ?? null
  const roadmapCandidates: PlanningArtifactState[] = []

  for (const artifact of artifacts) {
    const artifactType = getArtifactType(artifact)
    if (!isPrimaryArtifactType(artifactType)) {
      continue
    }

    if (artifactType === 'roadmap') {
      roadmapCandidates.push(artifact)
      continue
    }

    const existingArtifact = newestArtifactByType.get(artifactType)
    if (!existingArtifact || Date.parse(artifact.updatedAt) > Date.parse(existingArtifact.updatedAt)) {
      newestArtifactByType.set(artifactType, artifact)
    }
  }

  const matchingRoadmaps = normalizedActiveMilestoneId
    ? roadmapCandidates.filter((artifact) => extractMilestoneIdFromTitle(artifact.title) === normalizedActiveMilestoneId)
    : roadmapCandidates
  const selectedRoadmap = getNewestArtifact(matchingRoadmaps[0] ? matchingRoadmaps : roadmapCandidates)
  if (selectedRoadmap) {
    newestArtifactByType.set('roadmap', selectedRoadmap)
  }

  return [...newestArtifactByType.values()].sort((left, right) => {
    const leftType = getArtifactType(left) as PrimaryArtifactType
    const rightType = getArtifactType(right) as PrimaryArtifactType

    const leftOrder = TYPE_SORT_ORDER[leftType]
    const rightOrder = TYPE_SORT_ORDER[rightType]

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    return left.title.localeCompare(right.title)
  })
}

export function ArtifactTabs({
  artifacts,
  activeArtifactKey,
  hasUnviewedUpdatesByKey,
  onSelect,
}: ArtifactTabsProps) {
  const primaryArtifacts = getPrimaryPlanningArtifacts(artifacts)

  if (primaryArtifacts.length === 0) {
    return null
  }

  return (
    <Tabs
      value={activeArtifactKey ?? undefined}
      onValueChange={(value) => {
        const artifact = primaryArtifacts.find((a) => a.artifactKey === value)
        if (artifact) {
          onSelect(artifact)
        }
      }}
      className="mt-2"
    >
      <TabsList
        className="grid h-auto w-full gap-2 bg-transparent px-4 py-1"
        style={{ gridTemplateColumns: `repeat(${primaryArtifacts.length}, minmax(0, 1fr))` }}
      >
        {primaryArtifacts.map((artifact) => {
          const hasUnviewedUpdate = hasUnviewedUpdatesByKey[artifact.artifactKey] === true

          return (
            <TabsTrigger
              key={artifact.artifactKey}
              value={artifact.artifactKey}
              className={cn(
                'min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-xs text-muted-foreground shadow-none',
                'hover:bg-muted hover:text-foreground',
                'data-active:border-border data-active:bg-muted data-active:text-foreground',
                'dark:data-active:border-input dark:data-active:bg-input/30',
              )}
            >
              <span className="flex min-w-0 items-center justify-center gap-1.5">
                <span className="truncate">{formatArtifactTitle(artifact.title)}</span>
                {hasUnviewedUpdate ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="updated" />
                ) : null}
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

function getArtifactType(artifact: PlanningArtifactState) {
  return artifact.artifactType ?? detectArtifactType(artifact.title)
}

function isPrimaryArtifactType(value: string | null | undefined): value is PrimaryArtifactType {
  return value === 'roadmap' || value === 'requirements' || value === 'decisions'
}

export function formatArtifactTitle(title: string): string {
  const detectedType = detectArtifactType(title)
  if (detectedType === 'roadmap') {
    return formatMilestoneTitle(title)
  }

  if (detectedType === 'requirements' || detectedType === 'decisions') {
    return TYPE_LABEL[detectedType]
  }

  return title
}

export function formatMilestoneTitle(title: string): string {
  const normalizedTitle = normalizeTitle(title)
  const bracketMatch = normalizedTitle.match(/^\[(M\d{3})\]\s+(.+)$/)
  if (bracketMatch?.[1] && bracketMatch[2]) {
    return `${bracketMatch[1]}: ${bracketMatch[2].trim()}`
  }

  const roadmapMatch = normalizedTitle.match(/^(M\d{3})-ROADMAP$/i)
  if (roadmapMatch?.[1]) {
    return `${roadmapMatch[1].toUpperCase()}: Milestone`
  }

  return normalizedTitle
}

function getNewestArtifact(artifacts: PlanningArtifactState[]): PlanningArtifactState | null {
  return artifacts.reduce<PlanningArtifactState | null>((latest, artifact) => {
    if (!latest || Date.parse(artifact.updatedAt) > Date.parse(latest.updatedAt)) {
      return artifact
    }

    return latest
  }, null)
}

function extractMilestoneIdFromTitle(title: string): string | null {
  const normalizedTitle = normalizeTitle(title)
  const bracketMatch = normalizedTitle.match(/^\[(M\d{3})\]\s+/)
  if (bracketMatch?.[1]) {
    return bracketMatch[1]
  }

  const roadmapMatch = normalizedTitle.match(/^(M\d{3})-ROADMAP$/i)
  return roadmapMatch?.[1]?.toUpperCase() ?? null
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/^KATA-DOC\s*:\s*/i, '')
}
