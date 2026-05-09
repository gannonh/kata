import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs'
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

const PRIMARY_URL_ENV_KEY = 'KATA_SYMPHONY_URL'
const LEGACY_URL_ENV_KEY = 'SYMPHONY_URL'
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
  const launchWorkspacePath = resolveSymphonyWorkspaceRoot(options.workspacePath)

  let preferences: SymphonyPreferences | null
  try {
    preferences = options.preferences ?? (await loadWorkspacePreferences(launchWorkspacePath))
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'CONFIG_INVALID',
        phase: 'config',
        message: `Unable to read workspace preferences: ${error instanceof Error ? error.message : String(error)}`,
        details: 'preferences_read_failed',
      },
    }
  }

  const resolvedWorkflowPath = resolveWorkflowPath(launchWorkspacePath)
  if (!resolvedWorkflowPath.ok) {
    return resolvedWorkflowPath
  }

  const resolvedUrl = resolveConfiguredUrl(preferences, env, resolvedWorkflowPath.workflowPath)
  if (!resolvedUrl.ok) {
    return resolvedUrl
  }

  const resolvedBinary = resolveBinaryPath({
    appIsPackaged: options.appIsPackaged,
    resourcesPath: options.resourcesPath,
    env,
    workspacePath: launchWorkspacePath,
    workflowPath: resolvedWorkflowPath.workflowPath,
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
      args: ['--no-tui', '--port', String(port)],
      cwd: launchWorkspacePath,
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

    throw error
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
  workflowPath: string,
):
  | { ok: true; url: string; source: SymphonyConfigSource }
  | { ok: false; error: SymphonyRuntimeError } {
  const prefCandidate = normalizeCandidate(preferences?.symphony?.url)
  if (prefCandidate) {
    return normalizeAndValidateUrl(prefCandidate, 'preferences')
  }

  const envCandidate = normalizeCandidate(env[PRIMARY_URL_ENV_KEY]) ?? normalizeCandidate(env[LEGACY_URL_ENV_KEY])

  if (envCandidate) {
    return normalizeAndValidateUrl(envCandidate, 'env')
  }

  return normalizeAndValidateUrl(resolveDefaultUrlFromWorkflow(workflowPath), 'default')
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
  workspacePath: string,
):
  | { ok: true; workflowPath: string; source: SymphonyConfigSource }
  | { ok: false; error: SymphonyRuntimeError } {
  const projectHomeWorkflow = path.join(workspacePath, '.symphony', 'WORKFLOW.md')
  if (existsSync(projectHomeWorkflow) && isExistingFile(projectHomeWorkflow)) {
    return {
      ok: true,
      workflowPath: projectHomeWorkflow,
      source: 'default',
    }
  }

  const workspaceWorkflow = path.join(workspacePath, 'WORKFLOW.md')
  if (existsSync(workspaceWorkflow) && isExistingFile(workspaceWorkflow)) {
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
      message: 'No Symphony workflow file was found. Create .symphony/WORKFLOW.md in the workspace.',
    },
  }
}

function resolveBinaryPath(options: {
  appIsPackaged: boolean
  resourcesPath?: string
  env: NodeJS.ProcessEnv
  workspacePath: string
  workflowPath: string
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
    const resourcesPath = options.resourcesPath ?? process.resourcesPath
    const bundledCandidates =
      process.platform === 'win32'
        ? [path.join(resourcesPath, 'symphony.exe'), path.join(resourcesPath, 'symphony')]
        : [path.join(resourcesPath, 'symphony')]

    for (const bundledPath of bundledCandidates) {
      if (isExecutableFile(bundledPath)) {
        return { ok: true, command: bundledPath, source: 'bundled' }
      }
    }
  }

  const workflowDir = path.dirname(options.workflowPath)
  const sourceTreeSymphonyDir = path.join(options.workspacePath, 'apps', 'symphony')
  const workflowBinaryCandidates =
    process.platform === 'win32'
      ? [
          path.join(sourceTreeSymphonyDir, 'target', 'release', 'symphony.exe'),
          path.join(sourceTreeSymphonyDir, 'target', 'debug', 'symphony.exe'),
          path.join(workflowDir, 'target', 'release', 'symphony.exe'),
          path.join(workflowDir, 'target', 'debug', 'symphony.exe'),
        ]
      : [
          path.join(sourceTreeSymphonyDir, 'target', 'release', 'symphony'),
          path.join(sourceTreeSymphonyDir, 'target', 'debug', 'symphony'),
          path.join(workflowDir, 'target', 'release', 'symphony'),
          path.join(workflowDir, 'target', 'debug', 'symphony'),
        ]

  for (const candidate of workflowBinaryCandidates) {
    if (isExecutableFile(candidate)) {
      return { ok: true, command: candidate, source: 'path' }
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

function resolveSymphonyWorkspaceRoot(workspacePath: string): string {
  const resolvedWorkspacePath = path.resolve(workspacePath)
  let cursor = isExistingDirectory(resolvedWorkspacePath)
    ? resolvedWorkspacePath
    : path.dirname(resolvedWorkspacePath)

  while (true) {
    const projectHomeWorkflow = path.join(cursor, '.symphony', 'WORKFLOW.md')
    if (existsSync(projectHomeWorkflow) && isExistingFile(projectHomeWorkflow)) {
      return cursor
    }

    const parent = path.dirname(cursor)
    if (parent === cursor) {
      return resolvedWorkspacePath
    }

    cursor = parent
  }
}

function resolveDefaultUrlFromWorkflow(workflowPath: string): string {
  const fallbackHost = '127.0.0.1'
  const fallbackPort = 8080

  try {
    const content = readFileSync(workflowPath, 'utf8')
    const frontmatterMatch = content.match(/^\uFEFF?\s*---\s*\r?\n([\s\S]*?)\r?\n---/)
    const serverBlock = frontmatterMatch?.[1]
      ? extractNestedBlock(frontmatterMatch[1], 'server')
      : null
    const fields = serverBlock ? parseSimpleObject(serverBlock) : {}
    const host = normalizeCandidate(stripYamlWrapping(fields.host ?? '')) ?? fallbackHost
    const portRaw = normalizeCandidate(stripYamlWrapping(fields.port ?? ''))
    const parsedPort = portRaw ? Number(portRaw) : fallbackPort
    const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : fallbackPort
    const clientHost = host === '0.0.0.0' || host === '::' ? fallbackHost : host

    return `http://${clientHost}:${port}`
  } catch {
    return `http://${fallbackHost}:${fallbackPort}`
  }
}

function normalizeCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toAbsolutePath(target: string, cwd: string): string {
  const normalized = target.replace(/\\/g, path.sep)
  const expanded =
    normalized === '~' || normalized.startsWith(`~${path.sep}`)
      ? path.join(homedir(), normalized === '~' ? '' : normalized.slice(2))
      : normalized

  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded)
}

function isExistingFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function isExistingDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory()
  } catch {
    return false
  }
}

function isExecutableFile(filePath: string): boolean {
  const candidates =
    process.platform === 'win32' && !filePath.toLowerCase().endsWith('.exe')
      ? [filePath, `${filePath}.exe`]
      : [filePath]

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return true
    } catch {
      // keep checking candidate variants
    }
  }

  return false
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
