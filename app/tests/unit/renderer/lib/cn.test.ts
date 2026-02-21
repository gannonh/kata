import { describe, expect, it } from 'vitest'

import { cn } from '../../../../src/renderer/lib/cn'

describe('cn', () => {
  it('merges class inputs and removes falsy values', () => {
    const value = cn(
      'panel',
      undefined,
      false,
      null,
      'active',
      { hidden: false, visible: true },
      ['stack', ['grid', { muted: true, disabled: false }]]
    )

    expect(value).toBe('panel active visible stack grid muted')
  })

  it('resolves tailwind conflicts to the last class', () => {
    const value = cn('p-2', 'p-4', 'text-sm', 'text-lg')
    expect(value).toBe('p-4 text-lg')
  })

  it('handles conditional objects and nested arrays', () => {
    const value = cn({ foo: true, bar: false }, ['baz', ['qux', { quux: true }]])
    expect(value).toBe('foo baz qux quux')
  })
})
