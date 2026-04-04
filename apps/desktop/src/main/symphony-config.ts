import { accessSync, constants, existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type {
  SymphonyConfigSource,
  SymphonyLaunchDescriptor,
  SymphonyLaunchSource,
  SymphonyRuntimeError,
} from '../shared/types'

const DEFAULT_URL_ENV_KEY = 'SYMPHONY_URL'
const FALLBACK_URL_ENV_KEY = 'KATA_SYMPHONY_URL'
const SYMPHONY_BIN_ENV_KEY = 'KATA_SYMPHONY_BIN_PATH'

interface SymphonyPreferences {
  symphony?: {
    url?: string
    workflow_path?: string
  }
}

export interface ResolveSymphonyLaunchOptions {
  workspacePath: string
  appIsPackaged: boolean
  resourcesPath?: string
  env?: NodeJS.ProcessEnv
  preferences?: SymphonyPreferences | null
}

export type SymphonyLaunchResolution =
  | {
      ok: true
      launch: SymphonyLaunchDescriptor
    }
  | {
      ok: false
      error: SymphonyRuntimeError
    }

export async function resolveSymphonyLaunch(
  options: ResolveSymphonyLaunchOptions,
): Promise<SymphonyLaunchResolution> {
  const env = options.env ?? process.env
  const preferences = options.preferences ?? (await loadWorkspacePreferences(options.workspacePath))

  const resolvedUrl = resolveConfiguredUrl(preferences, env)
  if (!resolvedUrl.ok) {
    return resolvedUrl
  }

  const resolvedWorkflowPath = resolveWorkflowPath(preferences, options.workspacePath)
  if (!resolvedWorkflowPath.ok) {
    return resolvedWorkflowPath
  }

  const resolvedBinary = resolveBinaryPath({
    appIsPackaged: options.appIsPackaged,
    resourcesPath: options.resourcesPath,
    env,
    workspacePath: options.workspacePath,
  })
  if (!resolvedBinary.ok) {
    return resolvedBinary
  }

  const parsedUrl = new URL(resolvedUrl.url)
  const port = parsedUrl.port ? Number(parsedUrl.port) : parsedUrl.protocol === 'https:' ? 443 : 80

  return {
    ok: true,
    launch: {
      command: resolvedBinary.command,
      args: [resolvedWorkflowPath.workflowPath, '--no-tui', '--port', String(port)],
      cwd: options.workspacePath,
      source: resolvedBinary.source,
      resolvedUrl: resolvedUrl.url,
      workflowPath: resolvedWorkflowPath.workflowPath,
      urlSource: resolvedUrl.source,
      workflowPathSource: resolvedWorkflowPath.source,
    },
  }
}

export async function loadWorkspacePreferences(workspacePath: string): Promise<SymphonyPreferences | null> {
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
      return null
    }

    return null
  }

  const frontmatterMatch = content.match(/^\uFEFF?\s*---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch?.[1]) {
    return null
  }

  const symphonyBlock = extractNestedBlock(frontmatterMatch[1], 'symphony')
  if (!symphonyBlock) {
    return null
  }

  const fields = parseSimpleObject(symphonyBlock)

  return {
    symphony: {
      url: stripYamlWrapping(fields.url ?? ''),
      workflow_path: stripYamlWrapping(fields.workflow_path ?? ''),
    },
  }
}

function resolveConfiguredUrl(
  preferences: SymphonyPreferences | null,
  env: NodeJS.ProcessEnv,
):
  | { ok: true; url: string; source: SymphonyConfigSource }
  | { ok: false; error: SymphonyRuntimeError } {
  const prefCandidate = normalizeCandidate(preferences?.symphony?.url)
  if (prefCandidate) {
    return normalizeAndValidateUrl(prefCandidate, 'preferences')
  }

  const envCandidate = normalizeCandidate(env[FALLBACK_URL_ENV_KEY]) ?? normalizeCandidate(env[DEFAULT_URL_ENV_KEY])

  if (envCandidate) {
    return normalizeAndValidateUrl(envCandidate, 'env')
  }

  return {
    ok: false,
    error: {
      code: 'CONFIG_MISSING',
      phase: 'config',
      message: `Symphony URL is not configured. Set symphony.url in .kata/preferences.md or set ${FALLBACK_URL_ENV_KEY}/${DEFAULT_URL_ENV_KEY}.`,
    },
  }
}

function normalizeAndValidateUrl(
  rawUrl: string,
  source: SymphonyConfigSource,
):
  | { ok: true; url: string; source: SymphonyConfigSource }
  | { ok: false; error: SymphonyRuntimeError } {
  let parsed: URL

  try {
    parsed = new URL(rawUrl)
  } catch {
    return {
      ok: false,
      error: {
        code: 'CONFIG_INVALID',
        phase: 'config',
        message: `Invalid Symphony URL from ${source}.`,
        details: 'malformed_url',
      },
    }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: {
        code: 'CONFIG_INVALID',
        phase: 'config',
        message: `Invalid Symphony URL protocol from ${source}: ${parsed.protocol}`,
        details: 'unsupported_protocol',
      },
    }
  }

  if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  }

  return {
    ok: true,
    url: parsed.toString().replace(/\/$/, ''),
    source,
  }
}

function resolveWorkflowPath(
  preferences: SymphonyPreferences | null,
  workspacePath: string,
):
  | { ok: true; workflowPath: string; source: SymphonyConfigSource }
  | { ok: false; error: SymphonyRuntimeError } {
  const configuredPath = normalizeCandidate(preferences?.symphony?.workflow_path)
  if (configuredPath) {
    const resolved = toAbsolutePath(configuredPath, workspacePath)
    if (existsSync(resolved)) {
      return {
        ok: true,
        workflowPath: resolved,
        source: 'preferences',
      }
    }

    return {
      ok: false,
      error: {
        code: 'WORKFLOW_PATH_MISSING',
        phase: 'config',
        message: `Configured symphony.workflow_path does not exist: ${resolved}`,
      },
    }
  }

  const workspaceWorkflow = path.join(workspacePath, 'WORKFLOW.md')
  if (existsSync(workspaceWorkflow)) {
    return {
      ok: true,
      workflowPath: workspaceWorkflow,
      source: 'default',
    }
  }

  return {
    ok: false,
    error: {
      code: 'WORKFLOW_PATH_MISSING',
      phase: 'config',
      message:
        'No workflow file is configured. Add symphony.workflow_path in .kata/preferences.md or create WORKFLOW.md in the workspace.',
    },
  }
}

function resolveBinaryPath(options: {
  appIsPackaged: boolean
  resourcesPath?: string
  env: NodeJS.ProcessEnv
  workspacePath: string
}):
  | { ok: true; command: string; source: SymphonyLaunchSource }
  | { ok: false; error: SymphonyRuntimeError } {
  const fromEnv = normalizeCandidate(options.env[SYMPHONY_BIN_ENV_KEY])
  if (fromEnv) {
    const envPath = toAbsolutePath(fromEnv, options.workspacePath)
    if (isExecutableFile(envPath)) {
      return { ok: true, command: envPath, source: 'env' }
    }

    return {
      ok: false,
      error: {
        code: 'BINARY_NOT_FOUND',
        phase: 'config',
        message: `${SYMPHONY_BIN_ENV_KEY} is set but not executable: ${envPath}`,
      },
    }
  }

  if (options.appIsPackaged) {
    const packagedPath = path.join(options.resourcesPath ?? process.resourcesPath, 'symphony')
    if (isExecutableFile(packagedPath)) {
      return { ok: true, command: packagedPath, source: 'bundled' }
    }
  }

  const lookupCommand = process.platform === 'win32' ? 'where' : 'which'
  const whichResult = spawnSync(lookupCommand, ['symphony'], {
    stdio: 'pipe',
    encoding: 'utf8',
    env: options.env,
  })

  if (whichResult.status === 0) {
    const discovered = whichResult.stdout.trim().split(/\r?\n/)[0]?.trim()
    if (discovered && isExecutableFile(discovered)) {
      return {
        ok: true,
        command: discovered,
        source: 'path',
      }
    }
  }

  return {
    ok: false,
    error: {
      code: 'BINARY_NOT_FOUND',
      phase: 'config',
      message:
        'Symphony binary not found. Install `symphony` on PATH, set KATA_SYMPHONY_BIN_PATH, or bundle the binary for packaged app execution.',
    },
  }
}

function normalizeCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toAbsolutePath(target: string, cwd: string): string {
  const expanded =
    target === '~' || target.startsWith('~/')
      ? path.join(homedir(), target === '~' ? '' : target.slice(2))
      : target

  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded)
}

function isExecutableFile(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
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
