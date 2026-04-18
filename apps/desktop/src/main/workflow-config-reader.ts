import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { WorkflowBoardError, WorkflowTrackerConfig } from '../shared/types'

export interface WorkflowConfigReadResult {
  config: WorkflowTrackerConfig | null
  error?: WorkflowBoardError
}

export async function readWorkspaceWorkflowTrackerConfig(
  workspacePath: string,
): Promise<WorkflowConfigReadResult> {
  const preferencesPath = path.join(workspacePath, '.kata', 'preferences.md')

  let content: string
  try {
    content = await fs.readFile(preferencesPath, 'utf8')
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined

    if (code === 'ENOENT') {
      return { config: null }
    }

    return {
      config: null,
      error: {
        code: 'UNKNOWN',
        message: `Unable to read .kata/preferences.md: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }

  const frontmatterMatch = content.match(/^\uFEFF?\s*---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch?.[1]) {
    return { config: null }
  }

  const frontmatter = frontmatterMatch[1]
  const workflowBlock = extractNestedBlock(frontmatter, 'workflow')
  const workflowFields = workflowBlock ? parseSimpleObject(workflowBlock) : {}
  const mode = stripYamlWrapping(workflowFields.mode ?? '').toLowerCase()

  if (!mode || mode === 'linear') {
    return { config: { kind: 'linear' } }
  }

  if (mode !== 'github') {
    return {
      config: null,
      error: {
        code: 'INVALID_CONFIG',
        message: 'workflow.mode must be either linear or github in .kata/preferences.md.',
      },
    }
  }

  const githubBlock = extractNestedBlock(frontmatter, 'github')
  if (!githubBlock) {
    return {
      config: null,
      error: {
        code: 'INVALID_CONFIG',
        message:
          'GitHub workflow mode requires a github block in .kata/preferences.md with repoOwner and repoName.',
      },
    }
  }

  const githubFields = parseSimpleObject(githubBlock)

  const repoOwner = stripYamlWrapping(githubFields.repoOwner ?? '')
  const repoName = stripYamlWrapping(githubFields.repoName ?? '')
  const normalizedLabelPrefix = stripYamlWrapping(githubFields.labelPrefix ?? '')
    .trim()
    .replace(/:+$/, '')
  const labelPrefix = normalizedLabelPrefix || undefined

  if (!repoOwner || !repoName) {
    return {
      config: null,
      error: {
        code: 'INVALID_CONFIG',
        message: 'GitHub workflow mode requires github.repoOwner and github.repoName in .kata/preferences.md.',
      },
    }
  }

  const projectNumberRaw = stripYamlWrapping(githubFields.githubProjectNumber ?? '')
  let githubProjectNumber: number | undefined
  if (projectNumberRaw) {
    const parsedProjectNumber = Number(projectNumberRaw)
    if (!Number.isFinite(parsedProjectNumber) || parsedProjectNumber <= 0) {
      return {
        config: null,
        error: {
          code: 'INVALID_CONFIG',
          message: 'github.githubProjectNumber must be a positive number in .kata/preferences.md.',
        },
      }
    }

    githubProjectNumber = parsedProjectNumber
  }

  const stateModeRaw = stripYamlWrapping(githubFields.stateMode ?? '').toLowerCase()
  let stateMode: 'labels' | 'projects_v2'

  if (!stateModeRaw) {
    stateMode = githubProjectNumber ? 'projects_v2' : 'labels'
  } else if (stateModeRaw === 'labels' || stateModeRaw === 'projects_v2') {
    stateMode = stateModeRaw
  } else {
    return {
      config: null,
      error: {
        code: 'INVALID_CONFIG',
        message: 'github.stateMode must be labels or projects_v2 in .kata/preferences.md.',
      },
    }
  }

  return {
    config: {
      kind: 'github',
      repoOwner,
      repoName,
      stateMode,
      githubProjectNumber,
      labelPrefix,
    },
  }
}

function extractNestedBlock(frontmatter: string, key: string): string | null {
  const lines = frontmatter.split(/\r?\n/)
  const anchorIndex = lines.findIndex((line) => new RegExp(`^\\s*${escapeRegex(key)}:\\s*$`).test(line))

  if (anchorIndex === -1) {
    return null
  }

  const anchorIndent = indentationOf(lines[anchorIndex] ?? '')
  const nested: string[] = []

  for (let index = anchorIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      nested.push(line)
      continue
    }

    const indent = indentationOf(line)
    if (indent <= anchorIndent) {
      break
    }

    nested.push(line.slice(anchorIndent + 2))
  }

  return nested.join('\n')
}

function parseSimpleObject(block: string): Record<string, string> {
  const result: Record<string, string> = {}

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/)
    if (!match) {
      continue
    }

    const key = match[1] ?? ''
    const rawValue = match[2] ?? ''
    result[key] = stripInlineComment(rawValue).trim()
  }

  return result
}

function stripInlineComment(value: string): string {
  let inSingle = false
  let inDouble = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }

    if (char === '#' && !inSingle && !inDouble) {
      return value.slice(0, index)
    }
  }

  return value
}

function stripYamlWrapping(value: string): string {
  return value.replace(/^['"]/, '').replace(/['"]$/, '').trim()
}

function indentationOf(line: string): number {
  const match = line.match(/^\s*/)
  return match?.[0].length ?? 0
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
