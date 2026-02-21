import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { FilesTab } from '../../../../src/renderer/components/left/FilesTab'
import { mockFiles, type MockFileNode } from '../../../../src/renderer/mock/files'

describe('FilesTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a recursive tree with expand and collapse controls', () => {
    render(<FilesTab files={mockFiles} />)

    expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy()
    expect(screen.getByText(/Your copy of the repo lives in/)).toBeTruthy()
    expect(screen.getByLabelText('Search files')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle src' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle src' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle src/renderer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle src/renderer/components' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle src/renderer/components/shared' }))

    expect(screen.getByText('TabBar.tsx')).toBeTruthy()
    expect(screen.getByText('StatusBadge.tsx')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle src' }))

    expect(screen.queryByRole('button', { name: 'Toggle src/renderer' })).toBeNull()
  })

  it('filters tree results based on search input', () => {
    render(<FilesTab files={mockFiles} />)

    fireEvent.change(screen.getByLabelText('Search files'), {
      target: { value: 'status' }
    })

    expect(screen.getByText('StatusBadge.tsx')).toBeTruthy()
    expect(screen.queryByText('TabBar.tsx')).toBeNull()
  })

  it('hides all nodes when the search query has no matches', () => {
    render(<FilesTab files={mockFiles} />)

    fireEvent.change(screen.getByLabelText('Search files'), {
      target: { value: 'does-not-exist' }
    })

    expect(screen.queryByRole('button', { name: 'Toggle src' })).toBeNull()
    expect(screen.queryByText('StatusBadge.tsx')).toBeNull()
  })

  it('keeps matching directories without children when filtering', () => {
    const nodes: MockFileNode[] = [
      {
        id: 'empty-dir',
        name: 'empty-dir',
        path: 'empty-dir',
        type: 'directory'
      }
    ]

    render(<FilesTab files={nodes} />)

    fireEvent.change(screen.getByLabelText('Search files'), {
      target: { value: 'empty' }
    })

    expect(screen.getByRole('button', { name: 'Toggle empty-dir' })).toBeTruthy()
  })
})
