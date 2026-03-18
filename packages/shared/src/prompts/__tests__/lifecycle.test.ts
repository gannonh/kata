import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { formatSessionLifecycleContext } from '../lifecycle'
import { getBundledAssetsDir } from '../../utils/paths'

const TEST_WORKSPACE = join(import.meta.dir, '__fixtures__', 'test-workspace')

// Bundled system-skills assets are only available inside a built Electron app
// or when process.cwd() matches the monorepo root. Skip when unavailable.
const hasBundledAssets = !!getBundledAssetsDir('system-skills')

beforeEach(() => {
  mkdirSync(TEST_WORKSPACE, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_WORKSPACE, { recursive: true, force: true })
})

describe('formatSessionLifecycleContext', () => {
  test('returns empty string for non-new sessions', () => {
    expect(formatSessionLifecycleContext(false, TEST_WORKSPACE)).toBe('')
  })

  test.skipIf(!hasBundledAssets)('returns lifecycle block with skill reference (seeded from bundled assets)', () => {
    const result = formatSessionLifecycleContext(true, TEST_WORKSPACE)
    expect(result).toContain('<session_lifecycle>')
    expect(result).toContain('new project session')
    expect(result).toContain('spec-elicitation skill is available')
  })
})
