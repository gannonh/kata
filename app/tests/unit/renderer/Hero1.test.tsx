import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Hero1 } from '../../../src/renderer/components/hero1'

describe('Hero1', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders default shadcnblocks content', () => {
    render(<Hero1 {...({} as any)} />)

    expect(screen.getByText('Your Website Builder')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Blocks Built With Shadcn & Tailwind' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Discover all components' }).getAttribute('href')).toBe(
      'https://www.shadcnblocks.com'
    )
    expect(screen.getByRole('img', { name: 'Hero section demo image showing interface components' })).toBeTruthy()
  })

  it('supports custom props and optional controls', () => {
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
    expect(screen.getByRole('link', { name: 'Primary CTA' }).getAttribute('href')).toBe(
      'https://example.com/primary'
    )
    expect(screen.queryByRole('link', { name: 'View on GitHub' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Custom alt text' }).getAttribute('src')).toBe(
      'https://example.com/demo.png'
    )
  })
})
