import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ContextTab } from '../../../../src/renderer/components/left/ContextTab'
import { mockProject } from '../../../../src/renderer/mock/project'

describe('ContextTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders subtitle and checklist without project-spec link', () => {
    render(<ContextTab project={mockProject} />)

    expect(screen.getByRole('heading', { name: 'Context' })).toBeTruthy()
    expect(screen.getByText('Context about the task, shared with all agents on demand.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open project spec' })).toBeNull()
    expect(screen.getByLabelText('Create contracts and shared baseline components')).toBeTruthy()
    expect(screen.getByLabelText('Implement left panel tabs')).toBeTruthy()
  })
})
