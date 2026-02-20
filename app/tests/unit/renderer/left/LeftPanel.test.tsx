import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LeftPanel } from '../../../../src/renderer/components/layout/LeftPanel'

describe('LeftPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the agents tab by default with agent summaries', () => {
    render(<LeftPanel />)

    expect(screen.getByRole('tablist', { name: 'Left panel tabs' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Agents' })).toBeTruthy()
    expect(screen.getByText('Kata Orchestrator')).toBeTruthy()
    expect(screen.getByText('Model: gpt-5')).toBeTruthy()
    expect(screen.getByText('Tokens: 5,356')).toBeTruthy()
  })

  it('switches to the context tab and renders the shared workspace checklist', () => {
    render(<LeftPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'Context 2' }))

    expect(screen.getByRole('heading', { name: 'Context' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open project spec' })).toBeTruthy()
    expect(screen.getByLabelText('Create contracts and shared baseline components')).toBeTruthy()
    expect(screen.getByLabelText('Implement left panel tabs')).toBeTruthy()
  })

  it('switches to changes and files tabs', () => {
    render(<LeftPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'Changes 3' }))
    expect(screen.getByRole('heading', { name: 'Changes' })).toBeTruthy()
    expect(screen.getByText('Branch: feat/wave-2A-contracts')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Files 1' }))
    expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy()
    expect(screen.getByLabelText('Search files')).toBeTruthy()
  })
})
