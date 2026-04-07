import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import log from './logger'
import type {
  SessionInfo,
  SessionListItem,
  SessionListResponse,
  SessionTokenUsage,
} from '../shared/types'

interface ParsedSessionMetadata {
  id: string
  name: string | null
  title: string
  model: string | null
  provider: string | null
  created: string
  modified: string
  messageCount: number
  firstMessagePreview: string | null
  tokenUsage?: SessionTokenUsage
}

interface SessionHeader {
  id?: string
  timestamp?: string
  cwd?: string
}

const HEADER_READ_SIZE_BYTES = 8 * 1024

function normalizePath(value: string): string {
  return path.resolve(value)
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toIsoDate(value: Date): string {
  return value.toISOString()
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function extractTokenUsage(candidate: unknown): SessionTokenUsage | undefined {
  if (!candidate || typeof candidate !== 'object') {
    return undefined
  }

  const value = candidate as Record<string, unknown>
  const input = toOptionalNumber(value.input)
  const output = toOptionalNumber(value.output)
  const cacheRead = toOptionalNumber(value.cacheRead)
  const cacheWrite = toOptionalNumber(value.cacheWrite)
  const total = toOptionalNumber(value.total) ?? toOptionalNumber(value.totalTokens)

  if (
    input === undefined &&
    output === undefined &&
    cacheRead === undefined &&
    cacheWrite === undefined &&
    total === undefined
  ) {
    return undefined
  }

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total,
  }
}

function extractSessionIdFromFilename(filePath: string): string {
  const match = path.basename(filePath).match(/_([0-9a-fA-F-]{32,36})\.jsonl$/)
  if (match?.[1]) {
    return match[1]
  }

  return path.basename(filePath, '.jsonl')
}

function extractName(entry: Record<string, unknown>): string | null {
  const candidates = [entry.name, entry.sessionName, entry.title]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

function extractMessageText(message: unknown): string | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const payload = message as Record<string, unknown>
  const content = payload.content

  if (typeof content === 'string') {
    const normalized = cleanText(content)
    return normalized || null
  }

  if (!Array.isArray(content)) {
    return null
  }

  const parts: string[] = []

  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const block = item as Record<string, unknown>
    if (typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text)
    }
  }

  const combined = cleanText(parts.join(' '))
  return combined || null
}

export class DesktopSessionManager {
  public constructor(
    private readonly sessionsDirectory = path.join(homedir(), '.kata-cli', 'sessions'),
  ) {}

  /**
   * List sessions for the given workspace directory.
   *
   */
  public async listSessions(
    cwd: string,
    _knownSessionIds?: ReadonlySet<string>,
  ): Promise<SessionListResponse> {
    const normalizedCwd = normalizePath(cwd)

    let entries: Array<{ filePath: string }> = []
    const warnings: string[] = []

    try {
      const dirEntries = await fs.readdir(this.sessionsDirectory, { withFileTypes: true })

      for (const dirEntry of dirEntries) {
        if (!dirEntry.isFile() || !dirEntry.name.endsWith('.jsonl')) {
          continue
        }

        const filePath = path.join(this.sessionsDirectory, dirEntry.name)

        entries.push({
          filePath,
        })
      }
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        log.info('[desktop-session-manager] sessions directory does not exist yet', {
          directory: this.sessionsDirectory,
          cwd: normalizedCwd,
        })
        return {
          sessions: [],
          warnings,
          directory: this.sessionsDirectory,
        }
      }

      throw error
    }

    const sessionItems: SessionListItem[] = []

    for (const entry of entries) {
      try {
        const header = await this.readHeader(entry.filePath)

        if (!header?.cwd || normalizePath(header.cwd) !== normalizedCwd) {
          continue
        }


        const metadata = await this.parseSessionFile(entry.filePath)
        sessionItems.push({
          id: metadata.id,
          path: entry.filePath,
          name: metadata.name,
          title: metadata.title,
          model: metadata.model,
          provider: metadata.provider,
          created: metadata.created,
          modified: metadata.modified,
          messageCount: metadata.messageCount,
          firstMessagePreview: metadata.firstMessagePreview,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`${path.basename(entry.filePath)}: ${message}`)
        log.warn('[desktop-session-manager] skipped corrupted session file', {
          path: entry.filePath,
          error: message,
        })
      }
    }

    sessionItems.sort((a, b) => b.modified.localeCompare(a.modified))

    log.info('[desktop-session-manager] loaded session list', {
      directory: this.sessionsDirectory,
      cwd: normalizedCwd,
      count: sessionItems.length,
      warningCount: warnings.length,

    })

    return {
      sessions: sessionItems,
      warnings,
      directory: this.sessionsDirectory,
    }
  }

  public async getSessionInfo(sessionPath: string): Promise<SessionInfo> {
    const resolvedPath = this.resolveSessionPath(sessionPath)
    const metadata = await this.parseSessionFile(resolvedPath)

    return {
      id: metadata.id,
      path: resolvedPath,
      name: metadata.name,
      title: metadata.title,
      model: metadata.model,
      provider: metadata.provider,
      created: metadata.created,
      modified: metadata.modified,
      messageCount: metadata.messageCount,
      firstMessagePreview: metadata.firstMessagePreview,
      tokenUsage: metadata.tokenUsage,
    }
  }

  public async resolveSessionPathById(
    sessionId: string,
    cwd: string,
  ): Promise<string | null> {
    const trimmedSessionId = sessionId.trim()
    if (!trimmedSessionId) {
      throw new Error('Session ID is required')
    }

    const response = await this.listSessions(cwd)
    const match = response.sessions.find((session) => session.id === trimmedSessionId)
    return match?.path ?? null
  }

  private resolveSessionPath(sessionPath: string): string {
    const trimmed = sessionPath.trim()
    if (!trimmed) {
      throw new Error('Session path is required')
    }

    const candidate = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)
      : path.resolve(this.sessionsDirectory, trimmed)

    const relative = path.relative(this.sessionsDirectory, candidate)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Session path must be inside the sessions directory')
    }

    return candidate
  }

  private async readHeader(sessionFilePath: string): Promise<SessionHeader | null> {
    const handle = await fs.open(sessionFilePath, 'r')

    try {
      const buffer = Buffer.alloc(HEADER_READ_SIZE_BYTES)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)

      if (bytesRead <= 0) {
        return null
      }

      const chunk = buffer.subarray(0, bytesRead).toString('utf8')
      const newlineIndex = chunk.indexOf('\n')
      const firstLine = (newlineIndex >= 0 ? chunk.slice(0, newlineIndex) : chunk).trim()

      if (!firstLine) {
        return null
      }

      const parsed = JSON.parse(firstLine)
      if (!parsed || typeof parsed !== 'object') {
        return null
      }

      const header = parsed as Record<string, unknown>
      return {
        id: typeof header.id === 'string' ? header.id : undefined,
        timestamp: typeof header.timestamp === 'string' ? header.timestamp : undefined,
        cwd: typeof header.cwd === 'string' ? header.cwd : undefined,
      }
    } finally {
      await handle.close()
    }
  }

  private async parseSessionFile(sessionFilePath: string): Promise<ParsedSessionMetadata> {
    const raw = await fs.readFile(sessionFilePath, 'utf8')
    const stat = await fs.stat(sessionFilePath)
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      throw new Error('Session file is empty')
    }

    const parsedLines = lines.map((line, index) => {
      try {
        return JSON.parse(line) as Record<string, unknown>
      } catch (error) {
        throw new Error(`Invalid JSON at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
      }
    })

    const first = parsedLines[0]
    if (!first) {
      throw new Error('Missing session header')
    }

    const header: SessionHeader = {
      id: typeof first.id === 'string' ? first.id : undefined,
      timestamp: typeof first.timestamp === 'string' ? first.timestamp : undefined,
      cwd: typeof first.cwd === 'string' ? first.cwd : undefined,
    }

    const fallbackId = extractSessionIdFromFilename(sessionFilePath)
    const id = header.id ?? fallbackId

    let name: string | null = null
    let firstUserMessage: string | null = null
    let provider: string | null = null
    let model: string | null = null
    let messageCount = 0
    let tokenUsage: SessionTokenUsage | undefined

    for (const entry of parsedLines) {
      const type = typeof entry.type === 'string' ? entry.type : null

      if (!name && type && (type === 'session_info' || type === 'session_name')) {
        name = extractName(entry)
      }

      if (type === 'model_change') {
        const providerCandidate = entry.provider
        const modelCandidate = entry.modelId

        if (typeof providerCandidate === 'string' && providerCandidate.trim()) {
          provider = providerCandidate.trim()
        }

        if (typeof modelCandidate === 'string' && modelCandidate.trim()) {
          const normalizedModel = modelCandidate.trim()
          model = provider ? `${provider}/${normalizedModel}` : normalizedModel
        }
      }

      if (type === 'message' && entry.message && typeof entry.message === 'object') {
        const message = entry.message as Record<string, unknown>
        const role = typeof message.role === 'string' ? message.role : null

        if (role === 'user' || role === 'assistant') {
          messageCount += 1
        }

        if (!firstUserMessage && role === 'user') {
          firstUserMessage = extractMessageText(message)
        }

        if (!model) {
          const modelCandidate = typeof message.model === 'string' ? message.model.trim() : ''
          if (modelCandidate) {
            model = modelCandidate
          }
        }

        if (!provider) {
          const providerCandidate =
            typeof message.provider === 'string' ? message.provider.trim() : ''
          if (providerCandidate) {
            provider = providerCandidate
          }
        }

        if (!tokenUsage && message.usage) {
          tokenUsage = extractTokenUsage(message.usage)
        }
      }

      if (!tokenUsage && type === 'session_stats') {
        tokenUsage = extractTokenUsage(entry.tokens)
      }

      if (!tokenUsage && type === 'response') {
        const data = entry.data
        if (data && typeof data === 'object') {
          tokenUsage = extractTokenUsage((data as Record<string, unknown>).tokens)
        }
      }
    }

    const firstMessagePreview = firstUserMessage ? truncate(firstUserMessage, 100) : null
    const titleSource = name ?? firstMessagePreview ?? 'Untitled session'
    const title = truncate(cleanText(titleSource), 100)
    const created = header.timestamp ?? toIsoDate(stat.birthtime)
    const modified = toIsoDate(stat.mtime)

    return {
      id,
      name,
      title,
      model,
      provider,
      created,
      modified,
      messageCount,
      firstMessagePreview,
      tokenUsage,
    }
  }
}
