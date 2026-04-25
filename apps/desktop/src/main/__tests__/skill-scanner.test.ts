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

import log from '../logger'
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

  test('parseSkillFrontmatter handles missing fields, malformed input, and quote mismatches', () => {
    expect(parseSkillFrontmatter('not-frontmatter')).toEqual({})
    expect(parseSkillFrontmatter(['---', 'name: skill-only', '---'].join('\n'))).toEqual({
      name: 'skill-only',
      description: undefined,
    })

    expect(
      parseSkillFrontmatter(
        ['---', `name: 'mismatched"`, 'description: "Valid quoted description"', '---'].join('\n'),
      ),
    ).toEqual({
      name: `'mismatched"`,
      description: 'Valid quoted description',
    })
  })

  test('scanSkillDirectory discovers SKILL.md recursively, including root-level files', async () => {
    const skillsDir = path.join(fakeWorkspace, '.agents', 'skills')
    await writeSkill(skillsDir, 'frontend-design')
    await writeSkill(path.join(skillsDir, 'nested'), 'inner-skill')
    await writeSkill(
      skillsDir,
      'quoted-skill',
      ['---', "name: 'quoted-skill'", 'description: "Quoted description"', '---'].join('\n'),
    )
    await fs.mkdir(path.join(skillsDir, 'missing-file'), { recursive: true })
    await fs.writeFile(
      path.join(skillsDir, 'SKILL.md'),
      ['---', 'name: root-skill', 'description: root skill description', '---'].join('\n'),
      'utf8',
    )

    const skills = await scanSkillDirectory(skillsDir)

    expect(skills).toEqual([
      { name: 'frontend-design', description: 'frontend-design description' },
      { name: 'inner-skill', description: 'inner-skill description' },
      { name: 'quoted-skill', description: 'Quoted description' },
      { name: 'root-skill', description: 'root skill description' },
    ])
  })

  test('scanSkillDirectory gracefully handles missing directories', async () => {
    const skills = await scanSkillDirectory(path.join(fakeWorkspace, 'does-not-exist'))
    expect(skills).toEqual([])
  })

  test('[R003] scanAllSkillDirectories discovers and dedupes /skill:* entries across configured locations', async () => {
    const kataSkillsDir = path.join(fakeHome, '.kata-cli', 'agent', 'skills')
    const userSkillsDir = path.join(fakeHome, '.agents', 'skills')
    const workspaceSkillsDir = path.join(fakeWorkspace, '.agents', 'skills')

    await writeSkill(kataSkillsDir, 'debug-like-expert')
    await writeSkill(userSkillsDir, 'shared-skill', ['---', 'name: shared-skill', 'description: user copy', '---'].join('\n'))
    await writeSkill(workspaceSkillsDir, 'shared-skill', ['---', 'name: shared-skill', 'description: workspace copy', '---'].join('\n'))
    await writeSkill(workspaceSkillsDir, 'frontend-design')
    await writeSkill(path.join(workspaceSkillsDir, 'nested'), 'deep-skill')
    await fs.writeFile(
      path.join(workspaceSkillsDir, 'SKILL.md'),
      ['---', 'name: root-workspace-skill', 'description: root workspace copy', '---'].join('\n'),
      'utf8',
    )

    const commands = await scanAllSkillDirectories(fakeWorkspace)

    expect(commands).toEqual([
      {
        name: '/skill:debug-like-expert',
        description: 'debug-like-expert description',
        category: 'skill',
      },
      {
        name: '/skill:deep-skill',
        description: 'deep-skill description',
        category: 'skill',
      },
      {
        name: '/skill:frontend-design',
        description: 'frontend-design description',
        category: 'skill',
      },
      {
        name: '/skill:root-workspace-skill',
        description: 'root workspace copy',
        category: 'skill',
      },
      {
        name: '/skill:shared-skill',
        description: 'workspace copy',
        category: 'skill',
      },
    ])
  })

  test('[R004] refreshSkillCache debounces rescans for 2 seconds and eventually includes refreshed skills', async () => {
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

  test('scanSkillDirectory warns and skips SKILL.md files that fail to read', async () => {
    const skillsDir = path.join(fakeWorkspace, '.agents', 'skills')
    await writeSkill(skillsDir, 'healthy-skill')
    await writeSkill(skillsDir, 'broken-skill')

    const brokenSkillPath = path.join(skillsDir, 'broken-skill', 'SKILL.md')
    const originalReadFile = fs.readFile.bind(fs)
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath, ...args) => {
      if (String(filePath) === brokenSkillPath) {
        const error = new Error('disk blew up') as Error & { code?: string }
        error.code = 'EIO'
        throw error
      }

      return originalReadFile(filePath, ...args)
    })

    const skills = await scanSkillDirectory(skillsDir)

    expect(skills).toEqual([{ name: 'healthy-skill', description: 'healthy-skill description' }])
    expect(log.warn).toHaveBeenCalledWith(
      '[skill-scanner] failed to read SKILL.md',
      expect.objectContaining({
        directoryPath: skillsDir,
        skillDirectory: 'broken-skill',
        skillFilePath: brokenSkillPath,
        code: 'EIO',
      }),
    )
  })

  test('scanAllSkillDirectories returns an empty list when a scan crashes mid-refresh', async () => {
    const workspaceSkillsDir = path.join(fakeWorkspace, '.agents', 'skills')
    await writeSkill(workspaceSkillsDir, 'healthy-skill')

    const originalMapSet = Map.prototype.set
    const setSpy = vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, ...args) {
      throw new Error(`set failed for ${String(args[0])}`)
    })

    const commands = await scanAllSkillDirectories(fakeWorkspace)

    expect(commands).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(
      '[skill-scanner] failed to scan skill directories',
      expect.objectContaining({ workspacePath: fakeWorkspace, error: expect.stringContaining('set failed') }),
    )

    setSpy.mockImplementation(originalMapSet)
  })

  test('[R004] refreshSkillCache reuses in-flight scan for concurrent callers', async () => {
    const workspaceSkillsDir = path.join(fakeWorkspace, '.agents', 'skills')
    await writeSkill(workspaceSkillsDir, 'initial-skill')

    const readFileSpy = vi.spyOn(fs, 'readFile')

    const [first, second] = await Promise.all([
      refreshSkillCache(fakeWorkspace),
      refreshSkillCache(fakeWorkspace),
    ])

    expect(first).toEqual(second)

    const skillReads = readFileSpy.mock.calls.filter(([filePath]) =>
      String(filePath).endsWith(`${path.sep}SKILL.md`),
    )
    expect(skillReads).toHaveLength(1)
  })
})
