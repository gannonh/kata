import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useEffect, useRef } from 'react'
import type { PlanningArtifact, PlanningSliceData } from '@shared/types'

export const RIGHT_PANE_MODE_STORAGE_KEY = 'kata-desktop:right-pane-mode'

export interface PlanningArtifactState {
  artifactKey: string
  title: string
  content: string
  updatedAt: string
  scope: PlanningArtifact['scope']
  projectId?: string
  issueId?: string
  artifactType?: PlanningArtifact['artifactType']
  sliceData?: PlanningSliceData
}

export type PlanningArtifactsMap = Record<string, PlanningArtifactState>

export interface ActivePlanningArtifactRef {
  artifactKey: string
  title: string
}

export const planningArtifactsAtom = atom<PlanningArtifactsMap>({})
export const slicePlanningAtom = atom<Record<string, PlanningSliceData>>({})
export const activePlanningArtifactAtom = atom<ActivePlanningArtifactRef | null>(null)
export const rightPaneModeAtom = atomWithStorage<'planning' | 'default'>(
  RIGHT_PANE_MODE_STORAGE_KEY,
  'default',
)
export const autoSwitchTriggeredAtom = atom<boolean>(false)
export const planningLoadingAtom = atom<boolean>(false)
export const artifactFetchInFlightCountAtom = atom<number>(0)
export const isFetchingAtom = atom((get) => get(artifactFetchInFlightCountAtom) > 0)
export const planningErrorAtom = atom<string | null>(null)
export const lastViewedPlanningArtifactAtom = atom<Record<string, string>>({})

export const markPlanningArtifactViewedAtom = atom(
  null,
  (get, set, artifact: { artifactKey: string; updatedAt: string }) => {
    set(lastViewedPlanningArtifactAtom, {
      ...get(lastViewedPlanningArtifactAtom),
      [artifact.artifactKey]: artifact.updatedAt,
    })
  },
)

export const resetPlanningSessionStateAtom = atom(null, (_get, set) => {
  set(planningArtifactsAtom, {})
  set(activePlanningArtifactAtom, null)
  set(slicePlanningAtom, {})
  set(autoSwitchTriggeredAtom, false)
  set(planningLoadingAtom, false)
  set(artifactFetchInFlightCountAtom, 0)
  set(planningErrorAtom, null)
  set(lastViewedPlanningArtifactAtom, {})
})

export const applyPlanningArtifactAtom = atom(null, (get, set, artifact: PlanningArtifact) => {
  const nextArtifacts: PlanningArtifactsMap = {
    ...get(planningArtifactsAtom),
    [artifact.artifactKey]: {
      artifactKey: artifact.artifactKey,
      title: artifact.title,
      content: artifact.content,
      updatedAt: artifact.updatedAt,
      scope: artifact.scope,
      projectId: artifact.projectId,
      issueId: artifact.issueId,
      artifactType: artifact.artifactType,
      sliceData: artifact.sliceData,
    },
  }

  set(planningArtifactsAtom, nextArtifacts)

  if (artifact.artifactType === 'slice' && artifact.sliceData) {
    set(slicePlanningAtom, {
      ...get(slicePlanningAtom),
      [artifact.artifactKey]: artifact.sliceData,
    })
  }

  const currentActiveArtifact = get(activePlanningArtifactAtom)
  if (!currentActiveArtifact || !nextArtifacts[currentActiveArtifact.artifactKey]) {
    set(activePlanningArtifactAtom, {
      artifactKey: artifact.artifactKey,
      title: artifact.title,
    })
  }

  set(planningLoadingAtom, false)
  set(planningErrorAtom, null)
})

export function usePlanningArtifactBridge(): void {
  const rightPaneMode = useAtomValue(rightPaneModeAtom)
  const autoSwitchTriggered = useAtomValue(autoSwitchTriggeredAtom)

  const applyPlanningArtifact = useSetAtom(applyPlanningArtifactAtom)
  const setArtifacts = useSetAtom(planningArtifactsAtom)
  const pendingTriggerToolNameByArtifactKeyRef = useRef<Record<string, string>>({})
  const rightPaneModeRef = useRef(rightPaneMode)
  const autoSwitchTriggeredRef = useRef(autoSwitchTriggered)
  const setActiveArtifactTitle = useSetAtom(activePlanningArtifactAtom)
  const setSlices = useSetAtom(slicePlanningAtom)
  const setRightPaneMode = useSetAtom(rightPaneModeAtom)
  const setAutoSwitchTriggered = useSetAtom(autoSwitchTriggeredAtom)
  const setLoading = useSetAtom(planningLoadingAtom)
  const setArtifactFetchInFlightCount = useSetAtom(artifactFetchInFlightCountAtom)
  const setError = useSetAtom(planningErrorAtom)

  rightPaneModeRef.current = rightPaneMode
  autoSwitchTriggeredRef.current = autoSwitchTriggered

  useEffect(() => {
    setLoading(true)

    void window.api.planning
      .listArtifacts()
      .then((response) => {
        if (!response.success) {
          setError(response.error?.message ?? 'Unable to list planning artifacts')
          return
        }

        if (response.artifacts.length === 0) {
          return
        }

        const nextArtifacts: PlanningArtifactsMap = {}
        for (const artifact of response.artifacts) {
          nextArtifacts[artifact.artifactKey] = {
            artifactKey: artifact.artifactKey,
            title: artifact.title,
            content: artifact.content,
            updatedAt: artifact.updatedAt,
            scope: artifact.scope,
            projectId: artifact.projectId,
            issueId: artifact.issueId,
            artifactType: artifact.artifactType,
            sliceData: artifact.sliceData,
          }
        }

        setArtifacts((currentArtifacts) => ({
          ...nextArtifacts,
          ...currentArtifacts,
        }))

        const nextSlices = response.artifacts.reduce<Record<string, PlanningSliceData>>(
          (result, artifact) => {
            if (artifact.artifactType === 'slice' && artifact.sliceData) {
              result[artifact.artifactKey] = artifact.sliceData
            }
            return result
          },
          {},
        )

        setSlices((currentSlices) => ({
          ...nextSlices,
          ...currentSlices,
        }))

        const mostRecentArtifact = response.artifacts[0]
        if (mostRecentArtifact) {
          setActiveArtifactTitle(
            (currentActiveArtifact) =>
              currentActiveArtifact ?? {
                artifactKey: mostRecentArtifact.artifactKey,
                title: mostRecentArtifact.title,
              },
          )
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setError(message)
      })
      .finally(() => {
        setLoading(false)
      })

    const unsubscribeFetchState = window.api.planning.onArtifactFetchState((event) => {
      if (event.state === 'start') {
        setArtifactFetchInFlightCount((current) => current + 1)
        setError(null)
        pendingTriggerToolNameByArtifactKeyRef.current[event.artifactKey] =
          event.toolName ?? 'unknown'
        return
      }

      setArtifactFetchInFlightCount((current) => Math.max(0, current - 1))
      delete pendingTriggerToolNameByArtifactKeyRef.current[event.artifactKey]

      if (event.error) {
        setError(event.error.message)
      }
    })

    const unsubscribeArtifactUpdated = window.api.planning.onArtifactUpdated((artifact) => {
      if (rightPaneModeRef.current === 'default' && !autoSwitchTriggeredRef.current) {
        console.info('Planning pane auto-switch triggered', {
          triggerToolName:
            pendingTriggerToolNameByArtifactKeyRef.current[artifact.artifactKey] ?? 'unknown',
          title: artifact.title,
        })

        rightPaneModeRef.current = 'planning'
        autoSwitchTriggeredRef.current = true

        setRightPaneMode('planning')
        setAutoSwitchTriggered(true)
      }

      delete pendingTriggerToolNameByArtifactKeyRef.current[artifact.artifactKey]
      applyPlanningArtifact(artifact)
    })

    return () => {
      unsubscribeFetchState()
      unsubscribeArtifactUpdated()
    }
  }, [
    applyPlanningArtifact,
    setActiveArtifactTitle,
    setArtifacts,
    setArtifactFetchInFlightCount,
    setAutoSwitchTriggered,
    setError,
    setLoading,
    setRightPaneMode,
    setSlices,
  ])
}
