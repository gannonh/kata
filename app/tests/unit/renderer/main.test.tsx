import { beforeEach, describe, expect, it, vi } from 'vitest'

const renderSpy = vi.fn()
const createRootSpy = vi.fn(() => ({ render: renderSpy }))

vi.mock('react-dom/client', () => ({
  createRoot: createRootSpy
}))

describe('renderer entrypoint', () => {
  beforeEach(() => {
    vi.resetModules()
    createRootSpy.mockClear()
    renderSpy.mockClear()
    document.body.innerHTML = ''
  })

  it('throws when the root element is missing', async () => {
    await expect(import('../../../src/renderer/main')).rejects.toThrow(
      'Root element #root was not found'
    )
    expect(createRootSpy).not.toHaveBeenCalled()
  })

  it('creates and renders the React root when #root exists', async () => {
    document.body.innerHTML = '<div id="root"></div>'

    await import('../../../src/renderer/main')

    expect(createRootSpy).toHaveBeenCalledWith(document.getElementById('root'))
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })
})
