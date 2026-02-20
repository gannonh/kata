import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TabBar } from '../../../../src/renderer/components/shared/TabBar'

describe('TabBar', () => {
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
    expect(filesTab.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(contextTab)
    fireEvent.click(filesTab)

    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('context')
  })
})
