import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { FilesTab } from '../../../../src/renderer/components/left/FilesTab'
import { mockFiles } from '../../../../src/renderer/mock/files'

describe('FilesTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a recursive tree with expand and collapse controls', () => {
    render(<FilesTab files={mockFiles} />)

    expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy()
    expect(screen.getByLabelText('Search files')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle src' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle src' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle src/renderer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle src/renderer/components' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle src/renderer/components/shared' }))

    expect(screen.getByText('TabBar.tsx')).toBeTruthy()
    expect(screen.getByText('StatusBadge.tsx')).toBeTruthy()
  })

  it('filters tree results based on search input', () => {
    render(<FilesTab files={mockFiles} />)

    fireEvent.change(screen.getByLabelText('Search files'), {
      target: { value: 'status' }
    })

    expect(screen.getByText('StatusBadge.tsx')).toBeTruthy()
    expect(screen.queryByText('TabBar.tsx')).toBeNull()
  })
})
