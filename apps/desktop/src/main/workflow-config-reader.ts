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
  const workflowPath = path.join(workspacePath, 'WORKFLOW.md')

  let content: string
  try {
    content = await fs.readFile(workflowPath, 'utf8')
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
        message: `Unable to read WORKFLOW.md: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }

  const frontmatterMatch = content.match(/^\uFEFF?\s*---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch?.[1]) {
    return {
      config: null,
      error: {
        code: 'INVALID_CONFIG',
        message: 'WORKFLOW.md is missing YAML frontmatter.',
      },
    }
  }

  const frontmatter = frontmatterMatch[1]
  const trackerBlock = extractNestedBlock(frontmatter, 'tracker')

  if (!trackerBlock) {
    return { config: { kind: 'linear' } }
  }

  const trackerFields = parseSimpleObject(trackerBlock)
  const kind = (trackerFields.kind ?? 'linear').toLowerCase()

  if (kind !== 'github') {
    return { config: { kind: 'linear' } }
  }

  const repoOwner = stripYamlWrapping(trackerFields.repo_owner ?? '')
  const repoName = stripYamlWrapping(trackerFields.repo_name ?? '')
  const labelPrefix = stripYamlWrapping(trackerFields.label_prefix ?? '') || undefined

  if (!repoOwner || !repoName) {
    return {
      config: null,
      error: {
        code: 'INVALID_CONFIG',
        message: 'GitHub tracker requires tracker.repo_owner and tracker.repo_name in WORKFLOW.md.',
      },
    }
  }

  const projectNumberRaw = stripYamlWrapping(trackerFields.github_project_number ?? '')

  let githubProjectNumber: number | undefined
  if (projectNumberRaw) {
    const parsedProjectNumber = Number(projectNumberRaw)
    if (!Number.isFinite(parsedProjectNumber) || parsedProjectNumber <= 0) {
      return {
        config: null,
        error: {
          code: 'INVALID_CONFIG',
          message: 'tracker.github_project_number must be a positive number in WORKFLOW.md.',
        },
      }
    }

    githubProjectNumber = parsedProjectNumber
  }

  return {
    config: {
      kind: 'github',
      repoOwner,
      repoName,
      stateMode: githubProjectNumber ? 'projects_v2' : 'labels',
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
