import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from '../../../../src/renderer/components/ui/badge'
import { Button } from '../../../../src/renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../src/renderer/components/ui/card'
import { Input } from '../../../../src/renderer/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../src/renderer/components/ui/tabs'

describe('shadcn primitives baseline', () => {
  it('renders button, badge, input, and card primitives', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Shell Baseline</CardTitle>
          <Badge>Ready</Badge>
        </CardHeader>
        <CardContent>
          <Input
            aria-label="Search"
            defaultValue="initial"
          />
          <Button type="button">Run</Button>
        </CardContent>
      </Card>
    )

    expect(screen.getByRole('heading', { name: 'Shell Baseline' })).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy()
  })

  it('supports tab switching with radix tab semantics', () => {
    render(
      <Tabs defaultValue="agents">
        <TabsList aria-label="Panel tabs">
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
        </TabsList>
        <TabsContent value="agents">Agents content</TabsContent>
        <TabsContent value="context">Context content</TabsContent>
      </Tabs>
    )

    expect(screen.getByRole('tab', { name: 'Agents' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Agents content')).toBeTruthy()
    expect(screen.queryByText('Context content')).toBeNull()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Context' }), { button: 0 })

    expect(screen.getByRole('tab', { name: 'Context' }).getAttribute('data-state')).toBe('active')
    expect(screen.getByText('Context content')).toBeTruthy()
  })
})
