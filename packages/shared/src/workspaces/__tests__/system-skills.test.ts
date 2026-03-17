import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { seedSystemSkills } from '../storage'
import { getBundledAssetsDir } from '../../utils/paths'

const TEST_WORKSPACE = join(import.meta.dir, '__fixtures__', 'test-ws')

// Bundled system-skills assets are only available inside a built Electron app
// or when process.cwd() matches the monorepo root. Skip when unavailable.
const hasBundledAssets = !!getBundledAssetsDir('system-skills')

beforeEach(() => {
  mkdirSync(join(TEST_WORKSPACE, 'skills'), { recursive: true })
})

afterEach(() => {
  rmSync(TEST_WORKSPACE, { recursive: true, force: true })
})

describe('seedSystemSkills', () => {
  test.skipIf(!hasBundledAssets)('copies system skills to workspace skills directory', () => {
    seedSystemSkills(TEST_WORKSPACE)

    const skillPath = join(TEST_WORKSPACE, 'skills', 'spec-elicitation', 'SKILL.md')
    expect(existsSync(skillPath)).toBe(true)

    const content = readFileSync(skillPath, 'utf-8')
    expect(content).toContain('name: spec-elicitation')
  })

  test.skipIf(!hasBundledAssets)('copies references subdirectory', () => {
    seedSystemSkills(TEST_WORKSPACE)

    const guidancePath = join(TEST_WORKSPACE, 'skills', 'spec-elicitation', 'references', 'guidance.md')
    expect(existsSync(guidancePath)).toBe(true)
  })

  test.skipIf(!hasBundledAssets)('does not overwrite existing skill', () => {
    // Pre-create with custom content
    const skillDir = join(TEST_WORKSPACE, 'skills', 'spec-elicitation')
    mkdirSync(skillDir, { recursive: true })
    const skillPath = join(skillDir, 'SKILL.md')
    const customContent = '---\nname: spec-elicitation\n---\nCustom user modifications'
    writeFileSync(skillPath, customContent)

    seedSystemSkills(TEST_WORKSPACE)

    // Should preserve user's version
    expect(readFileSync(skillPath, 'utf-8')).toBe(customContent)
  })
})
