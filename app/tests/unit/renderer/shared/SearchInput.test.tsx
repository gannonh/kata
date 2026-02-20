import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchInput } from '../../../../src/renderer/components/shared/SearchInput'

describe('SearchInput', () => {
  afterEach(() => {
    cleanup()
  })

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

  it("calls onValueChange('') when clear button clicked", () => {
    const onValueChange = vi.fn()

    render(
      <SearchInput
        value="docs"
        onValueChange={onValueChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('')
  })

  it("calls onValueChange('') when Escape pressed with non-empty value", () => {
    const onValueChange = vi.fn()

    render(
      <SearchInput
        value="docs"
        onValueChange={onValueChange}
      />
    )

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search' }), { key: 'Escape' })

    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('')
  })

  it('does not call onValueChange when Escape pressed with empty value', () => {
    const onValueChange = vi.fn()

    render(
      <SearchInput
        value=""
        onValueChange={onValueChange}
      />
    )

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search' }), { key: 'Escape' })

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('returns focus to input after clear button is clicked', () => {
    function SearchInputHarness() {
      const [value, setValue] = useState('docs')
      return (
        <SearchInput
          value={value}
          onValueChange={setValue}
        />
      )
    }

    render(<SearchInputHarness />)

    const input = screen.getByRole('searchbox', { name: 'Search' })
    const clearButton = screen.getByRole('button', { name: 'Clear search' })

    clearButton.focus()
    expect(document.activeElement).toBe(clearButton)

    fireEvent.click(clearButton)

    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    expect(document.activeElement).toBe(input)
  })

  it('does not bubble Escape to parent handlers when clearing value', () => {
    const onKeyDown = vi.fn()
    const onValueChange = vi.fn()

    render(
      <div onKeyDown={onKeyDown}>
        <SearchInput
          value="docs"
          onValueChange={onValueChange}
        />
      </div>
    )

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search' }), { key: 'Escape' })

    expect(onKeyDown).not.toHaveBeenCalled()
  })
})
