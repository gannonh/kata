import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SearchInput } from '../../../../src/renderer/components/shared/SearchInput'

describe('SearchInput', () => {
  it('renders a searchbox and reports value changes', () => {
    const onValueChange = vi.fn()

    render(
      <SearchInput
        value=""
        onValueChange={onValueChange}
        placeholder="Search files"
      />
    )

    const input = screen.getByRole('searchbox', { name: 'Search files' })
    fireEvent.change(input, { target: { value: 'docs' } })

    expect(input.getAttribute('placeholder')).toBe('Search files')
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('docs')
  })

  it('clears the value from clear button and escape key', () => {
    const onValueChange = vi.fn()

    render(
      <SearchInput
        value="docs"
        onValueChange={onValueChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search' }), { key: 'Escape' })

    expect(onValueChange).toHaveBeenNthCalledWith(1, '')
    expect(onValueChange).toHaveBeenNthCalledWith(2, '')
  })
})
