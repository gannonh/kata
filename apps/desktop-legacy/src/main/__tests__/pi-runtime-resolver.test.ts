import { describe, expect, it } from 'vitest'
import { resolvePiRuntimePaths } from '../pi-runtime-resolver'

describe('resolvePiRuntimePaths', () => {
  it('prefers bundled Pi runtime when packaged resources exist', () => {
    const result = resolvePiRuntimePaths({
      isPackaged: true,
      resourcesPath: '/Applications/Kata Desktop.app/Contents/Resources',
      platform: 'darwin',
    })

    expect(result.launcher).toContain('/Contents/Resources/pi')
    expect(result.skillBundle).toContain('/Contents/Resources/kata-skills')
    expect(result.kataCli).toContain('/Contents/Resources/kata-cli')
  })
})
