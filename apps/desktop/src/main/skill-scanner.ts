import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import log from './logger'
import type { SkillEntry, SlashCommandEntry } from '../shared/types'

export const SKILL_DIRECTORIES = [
  '~/.kata-cli/agent/skills/',
  '~/.agents/skills/',
  '.agents/skills/',
] as const

export const SKILL_REFRESH_DEBOUNCE_MS = 2_000

let cachedSkills: SlashCommandEntry[] | null = null
let cachedWorkspacePath: string | null = null
let lastRefreshAt = 0

function resolveSkillDirectories(workspacePath?: string): string[] {
  const homeDirectory = os.homedir()
  const resolvedWorkspacePath = workspacePath ? path.resolve(workspacePath) : process.cwd()

  return SKILL_DIRECTORIES.map((directoryPath) => {
    if (directoryPath.startsWith('~/')) {
      return path.join(homeDirectory, directoryPath.slice(2))
    }

    return path.join(resolvedWorkspacePath, directoryPath)
  })
}

function stripYamlWrapping(value: string): string {
  return value.replace(/^['"]/, '').replace(/['"]$/, '').trim()
}

export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch?.[1]) {
    return {}
  }

  const frontmatter = frontmatterMatch[1]
  const nameMatch = frontmatter.match(/^\s*name:\s*(.+)$/m)
  const descriptionMatch = frontmatter.match(/^\s*description:\s*(.+)$/m)

  return {
    name: nameMatch?.[1] ? stripYamlWrapping(nameMatch[1]) : undefined,
    description: descriptionMatch?.[1] ? stripYamlWrapping(descriptionMatch[1]) : undefined,
  }
}

export async function scanSkillDirectory(directoryPath: string): Promise<SkillEntry[]> {
  const startedAt = Date.now()
  log.debug('[skill-scanner] scanning directory', { directoryPath })

  let directoryEntries: Array<import('node:fs').Dirent<string>>

  try {
    directoryEntries = await fs.readdir(directoryPath, {
      withFileTypes: true,
      encoding: 'utf8',
    })
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined

    const payload = {
      directoryPath,
      code,
      error: error instanceof Error ? error.message : String(error),
    }

    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES' || code === 'EPERM') {
      log.debug('[skill-scanner] skipping unreadable directory', payload)
      return []
    }

    log.warn('[skill-scanner] failed to read skill directory', payload)
    return []
  }

  const skills: SkillEntry[] = []

  for (const entry of directoryEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const skillFilePath = path.join(directoryPath, entry.name, 'SKILL.md')

    try {
      const content = await fs.readFile(skillFilePath, 'utf8')
      const frontmatter = parseSkillFrontmatter(content)
      const skillName = frontmatter.name?.trim() || entry.name.trim()

      if (!skillName) {
        continue
      }

      skills.push({
        name: skillName,
        description: frontmatter.description,
      })
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : undefined

      if (code !== 'ENOENT') {
        log.warn('[skill-scanner] failed to read SKILL.md', {
          directoryPath,
          skillDirectory: entry.name,
          skillFilePath,
          code,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  log.debug('[skill-scanner] directory scan complete', {
    directoryPath,
    discoveredSkillCount: skills.length,
    durationMs: Date.now() - startedAt,
  })

  return skills
}

export async function scanAllSkillDirectories(workspacePath?: string): Promise<SlashCommandEntry[]> {
  const startedAt = Date.now()
  const resolvedDirectories = resolveSkillDirectories(workspacePath)

  log.debug('[skill-scanner] scan start', {
    workspacePath: workspacePath ? path.resolve(workspacePath) : process.cwd(),
    directories: resolvedDirectories,
  })

  try {
    const dedupedSkills = new Map<string, SkillEntry>()

    for (const directoryPath of resolvedDirectories) {
      const skills = await scanSkillDirectory(directoryPath)

      for (const skill of skills) {
        const normalizedSkillName = skill.name.trim()
        if (!normalizedSkillName) {
          continue
        }

        const dedupeKey = normalizedSkillName.toLowerCase()
        if (!dedupedSkills.has(dedupeKey)) {
          dedupedSkills.set(dedupeKey, {
            ...skill,
            name: normalizedSkillName,
          })
        }
      }
    }

    const commands = Array.from(dedupedSkills.values())
      .map<SlashCommandEntry>((skill) => ({
        name: `/skill:${skill.name}`,
        description: skill.description,
        category: 'skill',
      }))
      .sort((left, right) => left.name.localeCompare(right.name))

    log.debug('[skill-scanner] scan complete', {
      discoveredSkillCount: commands.length,
      durationMs: Date.now() - startedAt,
    })

    return commands
  } catch (error) {
    log.warn('[skill-scanner] failed to scan skill directories', {
      workspacePath,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export async function refreshSkillCache(workspacePath?: string): Promise<SlashCommandEntry[]> {
  const now = Date.now()
  const resolvedWorkspacePath = workspacePath ? path.resolve(workspacePath) : process.cwd()

  if (
    cachedSkills &&
    cachedWorkspacePath === resolvedWorkspacePath &&
    now - lastRefreshAt < SKILL_REFRESH_DEBOUNCE_MS
  ) {
    log.debug('[skill-scanner] returning cached skills (debounced)', {
      workspacePath: resolvedWorkspacePath,
      ageMs: now - lastRefreshAt,
      cacheSize: cachedSkills.length,
    })

    return cachedSkills.map((entry) => ({ ...entry }))
  }

  const refreshedSkills = await scanAllSkillDirectories(resolvedWorkspacePath)
  cachedSkills = refreshedSkills
  cachedWorkspacePath = resolvedWorkspacePath
  lastRefreshAt = now

  return refreshedSkills.map((entry) => ({ ...entry }))
}

export function getCachedSkills(): SlashCommandEntry[] | null {
  return cachedSkills ? cachedSkills.map((entry) => ({ ...entry })) : null
}

export function clearSkillCache(): void {
  cachedSkills = null
  cachedWorkspacePath = null
  lastRefreshAt = 0
}
