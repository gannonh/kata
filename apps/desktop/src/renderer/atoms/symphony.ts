import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type {
  SymphonyRuntimeCommandResult,
  SymphonyRuntimeStatus,
} from '@shared/types'

const FALLBACK_STATUS: SymphonyRuntimeStatus = {
  phase: 'disconnected',
  managedProcessRunning: false,
  pid: null,
  url: null,
  diagnostics: {
    stdout: [],
    stderr: [],
  },
  updatedAt: new Date(0).toISOString(),
  restartCount: 0,
}

export const symphonyStatusAtom = atom<SymphonyRuntimeStatus>(FALLBACK_STATUS)
export const symphonyCommandPendingAtom = atom<boolean>(false)

export const symphonyErrorMessageAtom = atom((get) => {
  return get(symphonyStatusAtom).lastError?.message ?? null
})

export const runSymphonyCommandAtom = atom(
  null,
  async (
    _get,
    set,
    command: 'start' | 'stop' | 'restart',
  ): Promise<SymphonyRuntimeCommandResult> => {
    set(symphonyCommandPendingAtom, true)

    try {
      let result: SymphonyRuntimeCommandResult
      if (command === 'start') {
        result = await window.api.symphony.start()
      } else if (command === 'stop') {
        result = await window.api.symphony.stop()
      } else {
        result = await window.api.symphony.restart()
      }

      set(symphonyStatusAtom, result.status)
      return result
    } finally {
      set(symphonyCommandPendingAtom, false)
    }
  },
)

export const refreshSymphonyStatusAtom = atom(null, async (_get, set) => {
  const response = await window.api.symphony.getStatus()
  set(symphonyStatusAtom, response.status)
})

export function useSymphonyBridge(): void {
  const setStatus = useSetAtom(symphonyStatusAtom)
  const refresh = useSetAtom(refreshSymphonyStatusAtom)

  useEffect(() => {
    void refresh()

    const unsubscribe = window.api.symphony.onStatus((status) => {
      setStatus(status)
    })

    return () => {
      unsubscribe()
    }
  }, [refresh, setStatus])
}

export function useSymphonyStatus(): SymphonyRuntimeStatus {
  return useAtomValue(symphonyStatusAtom)
}
