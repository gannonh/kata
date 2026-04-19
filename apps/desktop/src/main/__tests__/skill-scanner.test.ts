import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  clearSkillCache,
  getCachedSkills,
  parseSkillFrontmatter,
  refreshSkillCache,
  scanAllSkillDirectories,
  scanSkillDirectory,
} from '../skill-scanner'

async function writeSkill(baseDir: string, skillName: string, frontmatter?: string): Promise<void> {
  const skillDir = path.join(baseDir, skillName)
  await fs.mkdir(skillDir, { recursive: true })

  const body =
    frontmatter ??
    `---\nname: ${skillName}\ndescription: ${skillName} description\n---\n\n# ${skillName}\n`

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), body, 'utf8')
}

describe('skill-scanner', () => {
  let testRoot: string
  let fakeHome: string
  let fakeWorkspace: string

  beforeEach(async () => {
    clearSkillCache()
    testRoot = mkdtempSync(path.join(tmpdir(), 'kata-desktop-skill-scanner-'))
    fakeHome = path.join(testRoot, 'home')
    fakeWorkspace = path.join(testRoot, 'workspace')

    await fs.mkdir(fakeHome, { recursive: true })
    await fs.mkdir(fakeWorkspace, { recursive: true })
    await fs.mkdir(path.join(fakeHome, 'Library', 'Logs', '@kata', 'desktop'), {
      recursive: true,
    })

    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    clearSkillCache()
    rmSync(testRoot, { recursive: true, force: true })
  })

  test('parseSkillFrontmatter extracts name and description', () => {
    const parsed = parseSkillFrontmatter(
      ['---', 'name: debug-like-expert', 'description: Deep investigation mode', '---'].join('\n'),
    )

    expect(parsed).toEqual({
      name: 'debug-like-expert',
      description: 'Deep investigation mode',
    })
  })

  test('parseSkillFrontmatter handles missing fields and malformed input', () => {
    expect(parseSkillFrontmatter('not-frontmatter')).toEqual({})
    expect(parseSkillFrontmatter(['---', 'name: skill-only', '---'].join('\n'))).toEqual({
      name: 'skill-only',
      description: undefined,
    })
  })

  test('scanSkillDirectory reads direct child directories with SKILL.md', async () => {
    const skillsDir = path.join(fakeWorkspace, '.agents', 'skills')
    await writeSkill(skillsDir, 'frontend-design')
    await writeSkill(
      skillsDir,
      'quoted-skill',
      ['---', "name: 'quoted-skill'", 'description: "Quoted description"', '---'].join('\n'),
    )
    await fs.mkdir(path.join(skillsDir, 'missing-file'), { recursive: true })

    const skills = await scanSkillDirectory(skillsDir)

    expect(skills).toEqual([
      { name: 'frontend-design', description: 'frontend-design description' },
      { name: 'quoted-skill', description: 'Quoted description' },
    ])
  })

  test('scanSkillDirectory gracefully handles missing directories', async () => {
    const skills = await scanSkillDirectory(path.join(fakeWorkspace, 'does-not-exist'))
    expect(skills).toEqual([])
  })

  test('scanAllSkillDirectories dedupes by skill name across configured locations', async () => {
    const kataSkillsDir = path.join(fakeHome, '.kata-cli', 'agent', 'skills')
    const userSkillsDir = path.join(fakeHome, '.agents', 'skills')
    const workspaceSkillsDir = path.join(fakeWorkspace, '.agents', 'skills')

    await writeSkill(kataSkillsDir, 'debug-like-expert')
    await writeSkill(userSkillsDir, 'shared-skill', ['---', 'name: shared-skill', 'description: user copy', '---'].join('\n'))
    await writeSkill(workspaceSkillsDir, 'shared-skill', ['---', 'name: shared-skill', 'description: workspace copy', '---'].join('\n'))
    await writeSkill(workspaceSkillsDir, 'frontend-design')

    const commands = await scanAllSkillDirectories(fakeWorkspace)

    expect(commands).toEqual([
      {
        name: '/skill:debug-like-expert',
        description: 'debug-like-expert description',
        category: 'skill',
      },
      {
        name: '/skill:frontend-design',
        description: 'frontend-design description',
        category: 'skill',
      },
      {
        name: '/skill:shared-skill',
        description: 'user copy',
        category: 'skill',
      },
    ])
  })

  test('refreshSkillCache debounces rescans for 2 seconds and caches results', async () => {
    const workspaceSkillsDir = path.join(fakeWorkspace, '.agents', 'skills')
    await writeSkill(workspaceSkillsDir, 'initial-skill')

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const first = await refreshSkillCache(fakeWorkspace)
    expect(first.map((entry) => entry.name)).toEqual(['/skill:initial-skill'])

    await writeSkill(workspaceSkillsDir, 'added-later')

    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    const second = await refreshSkillCache(fakeWorkspace)
    expect(second.map((entry) => entry.name)).toEqual(['/skill:initial-skill'])

    const cached = getCachedSkills()
    expect(cached?.map((entry) => entry.name)).toEqual(['/skill:initial-skill'])

    vi.setSystemTime(new Date('2026-01-01T00:00:03.100Z'))
    const third = await refreshSkillCache(fakeWorkspace)

    expect(third.map((entry) => entry.name)).toEqual(['/skill:added-later', '/skill:initial-skill'])
  })
})
