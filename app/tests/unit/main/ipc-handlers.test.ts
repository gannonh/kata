// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { registerIpcHandlers } from '../../../src/main/ipc-handlers'

describe('registerIpcHandlers', () => {
  it('is a no-op stub for wave 1', () => {
    expect(() => registerIpcHandlers()).not.toThrow()
  })
})
