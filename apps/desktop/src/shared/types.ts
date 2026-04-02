export const IPC_CHANNELS = {
  sessionSend: 'session:send',
  sessionStop: 'session:stop',
  sessionRestart: 'session:restart',
  sessionEvents: 'session:events',
  sessionBridgeStatus: 'session:bridge-status',
  sessionGetBridgeState: 'session:get-bridge-state',
  sessionExtensionUiRequest: 'session:extension-ui-request',
  sessionExtensionUiResponse: 'session:extension-ui-response',
  sessionPermissionMode: 'session:permission-mode',
  sessionGetAvailableModels: 'session:get-available-models',
  sessionSetModel: 'session:set-model',
  sessionList: 'session:list',
  sessionNew: 'session:new',
  sessionGetInfo: 'session:get-info',
  workspaceGet: 'workspace:get',
  workspaceSet: 'workspace:set',
  workspacePick: 'workspace:pick',
  authGetProviders: 'auth:get-providers',
  authSetKey: 'auth:set-key',
  authRemoveKey: 'auth:remove-key',
  authValidateKey: 'auth:validate-key',
} as const

export type PermissionMode = 'explore' | 'ask' | 'auto'

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

export interface SessionTokenUsage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  total?: number
}

export interface SessionListItem {
  id: string
  path: string
  name: string | null
  title: string
  model: string | null
  provider: string | null
  created: string
  modified: string
  messageCount: number
  firstMessagePreview: string | null
}

export interface SessionInfo extends SessionListItem {
  tokenUsage?: SessionTokenUsage
}

export interface SessionListResponse {
  sessions: SessionListItem[]
  warnings: string[]
  directory: string
}

export interface CreateSessionResponse {
  success: boolean
  sessionId: string | null
  error?: string
}

export interface WorkspaceInfo {
  path: string
}

export type RpcCommandType =
  | 'prompt'
  | 'abort'
  | 'shutdown'
  | 'get_state'
  | 'get_session_stats'
  | 'new_session'
  | 'follow_up'
  | 'get_available_models'
  | 'set_model'

export interface RpcCommand {
  type: RpcCommandType
  id?: string
  message?: string
  model?: string
  provider?: string
  modelId?: string
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

export interface EditArgs {
  path: string
  oldText?: string
  newText?: string
  edits?: Array<{
    oldText: string
    newText: string
  }>
}

export interface BashArgs {
  command: string
  timeout?: number
}

export interface ReadArgs {
  path: string
  offset?: number
  limit?: number
}

export interface WriteArgs {
  path: string
  content: string
}

export interface UnknownToolArgs {
  raw: unknown
}

export type ToolArgs = EditArgs | BashArgs | ReadArgs | WriteArgs | UnknownToolArgs

export interface EditResult {
  path?: string
  diff: string
  linesAdded: number
  linesRemoved: number
  linesChanged: number
  original?: string
  modified?: string
  parseError?: string
  raw?: unknown
}

export interface BashResult {
  command: string
  stdout: string
  stderr: string
  exitCode?: number
  raw?: unknown
}

export interface ReadResult {
  path?: string
  content: string
  language: string
  totalLines: number
  truncated: boolean
  raw?: unknown
}

export interface WriteResult {
  path?: string
  content: string
  bytesWritten: number
  raw?: unknown
}

export interface UnknownToolResult {
  raw: unknown
  parseError?: string
}

export type ToolResult = EditResult | BashResult | ReadResult | WriteResult | UnknownToolResult

export interface ExtensionUIRequestBase {
  id: string
  method: string
  timeoutMs?: number
  [key: string]: unknown
}

export interface ExtensionUIConfirmRequest extends ExtensionUIRequestBase {
  method: 'confirm'
  title?: string
  message?: string
  toolName?: string
  args?: unknown
}

export interface ExtensionUISelectRequest extends ExtensionUIRequestBase {
  method: 'select'
  title?: string
  message?: string
  options?: Array<{
    label: string
    value?: string
    description?: string
  }>
}

export interface ExtensionUIInputRequest extends ExtensionUIRequestBase {
  method: 'input'
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
}

export interface ExtensionUINotifyRequest extends ExtensionUIRequestBase {
  method: 'notify'
  title?: string
  message?: string
  level?: 'info' | 'success' | 'warning' | 'error'
}

export type ExtensionUIRequest =
  | ExtensionUIConfirmRequest
  | ExtensionUISelectRequest
  | ExtensionUIInputRequest
  | ExtensionUINotifyRequest
  | ExtensionUIRequestBase

export interface ExtensionUIResponse {
  confirmed?: boolean
  cancelled?: boolean
  value?: string
  values?: string[]
  [key: string]: unknown
}

export type ChatEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'message_start'; messageId: string; role: 'assistant' | 'user' }
  | { type: 'text_delta'; messageId: string; delta: string }
  | { type: 'message_end'; messageId: string; text?: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: ToolArgs; parentMessageId?: string }
  | {
      type: 'tool_update'
      toolCallId: string
      toolName: string
      status?: string
      partialStdout?: string
    }
  | {
      type: 'tool_end'
      toolCallId: string
      toolName: string
      result?: ToolResult
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
  | { type: 'thinking_start'; messageId: string }
  | { type: 'thinking_delta'; messageId: string; delta: string }
  | { type: 'thinking_end'; messageId: string; content: string }

export interface BridgeState {
  running: boolean
  pid: number | null
  command: string | null
  status: BridgeLifecycleState
  permissionMode: PermissionMode
  selectedModel: string | null
}

export interface DesktopApi {
  sendMessage: (message: string) => Promise<void>
  stopAgent: () => Promise<void>
  restartAgent: () => Promise<void>
  onChatEvent: (listener: (event: ChatEvent) => void) => () => void
  onBridgeStatus: (listener: (status: BridgeStatusEvent) => void) => () => void
  getBridgeState: () => Promise<BridgeState>
  onExtensionUIRequest: (listener: (event: ExtensionUIRequest) => void) => () => void
  sendExtensionUIResponse: (id: string, response: ExtensionUIResponse) => Promise<void>
  setPermissionMode: (mode: PermissionMode) => Promise<void>
  getAvailableModels: () => Promise<AvailableModelsResponse>
  setModel: (model: string) => Promise<SetModelResponse>
  sessions: {
    list: () => Promise<SessionListResponse>
    create: () => Promise<CreateSessionResponse>
    getInfo: (sessionPath: string) => Promise<SessionInfo>
  }
  workspace: {
    get: () => Promise<WorkspaceInfo>
    set: (workspacePath: string) => Promise<WorkspaceInfo>
    pick: () => Promise<WorkspaceInfo | null>
  }
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
