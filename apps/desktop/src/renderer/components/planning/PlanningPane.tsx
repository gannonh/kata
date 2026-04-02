import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Markdown } from '@kata-ui/components/markdown/Markdown'
import {
  activePlanningArtifactAtom,
  applyPlanningArtifactAtom,
  planningArtifactsAtom,
  planningErrorAtom,
  planningLoadingAtom,
} from '@/atoms/planning'
import { Separator } from '@/components/ui/separator'

export function PlanningPane() {
  const artifacts = useAtomValue(planningArtifactsAtom)
  const activeArtifactRef = useAtomValue(activePlanningArtifactAtom)
  const loading = useAtomValue(planningLoadingAtom)
  const error = useAtomValue(planningErrorAtom)

  const applyPlanningArtifact = useSetAtom(applyPlanningArtifactAtom)
  const setPlanningLoading = useSetAtom(planningLoadingAtom)
  const setPlanningError = useSetAtom(planningErrorAtom)

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollPositionsByKeyRef = useRef<Record<string, number>>({})

  const activeArtifact = activeArtifactRef ? artifacts[activeArtifactRef.artifactKey] : null

  useEffect(() => {
    if (!activeArtifactRef || activeArtifact) {
      return
    }

    setPlanningLoading(true)
    setPlanningError(null)

    void window.api.planning
      .fetchArtifact(activeArtifactRef.title, activeArtifactRef.artifactKey)
      .then((response) => {
        if (!response.success || !response.artifact) {
          setPlanningError(response.error?.message ?? 'Unable to fetch artifact')
          return
        }

        applyPlanningArtifact(response.artifact)
      })
      .catch((fetchError: unknown) => {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError)
        setPlanningError(message)
      })
      .finally(() => {
        setPlanningLoading(false)
      })
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

  const handleScroll = (): void => {
    if (!activeArtifactRef || !scrollContainerRef.current) {
      return
    }

    scrollPositionsByKeyRef.current[activeArtifactRef.artifactKey] =
      scrollContainerRef.current.scrollTop
  }

  return (
    <aside className="flex h-full flex-col bg-muted/20">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Planning View
          </h2>
          <p className="truncate text-sm font-medium text-foreground">
            {activeArtifact?.title ?? activeArtifactRef?.title ?? 'No active artifact'}
          </p>
        </div>

        {activeArtifact ? (
          <span className="text-xs text-muted-foreground">
            {new Date(activeArtifact.updatedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>

      <Separator />

      {error ? (
        <div className="border-b border-border bg-destructive/10 px-4 py-3 text-xs text-destructive">
          Unable to fetch artifact: {error}
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-4 py-3"
      >
        {loading && !activeArtifact ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p>Loading planning artifact…</p>
          </div>
        ) : null}

        {!loading && !activeArtifact ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No artifacts yet</p>
            <p>Start a planning session with `/kata plan` to populate this pane.</p>
          </div>
        ) : null}

        {activeArtifact ? (
          <Markdown mode="full" className="text-sm leading-relaxed">
            {activeArtifact.content}
          </Markdown>
        ) : null}
      </div>
    </aside>
  )
}
