import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Hero1 } from '../../../src/renderer/components/hero1'

describe('Hero1', () => {
  afterEach(() => {
    cleanup()
    window.kata = undefined
  })

  it('renders app-specific defaults without external marketing links', () => {
    render(<Hero1 />)

    expect(screen.getByText('Kata Orchestrator')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Plan, execute, and verify from one workspace' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Discover all components' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Kata Orchestrator interface preview' })).toBeTruthy()
  })

  it('supports custom props and opens external URLs through preload API', () => {
    const openExternalUrl = vi.fn().mockResolvedValue(true)
    window.kata = { ...window.kata, openExternalUrl }

    render(
      <Hero1
        badge=""
        heading="Custom heading"
        description="Custom description"
        buttons={{
          primary: {
            text: 'Primary CTA',
            url: 'https://example.com/primary'
          }
        }}
        image={{
          src: 'https://example.com/demo.png',
          alt: 'Custom alt text'
        }}
      />
    )

    expect(screen.queryByText('Your Website Builder')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Custom heading' })).toBeTruthy()
    expect(screen.getByText('Custom description')).toBeTruthy()
    const primaryButton = screen.getByRole('button', { name: 'Primary CTA' })
    expect(primaryButton).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View on GitHub' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Custom alt text' }).getAttribute('src')).toBe(
      'https://example.com/demo.png'
    )

    fireEvent.click(primaryButton)
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/primary')
  })

  it('falls back to local image source and safely no-ops when preload API is missing', () => {
    render(
      <Hero1
        buttons={{
          primary: {
            text: 'Open docs',
            url: 'https://example.com/docs'
          }
        }}
        image={{
          src: 'https://example.com/unreachable-image.png',
          alt: 'Offline image'
        }}
      />
    )

    const image = screen.getByRole('img', { name: 'Offline image' })
    fireEvent.error(image)

    expect(image.getAttribute('src')).toContain('data:image/svg+xml;utf8,')

    fireEvent.click(screen.getByRole('button', { name: 'Open docs' }))
  })
})
