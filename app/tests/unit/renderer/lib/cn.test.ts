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
})
