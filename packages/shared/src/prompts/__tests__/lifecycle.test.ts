import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { formatSessionLifecycleContext } from '../lifecycle'

const TEST_WORKSPACE = join(import.meta.dir, '__fixtures__', 'test-workspace')

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

  test('returns lifecycle block for new session without spec skill', () => {
    const result = formatSessionLifecycleContext(true, TEST_WORKSPACE)
    expect(result).toContain('<session_lifecycle>')
    expect(result).toContain('new project session')
    expect(result).not.toContain('spec-elicitation')
  })

  test('returns lifecycle block with skill reference when spec skill exists', () => {
    const skillDir = join(TEST_WORKSPACE, 'skills', 'spec-elicitation')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: spec-elicitation\n---\nContent')

    const result = formatSessionLifecycleContext(true, TEST_WORKSPACE)
    expect(result).toContain('<session_lifecycle>')
    expect(result).toContain('spec-elicitation skill is available')
  })
})
