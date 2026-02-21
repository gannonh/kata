import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TabBar } from '../../../../src/renderer/components/shared/TabBar'

describe('TabBar', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders tabs and notifies on tab change', () => {
    const onTabChange = vi.fn()

    render(
      <TabBar
        ariaLabel="Panel tabs"
        activeTab="agents"
        tabs={[
          { id: 'agents', label: 'Agents' },
          { id: 'context', label: 'Context', count: 3 },
          { id: 'files', label: 'Files', disabled: true }
        ]}
        onTabChange={onTabChange}
      />
    )

    const tablist = screen.getByRole('tablist', { name: 'Panel tabs' })
    const agentsTab = screen.getByRole('tab', { name: 'Agents' })
    const contextTab = screen.getByRole('tab', { name: 'Context 3' })
    const filesTab = screen.getByRole('tab', { name: 'Files' })

    expect(tablist).toBeTruthy()
    expect(agentsTab.getAttribute('aria-selected')).toBe('true')
    expect(filesTab.hasAttribute('disabled')).toBe(true)

    fireEvent.mouseDown(contextTab, { button: 0 })
    fireEvent.mouseDown(filesTab, { button: 0 })

    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('context')
  })

  it('supports repeated keyboard navigation in controlled mode', () => {
    function Harness() {
      const [activeTab, setActiveTab] = useState<'agents' | 'context' | 'changes'>('agents')
      return (
        <TabBar
          ariaLabel="Panel tabs"
          activeTab={activeTab}
          tabs={[
            { id: 'agents', label: 'Agents' },
            { id: 'context', label: 'Context' },
            { id: 'changes', label: 'Changes' }
          ]}
          onTabChange={setActiveTab}
        />
      )
    }

    render(<Harness />)

    const tablist = screen.getByRole('tablist', { name: 'Panel tabs' })
    fireEvent.keyDown(tablist, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Context' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tablist, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Changes' }).getAttribute('aria-selected')).toBe('true')
  })

  it('supports Home/End keys and ignores keyboard navigation when all tabs are disabled', () => {
    function Harness() {
      const [activeTab, setActiveTab] = useState<'agents' | 'context' | 'changes'>('context')
      return (
        <TabBar
          ariaLabel="Panel tabs"
          activeTab={activeTab}
          tabs={[
            { id: 'agents', label: 'Agents' },
            { id: 'context', label: 'Context' },
            { id: 'changes', label: 'Changes' }
          ]}
          onTabChange={setActiveTab}
        />
      )
    }

    render(<Harness />)

    const tablist = screen.getByRole('tablist', { name: 'Panel tabs' })

    fireEvent.keyDown(tablist, { key: 'Home', code: 'Home' })
    expect(screen.getByRole('tab', { name: 'Agents' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tablist, { key: 'End', code: 'End' })
    expect(screen.getByRole('tab', { name: 'Changes' }).getAttribute('aria-selected')).toBe('true')

    cleanup()

    const onTabChange = vi.fn()
    render(
      <TabBar
        ariaLabel="Disabled tabs"
        activeTab="agents"
        tabs={[
          { id: 'agents', label: 'Agents', disabled: true },
          { id: 'context', label: 'Context', disabled: true }
        ]}
        onTabChange={onTabChange}
      />
    )

    fireEvent.keyDown(screen.getByRole('tablist', { name: 'Disabled tabs' }), {
      key: 'ArrowRight',
      code: 'ArrowRight'
    })
    expect(onTabChange).not.toHaveBeenCalled()
  })
})
