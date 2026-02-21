import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Badge } from '../../../../src/renderer/components/ui/badge'
import { Button } from '../../../../src/renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../../src/renderer/components/ui/card'
import { Checkbox } from '../../../../src/renderer/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../../src/renderer/components/ui/collapsible'
import { Input } from '../../../../src/renderer/components/ui/input'
import { ScrollArea } from '../../../../src/renderer/components/ui/scroll-area'
import { Separator } from '../../../../src/renderer/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../src/renderer/components/ui/tabs'
import { Textarea } from '../../../../src/renderer/components/ui/textarea'

describe('shadcn primitives baseline', () => {
  it('renders button, badge, input, and card primitives', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Shell Baseline</CardTitle>
          <CardDescription>Base primitive description</CardDescription>
          <Badge>Ready</Badge>
        </CardHeader>
        <CardContent>
          <Input
            aria-label="Search"
            defaultValue="initial"
          />
          <Button type="button">Run</Button>
        </CardContent>
        <CardFooter>
          <span>Footer content</span>
        </CardFooter>
      </Card>
    )

    expect(screen.getByRole('heading', { name: 'Shell Baseline' })).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText('Base primitive description')).toBeTruthy()
    expect(screen.getByText('Footer content')).toBeTruthy()
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

    expect(screen.getByRole('tab', { name: 'Context' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Context content')).toBeTruthy()
  })

  it('renders checkbox primitive with toggle and disabled behavior', () => {
    render(
      <>
        <Checkbox
          aria-label="Done"
          className="custom-check"
        />
        <Checkbox
          aria-label="Locked"
          defaultChecked
          disabled
        />
      </>
    )

    const doneCheckbox = screen.getByRole('checkbox', { name: 'Done' })
    const lockedCheckbox = screen.getByRole('checkbox', { name: 'Locked' })

    expect(doneCheckbox.getAttribute('data-state')).toBe('unchecked')
    fireEvent.click(doneCheckbox)
    expect(doneCheckbox.getAttribute('data-state')).toBe('checked')
    expect(doneCheckbox.className.includes('custom-check')).toBe(true)
    expect(doneCheckbox.querySelector('[data-slot=\"checkbox-indicator\"] svg')).toBeTruthy()
    expect(lockedCheckbox.hasAttribute('disabled')).toBe(true)
  })

  it('renders separator orientation and decorative accessibility semantics', () => {
    render(
      <>
        <Separator data-testid="separator-default" />
        <Separator
          data-testid="separator-vertical"
          orientation="vertical"
        />
        <Separator
          data-testid="separator-semantic"
          decorative={false}
        />
      </>
    )

    const defaultSeparator = screen.getByTestId('separator-default')
    const verticalSeparator = screen.getByTestId('separator-vertical')
    const semanticSeparator = screen.getByRole('separator')

    expect(defaultSeparator.className.includes('h-px')).toBe(true)
    expect(defaultSeparator.className.includes('w-full')).toBe(true)
    expect(verticalSeparator.className.includes('h-full')).toBe(true)
    expect(verticalSeparator.className.includes('w-px')).toBe(true)
    expect(semanticSeparator.getAttribute('data-slot')).toBe('separator')
  })

  it('renders textarea with value updates and forwarded props', () => {
    const onChange = vi.fn()

    render(
      <Textarea
        placeholder="Add notes"
        defaultValue="Initial notes"
        disabled={false}
        onChange={onChange}
        className="custom-textarea"
      />
    )

    const textarea = screen.getByPlaceholderText('Add notes')
    fireEvent.change(textarea, { target: { value: 'Updated notes' } })

    expect(textarea.getAttribute('data-slot')).toBe('textarea')
    expect(textarea.className.includes('custom-textarea')).toBe(true)
    expect((textarea as HTMLTextAreaElement).value).toBe('Updated notes')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('renders scroll area and collapsible primitives baseline behavior', () => {
    render(
      <>
        <ScrollArea className="h-20 w-20">
          <div>Scrollable content</div>
        </ScrollArea>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle details</CollapsibleTrigger>
          <CollapsibleContent>Hidden details</CollapsibleContent>
        </Collapsible>
      </>
    )

    const scrollAreaRoot = screen.getByText('Scrollable content').closest('[data-slot=\"scroll-area\"]')
    expect(scrollAreaRoot).toBeTruthy()
    expect(scrollAreaRoot?.querySelector('[data-radix-scroll-area-viewport]')).toBeTruthy()

    expect(screen.queryByText('Hidden details')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle details' }))
    expect(screen.getByText('Hidden details')).toBeTruthy()
  })
})
