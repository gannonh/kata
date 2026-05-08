import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type {
  McpConfigProvenance,
  McpServerInput,
  McpServerStatus,
  McpServerSummary,
} from '@shared/types'

interface McpConfigState {
  servers: McpServerSummary[]
  provenance: McpConfigProvenance | null
  error: string | null
}

const EMPTY_CONFIG_STATE: McpConfigState = {
  servers: [],
  provenance: null,
  error: null,
}

export const mcpConfigStateAtom = atom<McpConfigState>(EMPTY_CONFIG_STATE)
export const mcpConfigLoadingAtom = atom<boolean>(false)
export const mcpMutationPendingAtom = atom<boolean>(false)
export const mcpMutationErrorAtom = atom<string | null>(null)
export const mcpMutationSuccessAtom = atom<string | null>(null)
export const mcpServerStatusesAtom = atom<Record<string, McpServerStatus>>({})
export const mcpStatusPendingByServerAtom = atom<Record<string, boolean>>({})

export const loadMcpConfigAtom = atom(null, async (_get, set) => {
  set(mcpConfigLoadingAtom, true)

  try {
    const response = await window.api.mcp.listServers()

    set(mcpConfigStateAtom, {
      servers: response.servers,
      provenance: response.provenance,
      error: response.success ? null : response.error?.message ?? 'Unable to load MCP config.',
    })
  } catch (error) {
    set(mcpConfigStateAtom, {
      servers: [],
      provenance: null,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    set(mcpConfigLoadingAtom, false)
  }
})

export const saveMcpServerAtom = atom(null, async (_get, set, input: McpServerInput) => {
  set(mcpMutationPendingAtom, true)
  set(mcpMutationErrorAtom, null)
  set(mcpMutationSuccessAtom, null)

  try {
    const response = await window.api.mcp.saveServer(input)
    if (!response.success) {
      const validationMessage = response.validationErrors?.[0]?.message
      set(mcpMutationErrorAtom, validationMessage ?? response.error?.message ?? 'Unable to save MCP server.')
      return response
    }

    set(mcpMutationSuccessAtom, `Saved MCP server “${input.name}”.`)
    await set(loadMcpConfigAtom)
    return response
  } finally {
    set(mcpMutationPendingAtom, false)
  }
})

export const deleteMcpServerAtom = atom(null, async (_get, set, name: string) => {
  set(mcpMutationPendingAtom, true)
  set(mcpMutationErrorAtom, null)
  set(mcpMutationSuccessAtom, null)

  try {
    const response = await window.api.mcp.deleteServer(name)
    if (!response.success) {
      set(mcpMutationErrorAtom, response.error?.message ?? 'Unable to delete MCP server.')
      return response
    }

    set(mcpMutationSuccessAtom, `Deleted MCP server “${name}”.`)

    set(mcpServerStatusesAtom, (previous) => {
      const next = { ...previous }
      delete next[name]
      return next
    })

    await set(loadMcpConfigAtom)
    return response
  } finally {
    set(mcpMutationPendingAtom, false)
  }
})

const runServerStatusAction = atom(
  null,
  async (
    _get,
    set,
    options: {
      serverName: string
      action: 'refresh' | 'reconnect'
    },
  ) => {
    const { serverName, action } = options

    set(mcpStatusPendingByServerAtom, (previous) => ({
      ...previous,
      [serverName]: true,
    }))

    try {
      const response =
        action === 'refresh'
          ? await window.api.mcp.refreshStatus(serverName)
          : await window.api.mcp.reconnectServer(serverName)

      if (response.status) {
        set(mcpServerStatusesAtom, (previous) => ({
          ...previous,
          [serverName]: response.status!,
        }))
      }

      if (!response.success && response.error) {
        set(mcpServerStatusesAtom, (previous) => ({
          ...previous,
          [serverName]: {
            serverName,
            phase: 'error',
            checkedAt: new Date().toISOString(),
            toolNames: [],
            toolCount: 0,
            error: response.error,
          },
        }))
      }

      return response
    } finally {
      set(mcpStatusPendingByServerAtom, (previous) => ({
        ...previous,
        [serverName]: false,
      }))
    }
  },
)

export const refreshMcpServerStatusAtom = atom(
  null,
  async (_get, set, serverName: string) => {
    return set(runServerStatusAction, { serverName, action: 'refresh' })
  },
)

export const reconnectMcpServerAtom = atom(
  null,
  async (_get, set, serverName: string) => {
    return set(runServerStatusAction, { serverName, action: 'reconnect' })
  },
)

export function useMcpConfigBridge(): void {
  const loadConfig = useSetAtom(loadMcpConfigAtom)

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])
}

export function useMcpConfigState(): McpConfigState {
  return useAtomValue(mcpConfigStateAtom)
}
