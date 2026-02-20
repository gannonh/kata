import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('AppShell null-ref guard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unmock('react')
  })

  it('returns early when the shell ref is unavailable', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const actualReact = await vi.importActual<typeof import('react')>('react')
    let useRefCallCount = 0

    vi.doMock('react', () => ({
      ...actualReact,
      useRef: (initialValue: unknown) => {
        useRefCallCount += 1

        if (useRefCallCount === 1) {
          return {
            get current() {
              return null
            },
            set current(_next: unknown) {
              // Keep shellRef unresolved so useLayoutEffect exits early.
            }
          }
        }

        return actualReact.useRef(initialValue)
      }
    }))

    const { AppShell } = await import('../../../src/renderer/components/layout/AppShell')

    globalThis.ResizeObserver = undefined
    render(<AppShell />)

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
