import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import log from './logger'
import type {
  McpConfigProvenance,
  McpConfigReadResponse,
  McpDirectTools,
  McpHttpServerInput,
  McpServerDeleteResponse,
  McpServerInput,
  McpServerMutationResponse,
  McpServerResponse,
  McpServerSummary,
  McpValidationError,
} from '../shared/types'

type McpBridgeErrorCode = NonNullable<McpServerMutationResponse['error']>['code']

const DEFAULT_MCP_CONFIG_PATH = path.join(homedir(), '.kata-cli', 'agent', 'mcp.json')

const STARTER_MCP_CONFIG = {
  imports: [] as string[],
  settings: {
    toolPrefix: 'server',
    idleTimeout: 10,
  },
  mcpServers: {} as Record<string, unknown>,
}

type JsonObject = Record<string, unknown>

export interface McpRuntimeStdioServer {
  name: string
  transport: 'stdio'
  enabled: boolean
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string>
}

export interface McpRuntimeHttpServer {
  name: string
  transport: 'http'
  enabled: boolean
  url: string
  auth: 'none' | 'bearer'
  bearerToken?: string
  bearerTokenEnv?: string
}

export type McpRuntimeServerConfig = McpRuntimeStdioServer | McpRuntimeHttpServer

interface McpLoadedConfig {
  configPath: string
  rawConfig: JsonObject
  mcpServers: Record<string, unknown>
  provenance: McpConfigProvenance
}

interface McpBridgeOptions {
  configPath?: string
  getWorkspacePath?: () => string | null
}

export class McpConfigBridge {
  private readonly configPath: string
  private readonly getWorkspacePath?: () => string | null

  constructor(options?: McpBridgeOptions) {
    this.configPath = options?.configPath?.trim() || DEFAULT_MCP_CONFIG_PATH
    this.getWorkspacePath = options?.getWorkspacePath
  }

  public getConfigPath(): string {
    return this.configPath
  }

  public async listServers(): Promise<McpConfigReadResponse> {
    const loaded = await this.loadConfig()
    if (!loaded.success) {
      return loaded.response
    }

    return {
      success: true,
      provenance: loaded.config.provenance,
      servers: this.toServerSummaries(loaded.config.mcpServers),
    }
  }

  public async getServer(name: string): Promise<McpServerResponse> {
    const loaded = await this.loadConfig()
    if (!loaded.success) {
      return loaded.response
    }

    const normalizedName = name.trim()
    const rawServer = loaded.config.mcpServers[normalizedName]

    if (!normalizedName || !isObject(rawServer)) {
      return {
        success: false,
        provenance: loaded.config.provenance,
        error: {
          code: 'SERVER_NOT_FOUND',
          message: `MCP server "${normalizedName || name}" was not found.`,
        },
      }
    }

    return {
      success: true,
      provenance: loaded.config.provenance,
      server: this.toServerSummary(normalizedName, rawServer),
    }
  }

  public async saveServer(input: McpServerInput): Promise<McpServerMutationResponse> {
    const loaded = await this.loadConfig()
    if (!loaded.success) {
      return loaded.response
    }

    const name = input.name.trim()
    const existingServer = asObject(loaded.config.mcpServers[name])

    const validationErrors = validateServerInput(input, existingServer)
    if (validationErrors.length > 0) {
      return {
        success: false,
        provenance: loaded.config.provenance,
        validationErrors,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Server configuration contains validation errors.',
        },
      }
    }

    const nextServer = normalizeServerForWrite(existingServer, input)

    const nextConfig: JsonObject = {
      ...loaded.config.rawConfig,
      mcpServers: {
        ...loaded.config.mcpServers,
        [name]: nextServer,
      },
    }

    const writeResult = await this.writeConfig(nextConfig)
    if (!writeResult.success) {
      return {
        success: false,
        provenance: loaded.config.provenance,
        error: writeResult.error,
      }
    }

    return {
      success: true,
      provenance: loaded.config.provenance,
      server: this.toServerSummary(name, nextServer),
    }
  }

  public async deleteServer(name: string): Promise<McpServerDeleteResponse> {
    const loaded = await this.loadConfig()
    if (!loaded.success) {
      return {
        success: false,
        provenance: loaded.response.provenance,
        error: toDeleteResponseError(loaded.response.error),
      }
    }

    const normalizedName = name.trim()
    if (!normalizedName || !Object.prototype.hasOwnProperty.call(loaded.config.mcpServers, normalizedName)) {
      return {
        success: false,
        provenance: loaded.config.provenance,
        error: {
          code: 'SERVER_NOT_FOUND',
          message: `MCP server "${normalizedName || name}" was not found.`,
        },
      }
    }

    const nextServers = { ...loaded.config.mcpServers }
    delete nextServers[normalizedName]

    const nextConfig: JsonObject = {
      ...loaded.config.rawConfig,
      mcpServers: nextServers,
    }

    const writeResult = await this.writeConfig(nextConfig)
    if (!writeResult.success) {
      return {
        success: false,
        provenance: loaded.config.provenance,
        error: writeResult.error,
      }
    }

    return {
      success: true,
      provenance: loaded.config.provenance,
      deletedServerName: normalizedName,
    }
  }

  public async getRuntimeServer(name: string): Promise<
    | {
        success: true
        provenance: McpConfigProvenance
        server: McpRuntimeServerConfig
      }
    | {
        success: false
        provenance: McpConfigProvenance
        error: {
          code: McpBridgeErrorCode
          message: string
        }
      }
  > {
    const loaded = await this.loadConfig()
    if (!loaded.success) {
      return {
        success: false,
        provenance: loaded.response.provenance,
        error: loaded.response.error ?? {
          code: 'UNKNOWN',
          message: 'Unable to read MCP configuration.',
        },
      }
    }

    const normalizedName = name.trim()
    const rawServer = loaded.config.mcpServers[normalizedName]

    if (!normalizedName || !isObject(rawServer)) {
      return {
        success: false,
        provenance: loaded.config.provenance,
        error: {
          code: 'SERVER_NOT_FOUND',
          message: `MCP server "${normalizedName || name}" was not found.`,
        },
      }
    }

    const runtimeServer = this.toRuntimeServer(normalizedName, rawServer)

    return {
      success: true,
      provenance: loaded.config.provenance,
      server: runtimeServer,
    }
  }

  private async loadConfig(): Promise<
    | {
        success: true
        config: McpLoadedConfig
      }
    | {
        success: false
        response: McpConfigReadResponse
      }
  > {
    const provenance = await this.getProvenance()

    try {
      const content = await fs.readFile(this.configPath, 'utf8')
      const parsed = parseConfig(content)

      if (!parsed.success) {
        return {
          success: false,
          response: {
            success: false,
            provenance,
            servers: [],
            error: {
              code: 'MALFORMED_CONFIG',
              message: parsed.error,
            },
          },
        }
      }

      const mcpServers = asObject(parsed.value.mcpServers)

      return {
        success: true,
        config: {
          configPath: this.configPath,
          rawConfig: parsed.value,
          mcpServers,
          provenance,
        },
      }
    } catch (error) {
      if (isFileNotFoundError(error)) {
        const starter = structuredClone(STARTER_MCP_CONFIG) as JsonObject
        return {
          success: true,
          config: {
            configPath: this.configPath,
            rawConfig: starter,
            mcpServers: asObject(starter.mcpServers),
            provenance,
          },
        }
      }

      const message = error instanceof Error ? error.message : String(error)

      log.error('[mcp-config-bridge] failed to read config', {
        configPath: this.configPath,
        error: message,
      })

      return {
        success: false,
        response: {
          success: false,
          provenance,
          servers: [],
          error: {
            code: 'CONFIG_UNREADABLE',
            message: `Unable to read MCP config: ${message}`,
          },
        },
      }
    }
  }

  private async writeConfig(nextConfig: JsonObject): Promise<
    | {
        success: true
      }
    | {
        success: false
        error: {
          code: 'WRITE_FAILED' | 'READBACK_FAILED'
          message: string
        }
      }
  > {
    try {
      const directory = path.dirname(this.configPath)
      await fs.mkdir(directory, { recursive: true })

      const tempPath = path.join(directory, `${path.basename(this.configPath)}.${process.pid}.${Date.now()}.tmp`)
      const serialized = `${JSON.stringify(nextConfig, null, 2)}\n`

      await fs.writeFile(tempPath, serialized, { mode: 0o600 })
      await fs.rename(tempPath, this.configPath)

      const readbackContent = await fs.readFile(this.configPath, 'utf8')
      const parsedReadback = parseConfig(readbackContent)

      if (!parsedReadback.success) {
        return {
          success: false,
          error: {
            code: 'READBACK_FAILED',
            message: `Config write completed but readback parse failed: ${parsedReadback.error}`,
          },
        }
      }

      return {
        success: true,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      log.error('[mcp-config-bridge] failed to write config', {
        configPath: this.configPath,
        error: message,
      })

      return {
        success: false,
        error: {
          code: 'WRITE_FAILED',
          message: `Unable to write MCP config: ${message}`,
        },
      }
    }
  }

  private toServerSummaries(mcpServers: Record<string, unknown>): McpServerSummary[] {
    return Object.entries(mcpServers)
      .filter(([, value]) => isObject(value))
      .map(([name, value]) => this.toServerSummary(name, value as JsonObject))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  private toServerSummary(name: string, rawServer: JsonObject): McpServerSummary {
    const transport = inferTransport(rawServer)
    const enabled = !toBoolean(rawServer.disabled)
    const directTools = asDirectTools(rawServer.directTools)

    if (transport === 'http') {
      const auth = normalizeAuthMode(rawServer.auth)
      const bearerTokenEnv = asNonEmptyString(rawServer.bearerTokenEnv)
      const inlineBearerToken = asNonEmptyString(rawServer.bearerToken)

      return {
        name,
        transport,
        enabled,
        directTools,
        summary: {
          transport,
          url: asNonEmptyString(rawServer.url) ?? '',
          auth,
          bearerTokenEnv: bearerTokenEnv ?? undefined,
          hasInlineBearerToken: Boolean(inlineBearerToken),
        },
      }
    }

    const env = asObject(rawServer.env)

    return {
      name,
      transport: 'stdio',
      enabled,
      directTools,
      summary: {
        transport: 'stdio',
        command: asNonEmptyString(rawServer.command) ?? '',
        args: asStringArray(rawServer.args),
        cwd: asNonEmptyString(rawServer.cwd) ?? undefined,
        envKeys: Object.keys(env).sort((left, right) => left.localeCompare(right)),
      },
    }
  }

  private toRuntimeServer(name: string, rawServer: JsonObject): McpRuntimeServerConfig {
    const transport = inferTransport(rawServer)
    const enabled = !toBoolean(rawServer.disabled)

    if (transport === 'http') {
      return {
        name,
        transport,
        enabled,
        url: asNonEmptyString(rawServer.url) ?? '',
        auth: normalizeAuthMode(rawServer.auth),
        bearerToken: asNonEmptyString(rawServer.bearerToken) ?? undefined,
        bearerTokenEnv: asNonEmptyString(rawServer.bearerTokenEnv) ?? undefined,
      }
    }

    const env = asObject(rawServer.env)
    const normalizedEnv: Record<string, string> = {}

    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        normalizedEnv[key] = value
      }
    }

    return {
      name,
      transport: 'stdio',
      enabled,
      command: asNonEmptyString(rawServer.command) ?? '',
      args: asStringArray(rawServer.args),
      cwd: asNonEmptyString(rawServer.cwd) ?? undefined,
      env: normalizedEnv,
    }
  }

  private async getProvenance(): Promise<McpConfigProvenance> {
    const workspacePath = this.getWorkspacePath?.()?.trim()
    const overlayConfigPath = workspacePath
      ? path.join(workspacePath, '.kata-cli', 'mcp.json')
      : undefined

    let overlayPresent = false
    if (overlayConfigPath) {
      try {
        await fs.access(overlayConfigPath)
        overlayPresent = true
      } catch {
        overlayPresent = false
      }
    }

    if (!overlayPresent || !overlayConfigPath) {
      return {
        mode: 'global_only',
        globalConfigPath: this.configPath,
      }
    }

    return {
      mode: 'overlay_present',
      globalConfigPath: this.configPath,
      overlayConfigPath,
      warning:
        'Project-local .kata-cli/mcp.json overlay detected. Desktop only edits the shared global MCP config.',
    }
  }
}

function validateServerInput(input: McpServerInput, existingServer: JsonObject = {}): McpValidationError[] {
  const errors: McpValidationError[] = []

  const name = input.name.trim()
  if (!name) {
    errors.push({
      field: 'name',
      code: 'REQUIRED',
      message: 'Server name is required.',
    })
  } else if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(name)) {
    errors.push({
      field: 'name',
      code: 'INVALID_FORMAT',
      message: 'Server name must match ^[a-zA-Z0-9_.-]{1,64}$.',
    })
  }

  if (input.transport === 'stdio') {
    if (!input.command.trim()) {
      errors.push({
        field: 'command',
        code: 'REQUIRED',
        message: 'Command is required for stdio servers.',
      })
    }
  }

  if (input.transport === 'http') {
    if (!input.url.trim()) {
      errors.push({
        field: 'url',
        code: 'REQUIRED',
        message: 'URL is required for HTTP servers.',
      })
    } else {
      try {
        const parsedUrl = new URL(input.url.trim())
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          errors.push({
            field: 'url',
            code: 'INVALID_VALUE',
            message: 'URL protocol must be http or https.',
          })
        }
      } catch {
        errors.push({
          field: 'url',
          code: 'INVALID_FORMAT',
          message: 'URL must be valid.',
        })
      }
    }

    const auth = input.auth ?? normalizeAuthMode(existingServer.auth)
    if (auth === 'bearer') {
      const token = input.bearerToken?.trim()
      const tokenEnv = input.bearerTokenEnv?.trim()
      const existingToken = asNonEmptyString(existingServer.bearerToken)
      const existingTokenEnv = asNonEmptyString(existingServer.bearerTokenEnv)

      if (!token && !tokenEnv && !existingToken && !existingTokenEnv) {
        errors.push({
          field: 'bearer',
          code: 'REQUIRED',
          message: 'Bearer auth requires a token or bearer token env key.',
        })
      }
    }
  }

  return errors
}

function normalizeServerForWrite(existingServer: JsonObject, input: McpServerInput): JsonObject {
  if (input.transport === 'stdio') {
    const nextStdioServer: JsonObject = {
      ...existingServer,
      command: input.command.trim(),
      args: input.args ? input.args.map((arg) => arg.trim()).filter(Boolean) : asStringArray(existingServer.args),
      disabled: input.enabled === undefined ? toBoolean(existingServer.disabled) : !input.enabled,
    }

    if (input.cwd !== undefined) {
      const cwd = input.cwd.trim()
      if (cwd) {
        nextStdioServer.cwd = cwd
      } else {
        delete nextStdioServer.cwd
      }
    }

    if (input.env !== undefined) {
      nextStdioServer.env = sanitizeEnvMap(input.env)
    }

    applyDirectToolsToWrite(nextStdioServer, input.directTools)

    delete nextStdioServer.url
    delete nextStdioServer.auth
    delete nextStdioServer.bearerToken
    delete nextStdioServer.bearerTokenEnv

    return nextStdioServer
  }

  return normalizeHttpServerForWrite(existingServer, input)
}

function normalizeHttpServerForWrite(existingServer: JsonObject, input: McpHttpServerInput): JsonObject {
  const auth = input.auth ?? normalizeAuthMode(existingServer.auth)

  const nextHttpServer: JsonObject = {
    ...existingServer,
    url: input.url.trim(),
    auth,
    disabled: input.enabled === undefined ? toBoolean(existingServer.disabled) : !input.enabled,
  }

  if (auth !== 'bearer') {
    delete nextHttpServer.bearerToken
    delete nextHttpServer.bearerTokenEnv
  } else {
    if (input.bearerToken !== undefined) {
      const token = input.bearerToken.trim()
      if (token) {
        nextHttpServer.bearerToken = token
      } else {
        delete nextHttpServer.bearerToken
      }
    }

    if (input.bearerTokenEnv !== undefined) {
      const tokenEnv = input.bearerTokenEnv.trim()
      if (tokenEnv) {
        nextHttpServer.bearerTokenEnv = tokenEnv
      } else {
        delete nextHttpServer.bearerTokenEnv
      }
    }
  }

  applyDirectToolsToWrite(nextHttpServer, input.directTools)

  delete nextHttpServer.command
  delete nextHttpServer.args
  delete nextHttpServer.env
  delete nextHttpServer.cwd

  return nextHttpServer
}

/**
 * Apply a directTools input to a server-to-write object.
 *
 * Semantics:
 * - `undefined` → leave whatever the existing server had (no-op). This keeps
 *   legacy CLI-managed values intact when the dialog has no opinion.
 * - `false` → remove the field entirely. Matches pi-mcp-adapter default
 *   (proxy-only) without leaving noise in mcp.json.
 * - `true` → promote every tool.
 * - `string[]` → allowlist. Empty arrays are persisted (disable everything)
 *   because they are still meaningful per pi-mcp-adapter semantics.
 */
function applyDirectToolsToWrite(target: JsonObject, directTools: McpDirectTools | undefined): void {
  if (directTools === undefined) {
    return
  }

  if (directTools === false) {
    delete target.directTools
    return
  }

  if (directTools === true) {
    target.directTools = true
    return
  }

  target.directTools = [...directTools]
}

function asDirectTools(value: unknown): McpDirectTools | undefined {
  if (value === true || value === false) {
    return value
  }

  if (Array.isArray(value)) {
    // Trim whitespace so hand-edited configs with " foo " still match the
    // exact tool name pi-mcp-adapter uses when registering direct tools.
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }

  return undefined
}

function sanitizeEnvMap(value: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}

  for (const [key, envValue] of Object.entries(value)) {
    const normalizedKey = key.trim()
    if (!normalizedKey) {
      continue
    }

    next[normalizedKey] = envValue
  }

  return next
}

function toDeleteResponseError(
  error: McpConfigReadResponse['error'] | undefined,
): McpServerDeleteResponse['error'] | undefined {
  if (!error) {
    return undefined
  }

  if (error.code === 'VALIDATION_FAILED') {
    return {
      code: 'UNKNOWN',
      message: error.message,
    }
  }

  return {
    code: error.code,
    message: error.message,
  }
}

function parseConfig(content: string): { success: true; value: JsonObject } | { success: false; error: string } {
  if (!content.trim()) {
    return {
      success: true,
      value: structuredClone(STARTER_MCP_CONFIG) as JsonObject,
    }
  }

  try {
    const parsed = JSON.parse(content)
    if (!isObject(parsed)) {
      return {
        success: false,
        error: 'Top-level MCP config must be a JSON object.',
      }
    }

    return {
      success: true,
      value: parsed,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function inferTransport(server: JsonObject): 'stdio' | 'http' {
  const url = asNonEmptyString(server.url)
  return url ? 'http' : 'stdio'
}

function normalizeAuthMode(value: unknown): 'none' | 'bearer' {
  return value === 'bearer' ? 'bearer' : 'none'
}

function asObject(value: unknown): JsonObject {
  if (!isObject(value)) {
    return {}
  }

  return value
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

function toBoolean(value: unknown): boolean {
  return value === true
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
