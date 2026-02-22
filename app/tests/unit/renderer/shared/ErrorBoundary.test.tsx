import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from '../../../../src/renderer/components/shared/ErrorBoundary'

function ThrowingChild(): JSX.Element {
  throw new Error('test explosion')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary fallback={<p>Oops</p>}>
        <p>All good</p>
      </ErrorBoundary>
    )

    expect(screen.getByText('All good')).toBeTruthy()
    expect(screen.queryByText('Oops')).toBeNull()
  })

  it('renders fallback and logs when a child throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary fallback={<p>Oops</p>}>
        <ThrowingChild />
      </ErrorBoundary>
    )

    expect(screen.getByText('Oops')).toBeTruthy()
    expect(screen.queryByText('All good')).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.any(Error),
      expect.any(String)
    )

    errorSpy.mockRestore()
  })
})
