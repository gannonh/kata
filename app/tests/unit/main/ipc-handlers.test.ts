// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRemoveHandler, mockHandle, mockOpenExternal } = vi.hoisted(() => ({
  mockRemoveHandler: vi.fn(),
  mockHandle: vi.fn(),
  mockOpenExternal: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: mockRemoveHandler,
    handle: mockHandle
  },
  shell: {
    openExternal: mockOpenExternal
  }
}))

import { registerIpcHandlers } from '../../../src/main/ipc-handlers'

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers the external URL handler', () => {
    registerIpcHandlers()

    expect(mockRemoveHandler).toHaveBeenCalledWith('kata:openExternalUrl')
    expect(mockHandle).toHaveBeenCalledTimes(1)
    expect(mockHandle).toHaveBeenCalledWith('kata:openExternalUrl', expect.any(Function))
  })

  it('rejects invalid and non-http(s) URLs', async () => {
    registerIpcHandlers()

    const handler = mockHandle.mock.calls[0]?.[1] as
      | ((event: unknown, url: unknown) => Promise<boolean>)
      | undefined

    expect(handler).toBeTypeOf('function')
    await expect(handler?.({}, 'not-a-url')).resolves.toBe(false)
    await expect(handler?.({}, 'file:///tmp/unsafe')).resolves.toBe(false)
    await expect(handler?.({}, 123)).resolves.toBe(false)
    expect(mockOpenExternal).not.toHaveBeenCalled()
  })

  it('opens valid external http(s) URLs through shell', async () => {
    mockOpenExternal.mockResolvedValue(undefined)

    registerIpcHandlers()

    const handler = mockHandle.mock.calls[0]?.[1] as
      | ((event: unknown, url: unknown) => Promise<boolean>)
      | undefined

    await expect(handler?.({}, 'https://example.com')).resolves.toBe(true)
    expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com')
  })
})
