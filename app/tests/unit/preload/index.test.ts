// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld
  }
}))

describe('preload bridge', () => {
  afterEach(() => {
    exposeInMainWorld.mockReset()
    vi.resetModules()
  })

  it('exposes the kata API with wave 1 default values', async () => {
    await import('../../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)

    const [key, api] = exposeInMainWorld.mock.calls[0] as [
      string,
      {
        getAgents: () => Promise<unknown[]>
        getMessages: () => Promise<unknown[]>
        getProject: () => Promise<null>
        getGitStatus: () => Promise<null>
      }
    ]

    expect(key).toBe('kata')
    await expect(api.getAgents()).resolves.toEqual([])
    await expect(api.getMessages()).resolves.toEqual([])
    await expect(api.getProject()).resolves.toBeNull()
    await expect(api.getGitStatus()).resolves.toBeNull()
  })
})
