import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import log from './logger'
import {
  ALL_AUTH_PROVIDERS,
  type AuthProvider,
  type AuthProvidersResponse,
  type AuthRecord,
  type AuthRecordEntry,
  type AuthSetKeyResponse,
  type AuthRemoveKeyResponse,
  type AuthValidationResult,
  type ProviderInfo,
  type ProviderStatusMap,
} from '../shared/types'

const DEFAULT_AUTH_PATH = path.join(homedir(), '.kata-cli', 'agent', 'auth.json')

/**
 * The CLI stores some providers under variant key names in auth.json.
 * Map canonical AuthProvider → alternate keys to check.
 */
const AUTH_PROVIDER_ALIASES: Partial<Record<AuthProvider, string[]>> = {
  openai: ['openai-codex'],
}

interface ValidationConfig {
  url: (key: string) => string
  init: (key: string) => RequestInit
  validStatusCodes: Set<number>
  invalidStatusCodes: Set<number>
  invalidMessage: string
}

const VALIDATION_TIMEOUT_MS = 10_000

const PROVIDER_VALIDATION_CONFIG: Partial<Record<AuthProvider, ValidationConfig>> = {
  anthropic: {
    url: () => 'https://api.anthropic.com/v1/messages',
    init: (key) => ({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({}),
    }),
    validStatusCodes: new Set([200, 400, 429]),
    invalidStatusCodes: new Set([401, 403]),
    invalidMessage: 'Invalid Anthropic API key',
  },
  openai: {
    url: () => 'https://api.openai.com/v1/models',
    init: (key) => ({
      method: 'GET',
      headers: {
        authorization: `Bearer ${key}`,
      },
    }),
    validStatusCodes: new Set([200, 429]),
    invalidStatusCodes: new Set([401, 403]),
    invalidMessage: 'Invalid OpenAI API key',
  },
  google: {
    url: (key) => `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`,
    init: () => ({
      method: 'GET',
    }),
    validStatusCodes: new Set([200, 429]),
    invalidStatusCodes: new Set([400, 401, 403]),
    invalidMessage: 'Invalid Google API key',
  },
  mistral: {
    url: () => 'https://api.mistral.ai/v1/models',
    init: (key) => ({
      method: 'GET',
      headers: {
        authorization: `Bearer ${key}`,
      },
    }),
    validStatusCodes: new Set([200, 429]),
    invalidStatusCodes: new Set([401, 403]),
    invalidMessage: 'Invalid Mistral API key',
  },
}

const UNSUPPORTED_PROVIDER_MESSAGES: Partial<Record<AuthProvider, string>> = {
  bedrock: 'AWS Bedrock validation requires AWS credentials and region configuration',
  azure: 'Azure validation requires both API key and Azure endpoint configuration',
}

export class AuthBridge {
  constructor(private readonly authFilePath = DEFAULT_AUTH_PATH) {}

  public getAuthFilePath(): string {
    return this.authFilePath
  }

  public async getProviders(): Promise<AuthProvidersResponse> {
    try {
      const auth = await this.readAuthFile()
      const providers = this.toProviderStatusMap(auth)

      log.info('[auth-bridge] auth:read', {
        path: this.authFilePath,
        success: true,
      })

      return {
        success: true,
        providers,
      }
    } catch (error) {
      const message = this.toErrorMessage(error)
      log.error('[auth-bridge] auth:read', {
        path: this.authFilePath,
        success: false,
        error: message,
      })

      return {
        success: false,
        providers: this.emptyProviderStatusMap(),
        error: `Unable to load credentials from ${this.authFilePath}: ${message}`,
      }
    }
  }

  public async validateKey(provider: AuthProvider, key: string): Promise<AuthValidationResult> {
    const trimmedKey = key.trim()
    if (!trimmedKey) {
      return {
        valid: false,
        error: 'API key is required',
      }
    }

    const unsupportedMessage = UNSUPPORTED_PROVIDER_MESSAGES[provider]
    if (unsupportedMessage) {
      log.info('[auth-bridge] auth:validate', {
        provider,
        success: false,
        reason: 'unsupported-provider-validation',
      })
      return {
        valid: false,
        error: unsupportedMessage,
      }
    }

    const config = PROVIDER_VALIDATION_CONFIG[provider]
    if (!config) {
      return {
        valid: false,
        error: `Unsupported provider: ${provider}`,
      }
    }

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), VALIDATION_TIMEOUT_MS)

    try {
      const response = await fetch(config.url(trimmedKey), {
        ...config.init(trimmedKey),
        signal: abortController.signal,
      })

      if (config.validStatusCodes.has(response.status)) {
        log.info('[auth-bridge] auth:validate', {
          provider,
          success: true,
          status: response.status,
        })
        return { valid: true }
      }

      if (config.invalidStatusCodes.has(response.status)) {
        log.info('[auth-bridge] auth:validate', {
          provider,
          success: false,
          status: response.status,
        })
        return {
          valid: false,
          error: config.invalidMessage,
        }
      }

      log.warn('[auth-bridge] auth:validate unexpected status', {
        provider,
        status: response.status,
      })
      return {
        valid: false,
        error: `Validation request failed with status ${response.status}`,
      }
    } catch (error) {
      const message = this.toErrorMessage(error)
      log.error('[auth-bridge] auth:validate', {
        provider,
        success: false,
        error: message,
      })
      return {
        valid: false,
        error: `Unable to validate ${provider} key: ${message}`,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  public async setProviderKey(provider: AuthProvider, key: string): Promise<AuthSetKeyResponse> {
    const validation = await this.validateKey(provider, key)
    if (!validation.valid) {
      return {
        success: false,
        provider,
        error: validation.error ?? 'Invalid API key',
      }
    }

    const trimmedKey = key.trim()

    try {
      const auth = await this.readAuthFile()
      auth[provider] = {
        type: 'api_key',
        key: trimmedKey,
      }

      await this.writeAuthFile(auth)

      const providerInfo = this.toProviderInfo(provider, auth[provider])

      log.info('[auth-bridge] auth:write', {
        provider,
        success: true,
        operation: 'set',
      })

      return {
        success: true,
        provider,
        providerInfo,
      }
    } catch (error) {
      const message = this.toErrorMessage(error)
      log.error('[auth-bridge] auth:write', {
        provider,
        success: false,
        operation: 'set',
        error: message,
      })
      return {
        success: false,
        provider,
        error: `Unable to save ${provider} credentials: ${message}`,
      }
    }
  }

  public async removeProviderKey(provider: AuthProvider): Promise<AuthRemoveKeyResponse> {
    try {
      const auth = await this.readAuthFile()
      delete auth[provider]
      await this.writeAuthFile(auth)

      log.info('[auth-bridge] auth:write', {
        provider,
        success: true,
        operation: 'remove',
      })

      return {
        success: true,
        provider,
        providerInfo: this.toProviderInfo(provider, undefined),
      }
    } catch (error) {
      const message = this.toErrorMessage(error)
      log.error('[auth-bridge] auth:write', {
        provider,
        success: false,
        operation: 'remove',
        error: message,
      })
      return {
        success: false,
        provider,
        error: `Unable to remove ${provider} credentials: ${message}`,
      }
    }
  }

  private async readAuthFile(): Promise<AuthRecord> {
    try {
      const content = await fs.readFile(this.authFilePath, 'utf8')
      if (!content.trim()) {
        return {}
      }

      const parsed = JSON.parse(content) as AuthRecord
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('auth.json must contain a JSON object')
      }

      return parsed
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return {}
      }

      throw error
    }
  }

  private async writeAuthFile(auth: AuthRecord): Promise<void> {
    const directory = path.dirname(this.authFilePath)
    await fs.mkdir(directory, { recursive: true })

    const tempPath = path.join(
      directory,
      `${path.basename(this.authFilePath)}.${process.pid}.${Date.now()}.tmp`,
    )

    const serialized = `${JSON.stringify(auth, null, 2)}\n`
    await fs.writeFile(tempPath, serialized, { mode: 0o600 })
    await fs.rename(tempPath, this.authFilePath)
  }

  private toProviderStatusMap(auth: AuthRecord): ProviderStatusMap {
    const entries = ALL_AUTH_PROVIDERS.map((provider) => [
      provider,
      this.toProviderInfo(provider, this.resolveAuthRecord(auth, provider)),
    ])

    return Object.fromEntries(entries) as ProviderStatusMap
  }

  /**
   * Resolve the auth record for a canonical provider, checking alias keys.
   * The CLI stores some providers under variant names (e.g. 'openai-codex'
   * instead of 'openai'). Check the canonical key first, then known aliases.
   */
  private resolveAuthRecord(auth: AuthRecord, provider: AuthProvider): AuthRecordEntry | undefined {
    if (auth[provider]) {
      return auth[provider]
    }

    const aliases = AUTH_PROVIDER_ALIASES[provider]
    if (aliases) {
      for (const alias of aliases) {
        if (auth[alias]) {
          return auth[alias]
        }
      }
    }

    return undefined
  }

  private emptyProviderStatusMap(): ProviderStatusMap {
    const entries = ALL_AUTH_PROVIDERS.map((provider) => [
      provider,
      this.toProviderInfo(provider, undefined),
    ])

    return Object.fromEntries(entries) as ProviderStatusMap
  }

  private toProviderInfo(provider: AuthProvider, record: AuthRecordEntry | undefined): ProviderInfo {
    if (!record) {
      return {
        provider,
        status: 'missing',
      }
    }

    if (record.type === 'api_key') {
      return {
        provider,
        authType: 'api_key',
        status: record.key ? 'valid' : 'missing',
        maskedKey: this.maskKey(record.key),
      }
    }

    if (record.type === 'oauth') {
      const expiresAt = record.expires ? Number(record.expires) : null
      const isExpired = Number.isFinite(expiresAt) && expiresAt !== null && expiresAt <= Date.now()

      return {
        provider,
        authType: 'oauth',
        status: isExpired ? 'expired' : 'valid',
        maskedKey: this.maskKey(record.access),
      }
    }

    return {
      provider,
      status: 'invalid',
    }
  }

  private maskKey(value: string | undefined): string | undefined {
    if (!value) {
      return undefined
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }

    const suffix = trimmed.slice(-4)
    return `••••${suffix}`
  }

  private isFileNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    )
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
