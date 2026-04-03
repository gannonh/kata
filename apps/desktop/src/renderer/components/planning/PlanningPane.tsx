import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ParsedContext,
  ParsedDecisions,
  ParsedRequirements,
  ParsedRoadmap,
} from '@shared/types'
import { Markdown } from '@kata-ui/components/markdown/Markdown'
import {
  activePlanningArtifactAtom,
  applyPlanningArtifactAtom,
  isFetchingAtom,
  lastViewedPlanningArtifactAtom,
  markPlanningArtifactViewedAtom,
  planningArtifactsAtom,
  planningArtifactsStaleAtom,
  planningErrorAtom,
  planningLoadingAtom,
  planningStaleReasonAtom,
  rightPaneModeAtom,
  slicePlanningAtom,
} from '@/atoms/planning'
import { ArtifactTabs } from '@/components/planning/ArtifactTabs'
import { ContextView } from '@/components/planning/ContextView'
import { DecisionsView } from '@/components/planning/DecisionsView'
import { RequirementsView } from '@/components/planning/RequirementsView'
import { RoadmapView } from '@/components/planning/RoadmapView'
import { SliceView } from '@/components/planning/SliceView'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  detectArtifactType,
  parseContext,
  parseDecisions,
  parseRequirements,
  parseRoadmap,
} from '@/lib/artifact-parser'
import { cn } from '@/lib/utils'

export function PlanningPane() {
  const artifactsByKey = useAtomValue(planningArtifactsAtom)
  const activeArtifactRef = useAtomValue(activePlanningArtifactAtom)
  const loading = useAtomValue(planningLoadingAtom)
  const isFetching = useAtomValue(isFetchingAtom)
  const error = useAtomValue(planningErrorAtom)
  const stale = useAtomValue(planningArtifactsStaleAtom)
  const staleReason = useAtomValue(planningStaleReasonAtom)
  const lastViewedByArtifactKey = useAtomValue(lastViewedPlanningArtifactAtom)
  const slicesByArtifactKey = useAtomValue(slicePlanningAtom)

  const applyPlanningArtifact = useSetAtom(applyPlanningArtifactAtom)
  const setActiveArtifact = useSetAtom(activePlanningArtifactAtom)
  const setRightPaneMode = useSetAtom(rightPaneModeAtom)
  const markPlanningArtifactViewed = useSetAtom(markPlanningArtifactViewedAtom)
  const setPlanningLoading = useSetAtom(planningLoadingAtom)
  const setPlanningError = useSetAtom(planningErrorAtom)

  const artifacts = useMemo(() => Object.values(artifactsByKey), [artifactsByKey])

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollPositionsByKeyRef = useRef<Record<string, number>>({})

  const activeArtifact = activeArtifactRef ? artifactsByKey[activeArtifactRef.artifactKey] : null
  const activeArtifactVersion = activeArtifact
    ? `${activeArtifact.artifactKey}:${activeArtifact.updatedAt}`
    : null

  const [isContentVisible, setIsContentVisible] = useState(true)

  useEffect(() => {
    if (!activeArtifactRef || activeArtifact) {
      return
    }

    let cancelled = false

    setPlanningLoading(true)
    setPlanningError(null)

    void window.api.planning
      .fetchArtifact(activeArtifactRef.title, activeArtifactRef.artifactKey)
      .then((response) => {
        if (cancelled) {
          return
        }

        if (!response.success || !response.artifact) {
          setPlanningError(response.error?.message ?? 'Unable to fetch artifact')
          return
        }

        applyPlanningArtifact(response.artifact)
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return
        }

        const message = fetchError instanceof Error ? fetchError.message : String(fetchError)
        setPlanningError(message)
      })
      .finally(() => {
        if (cancelled) {
          return
        }

        setPlanningLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeArtifact, activeArtifactRef, applyPlanningArtifact, setPlanningError, setPlanningLoading])

  useEffect(() => {
    if (!activeArtifactRef) {
      return
    }

    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    container.scrollTop = scrollPositionsByKeyRef.current[activeArtifactRef.artifactKey] ?? 0
  }, [activeArtifactRef])

  useEffect(() => {
    if (!activeArtifact) {
      return
    }

    markPlanningArtifactViewed({
      artifactKey: activeArtifact.artifactKey,
      updatedAt: activeArtifact.updatedAt,
    })
  }, [activeArtifact, markPlanningArtifactViewed])

  useEffect(() => {
    if (!activeArtifactVersion) {
      setIsContentVisible(true)
      return
    }

    setIsContentVisible(false)

    let cancelled = false
    let outerFrame: number | null = null
    let innerFrame: number | null = null

    outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        if (!cancelled) {
          setIsContentVisible(true)
        }
      })
    })

    return () => {
      cancelled = true

      if (outerFrame !== null) {
        window.cancelAnimationFrame(outerFrame)
      }

      if (innerFrame !== null) {
        window.cancelAnimationFrame(innerFrame)
      }
    }
  }, [activeArtifactVersion])

  const parsedArtifact = useMemo(() => {
    if (!activeArtifact) {
      return null
    }

    const type = activeArtifact.artifactType ?? detectArtifactType(activeArtifact.title)

    if (type === 'roadmap') {
      return {
        type,
        parsed: parseRoadmap(activeArtifact.content) as ParsedRoadmap | null,
      }
    }

    if (type === 'requirements') {
      return {
        type,
        parsed: parseRequirements(activeArtifact.content) as ParsedRequirements | null,
      }
    }

    if (type === 'decisions') {
      return {
        type,
        parsed: parseDecisions(activeArtifact.content) as ParsedDecisions | null,
      }
    }

    if (type === 'context') {
      return {
        type,
        parsed: parseContext(activeArtifact.content) as ParsedContext | null,
      }
    }

    if (type === 'slice') {
      return {
        type,
        parsed: null,
      }
    }

    return {
      type: null,
      parsed: null,
    }
  }, [activeArtifact])

  const parseFailed = Boolean(
    activeArtifact &&
      parsedArtifact?.type &&
      parsedArtifact.type !== 'slice' &&
      !parsedArtifact.parsed,
  )

  useEffect(() => {
    if (!activeArtifact || !parseFailed || !parsedArtifact?.type) {
      return
    }

    console.warn('Unable to parse planning artifact as structured view', {
      title: activeArtifact.title,
      expectedFormat: parsedArtifact.type,
      sample: activeArtifact.content.slice(0, 280),
    })
  }, [activeArtifact, parseFailed, parsedArtifact])

  const hasUnviewedUpdatesByKey = useMemo(() => {
    return artifacts.reduce<Record<string, boolean>>((result, artifact) => {
      const viewedAt = lastViewedByArtifactKey[artifact.artifactKey]
      result[artifact.artifactKey] =
        !viewedAt || new Date(artifact.updatedAt).getTime() > new Date(viewedAt).getTime()
      return result
    }, {})
  }, [artifacts, lastViewedByArtifactKey])

  const handleScroll = (): void => {
    if (!activeArtifactRef || !scrollContainerRef.current) {
      return
    }

    scrollPositionsByKeyRef.current[activeArtifactRef.artifactKey] =
      scrollContainerRef.current.scrollTop
  }

  const handleArtifactSelect = (artifactKey: string, title: string): void => {
    if (!activeArtifactRef || !scrollContainerRef.current) {
      setActiveArtifact({ artifactKey, title })
      return
    }

    scrollPositionsByKeyRef.current[activeArtifactRef.artifactKey] = scrollContainerRef.current.scrollTop

    if (artifactKey === activeArtifactRef.artifactKey) {
      return
    }

    console.debug('Planning tab switched', {
      from: activeArtifactRef.title,
      to: title,
    })

    setActiveArtifact({ artifactKey, title })
  }

  return (
    <aside className="flex h-full flex-col bg-muted/20">
      <div className="flex flex-col py-2">
        <div className="flex items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 flex-col">
            <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              Planning View
            </h2>
            <p className="truncate text-sm font-medium text-foreground">
              {activeArtifact?.title ?? activeArtifactRef?.title ?? 'No active artifact'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeArtifact ? (
              <span className="text-xs text-muted-foreground">
                {new Date(activeArtifact.updatedAt).toLocaleTimeString()}
              </span>
            ) : null}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close planning view"
              onClick={() => {
                console.info('Right pane mode toggled', {
                  trigger: 'manual',
                  from: 'planning',
                  to: 'default',
                })
                setRightPaneMode('default')
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {artifacts.length > 0 ? (
          <ArtifactTabs
            artifacts={artifacts}
            activeArtifactKey={activeArtifactRef?.artifactKey ?? null}
            hasUnviewedUpdatesByKey={hasUnviewedUpdatesByKey}
            onSelect={(artifact) => handleArtifactSelect(artifact.artifactKey, artifact.title)}
          />
        ) : null}
      </div>

      <Separator />

      {error ? (
        <div className="border-b border-border bg-destructive/10 px-4 py-3 text-xs text-destructive">
          Unable to fetch artifact: {error}
        </div>
      ) : null}

      {stale ? (
        <div className="border-b border-border bg-amber-100/60 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Showing cached planning artifacts{staleReason ? ` (${staleReason})` : ''}.
        </div>
      ) : null}

      {parseFailed ? (
        <div className="border-b border-border bg-amber-100/60 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Unable to parse as structured view. Displaying raw markdown fallback.
        </div>
      ) : null}

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full overflow-auto px-4 py-3"
        >
          {loading && !activeArtifact ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <p>Loading planning artifacts…</p>
            </div>
          ) : null}

          {!loading && artifacts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                No planning artifacts yet — start planning with /kata plan
              </p>
            </div>
          ) : null}

          {activeArtifact ? (
            <div
              role="tabpanel"
              id={`panel-${activeArtifact.artifactKey}`}
              aria-labelledby={`tab-${activeArtifact.artifactKey}`}
              className={cn(
                'text-sm leading-relaxed transition-[opacity,transform] duration-200 ease-out',
                isContentVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
              )}
            >
              {parsedArtifact?.type === 'roadmap' && parsedArtifact.parsed ? (
                <RoadmapView roadmap={parsedArtifact.parsed as ParsedRoadmap} />
              ) : parsedArtifact?.type === 'requirements' && parsedArtifact.parsed ? (
                <RequirementsView requirements={parsedArtifact.parsed as ParsedRequirements} />
              ) : parsedArtifact?.type === 'decisions' && parsedArtifact.parsed ? (
                <DecisionsView decisions={parsedArtifact.parsed as ParsedDecisions} />
              ) : parsedArtifact?.type === 'context' && parsedArtifact.parsed ? (
                <ContextView context={parsedArtifact.parsed as ParsedContext} />
              ) : parsedArtifact?.type === 'slice' ? (
                <SliceView
                  slice={activeArtifact.sliceData ?? slicesByArtifactKey[activeArtifact.artifactKey]}
                />
              ) : (
                <Markdown mode="full" className="text-sm leading-relaxed">
                  {activeArtifact.content}
                </Markdown>
              )}
            </div>
          ) : null}
        </div>

        {isFetching ? (
          <div className="pointer-events-none absolute inset-x-4 top-3 z-10 flex justify-end">
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/95 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Fetching...</span>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
