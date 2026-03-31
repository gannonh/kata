export const IPC_CHANNELS = {
  sessionSend: 'session:send',
  sessionStop: 'session:stop',
  sessionRestart: 'session:restart',
  sessionEvents: 'session:events',
  sessionBridgeStatus: 'session:bridge-status',
  sessionGetBridgeState: 'session:get-bridge-state',
  sessionGetAvailableModels: 'session:get-available-models',
  sessionSetModel: 'session:set-model',
  authGetProviders: 'auth:get-providers',
  authSetKey: 'auth:set-key',
  authRemoveKey: 'auth:remove-key',
  authValidateKey: 'auth:validate-key',
} as const

export const ALL_AUTH_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'bedrock',
  'azure',
] as const

export type AuthProvider = (typeof ALL_AUTH_PROVIDERS)[number]

export type ProviderStatus = 'valid' | 'missing' | 'expired' | 'invalid'

export type ProviderAuthType = 'api_key' | 'oauth'

export interface ProviderInfo {
  provider: AuthProvider
  status: ProviderStatus
  authType?: ProviderAuthType
  maskedKey?: string
}

export type ProviderStatusMap = Record<AuthProvider, ProviderInfo>

export interface AuthProvidersResponse {
  success: boolean
  providers: ProviderStatusMap
  error?: string
}

export interface AuthValidationResult {
  valid: boolean
  error?: string
}

export interface AuthSetKeyResponse {
  success: boolean
  provider: AuthProvider
  providerInfo?: ProviderInfo
  error?: string
}

export interface AuthRemoveKeyResponse {
  success: boolean
  provider: AuthProvider
  providerInfo?: ProviderInfo
  error?: string
}

export interface ApiKeyAuthRecordEntry {
  type: 'api_key'
  key: string
}

export interface OAuthAuthRecordEntry {
  type: 'oauth'
  access: string
  refresh?: string
  expires?: string | number
}

export type AuthRecordEntry = ApiKeyAuthRecordEntry | OAuthAuthRecordEntry

export type AuthRecord = Record<string, AuthRecordEntry>

export interface AvailableModel {
  provider: string
  id: string
  contextWindow?: number
  reasoning?: boolean
}

export interface AvailableModelsResponse {
  success: boolean
  models: AvailableModel[]
  error?: string
}

export interface SetModelResponse {
  success: boolean
  model?: string
  error?: string
}

export type RpcCommandType =
  | 'prompt'
  | 'abort'
  | 'shutdown'
  | 'get_state'
  | 'get_session_stats'
  | 'follow_up'
  | 'get_available_models'
  | 'set_model'

export interface RpcCommand {
  type: RpcCommandType
  id?: string
  message?: string
  model?: string
}

export interface CommandResult {
  id?: string
  success: boolean
  command: string
  data?: unknown
  error?: string
}

export type BridgeLifecycleState = 'spawning' | 'running' | 'crashed' | 'shutdown'

export interface BridgeStatusEvent {
  state: BridgeLifecycleState
  pid: number | null
  message?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  updatedAt: number
}

export type ChatEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'message_start'; messageId: string; role: 'assistant' | 'user' }
  | { type: 'text_delta'; messageId: string; delta: string }
  | { type: 'message_end'; messageId: string; text?: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_update'; toolCallId: string; toolName: string; status?: string }
  | {
      type: 'tool_end'
      toolCallId: string
      toolName: string
      result?: unknown
      isError: boolean
      error?: string
    }
  | { type: 'agent_error'; message: string }
  | {
      type: 'subprocess_crash'
      message: string
      exitCode: number | null
      signal: NodeJS.Signals | null
      stderrLines: string[]
    }

export interface BridgeState {
  running: boolean
  pid: number | null
  command: string | null
  status: BridgeLifecycleState
  selectedModel: string | null
}

export interface DesktopApi {
  sendMessage: (message: string) => Promise<void>
  stopAgent: () => Promise<void>
  restartAgent: () => Promise<void>
  onChatEvent: (listener: (event: ChatEvent) => void) => () => void
  onBridgeStatus: (listener: (status: BridgeStatusEvent) => void) => () => void
  getBridgeState: () => Promise<BridgeState>
  getAvailableModels: () => Promise<AvailableModelsResponse>
  setModel: (model: string) => Promise<SetModelResponse>
  auth: {
    getProviders: () => Promise<AuthProvidersResponse>
    setKey: (provider: AuthProvider, key: string) => Promise<AuthSetKeyResponse>
    removeKey: (provider: AuthProvider) => Promise<AuthRemoveKeyResponse>
    validateKey: (provider: AuthProvider, key: string) => Promise<AuthValidationResult>
  }
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
