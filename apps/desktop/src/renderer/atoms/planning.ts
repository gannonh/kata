import { atom, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useEffect } from 'react'
import type { PlanningArtifact } from '@shared/types'

export const RIGHT_PANE_MODE_STORAGE_KEY = 'kata-desktop:right-pane-mode'

export interface PlanningArtifactState {
  artifactKey: string
  title: string
  content: string
  updatedAt: string
  scope: PlanningArtifact['scope']
  projectId?: string
  issueId?: string
}

export type PlanningArtifactsMap = Record<string, PlanningArtifactState>

export interface ActivePlanningArtifactRef {
  artifactKey: string
  title: string
}

export const planningArtifactsAtom = atom<PlanningArtifactsMap>({})
export const activePlanningArtifactAtom = atom<ActivePlanningArtifactRef | null>(null)
export const rightPaneModeAtom = atomWithStorage<'planning' | 'default'>(
  RIGHT_PANE_MODE_STORAGE_KEY,
  'default',
)
export const planningLoadingAtom = atom<boolean>(false)
export const planningErrorAtom = atom<string | null>(null)

export const applyPlanningArtifactAtom = atom(null, (get, set, artifact: PlanningArtifact) => {
  set(planningArtifactsAtom, {
    ...get(planningArtifactsAtom),
    [artifact.artifactKey]: {
      artifactKey: artifact.artifactKey,
      title: artifact.title,
      content: artifact.content,
      updatedAt: artifact.updatedAt,
      scope: artifact.scope,
      projectId: artifact.projectId,
      issueId: artifact.issueId,
    },
  })
  set(activePlanningArtifactAtom, {
    artifactKey: artifact.artifactKey,
    title: artifact.title,
  })
  set(rightPaneModeAtom, 'planning')
  set(planningLoadingAtom, false)
  set(planningErrorAtom, null)
})

export function usePlanningArtifactBridge(): void {
  const applyPlanningArtifact = useSetAtom(applyPlanningArtifactAtom)
  const setArtifacts = useSetAtom(planningArtifactsAtom)
  const setActiveArtifactTitle = useSetAtom(activePlanningArtifactAtom)
  const setLoading = useSetAtom(planningLoadingAtom)
  const setError = useSetAtom(planningErrorAtom)

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
          setLoading(false)
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
          }
        }

        setArtifacts(nextArtifacts)

        const mostRecentArtifact = response.artifacts[0]
        if (mostRecentArtifact) {
          setActiveArtifactTitle({
            artifactKey: mostRecentArtifact.artifactKey,
            title: mostRecentArtifact.title,
          })
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setError(message)
      })
      .finally(() => {
        setLoading(false)
      })

    const unsubscribe = window.api.planning.onArtifactUpdated((artifact) => {
      applyPlanningArtifact(artifact)
    })

    return () => {
      unsubscribe()
    }
  }, [applyPlanningArtifact, setActiveArtifactTitle, setArtifacts, setError, setLoading])
}
