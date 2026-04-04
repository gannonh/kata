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
  sessionSetThinkingLevel: 'session:set-thinking-level',
  sessionList: 'session:list',
  sessionNew: 'session:new',
  sessionGetInfo: 'session:get-info',
  sessionSwitch: 'session:switch',
  sessionGetHistory: 'session:get-history',
  workspaceGet: 'workspace:get',
  workspaceSet: 'workspace:set',
  workspacePick: 'workspace:pick',
  authGetProviders: 'auth:get-providers',
  authSetKey: 'auth:set-key',
  authRemoveKey: 'auth:remove-key',
  authValidateKey: 'auth:validate-key',
  planningArtifactUpdated: 'planning:artifact-updated',
  planningArtifactFetchState: 'planning:artifact-fetch-state',
  planningFetchArtifact: 'planning:fetch-artifact',
  planningListArtifacts: 'planning:list-artifacts',
  workflowGetBoard: 'workflow:get-board',
  workflowRefreshBoard: 'workflow:refresh-board',
} as const

export type PermissionMode = 'explore' | 'ask' | 'auto'

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

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
  supportsXhigh?: boolean
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

export interface SetThinkingLevelResponse {
  success: boolean
  level?: ThinkingLevel
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

export interface SessionSwitchResponse {
  success: boolean
  sessionId: string | null
  sessionPath?: string | null
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
  | 'set_thinking_level'
  | 'switch_session'

export interface RpcCommand {
  type: RpcCommandType
  id?: string
  message?: string
  model?: string
  provider?: string
  modelId?: string
  level?: ThinkingLevel
  sessionPath?: string
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
  | { type: 'history_user_message'; messageId: string; text: string }

export interface BridgeState {
  running: boolean
  pid: number | null
  command: string | null
  status: BridgeLifecycleState
  permissionMode: PermissionMode
  selectedModel: string | null
}

export interface SessionHistoryResponse {
  success: boolean
  sessionId: string | null
  sessionPath?: string | null
  events: ChatEvent[]
  warnings: string[]
  error?: string
}

export type PlanningArtifactScope = 'project' | 'issue'

export type PlanningArtifactAction = 'created' | 'updated'

export type PlanningArtifactErrorCode =
  | 'MISSING_API_KEY'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'GRAPHQL'
  | 'UNKNOWN'

export interface PlanningArtifactError {
  code: PlanningArtifactErrorCode
  message: string
}

export interface PlanningSliceTask {
  id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done'
}

export interface PlanningSliceData {
  id: string
  title: string
  description: string
  issueId?: string
  tasks: PlanningSliceTask[]
}

export type PlanningArtifactEventType =
  | 'document'
  | 'slice_created'
  | 'task_created'
  | 'milestone_created'

export interface PlanningArtifactEvent {
  eventType: PlanningArtifactEventType
  toolName: string
  toolCallId: string
  title: string
  artifactKey: string
  scope: PlanningArtifactScope
  action: PlanningArtifactAction
  projectId?: string
  issueId?: string
  slice?: Omit<PlanningSliceData, 'tasks'>
  task?: PlanningSliceTask
  targetSliceIssueId?: string
}

export interface PlanningArtifact {
  title: string
  artifactKey: string
  content: string
  updatedAt: string
  scope: PlanningArtifactScope
  projectId?: string
  issueId?: string
  artifactType?: ArtifactType
  sliceData?: PlanningSliceData
}

export interface PlanningArtifactFetchStateEvent {
  state: 'start' | 'end'
  title: string
  artifactKey: string
  toolName?: string
  error?: PlanningArtifactError
}

export function buildPlanningArtifactKey({
  title,
  scope,
  projectId,
  issueId,
}: {
  title: string
  scope: PlanningArtifactScope
  projectId?: string
  issueId?: string
}): string {
  const normalizedTitle = title.trim()

  if (scope === 'issue') {
    return `issue:${issueId?.trim() || projectId?.trim() || 'unknown'}:${normalizedTitle}`
  }

  return `project:${projectId?.trim() || 'global'}:${normalizedTitle}`
}

export interface PlanningArtifactFetchResponse {
  success: boolean
  artifact?: PlanningArtifact
  error?: PlanningArtifactError
}

export interface PlanningArtifactListResponse {
  success: boolean
  artifacts: PlanningArtifact[]
  stale?: boolean
  error?: PlanningArtifactError
}

export type WorkflowColumnId =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'agent_review'
  | 'human_review'
  | 'merging'
  | 'done'

export const WORKFLOW_COLUMNS: ReadonlyArray<{ id: WorkflowColumnId; title: string }> = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'Todo' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'agent_review', title: 'Agent Review' },
  { id: 'human_review', title: 'Human Review' },
  { id: 'merging', title: 'Merging' },
  { id: 'done', title: 'Done' },
]

export type WorkflowBoardBackend = 'linear' | 'github'

export type GithubWorkflowStateMode = 'labels' | 'projects_v2'

export type WorkflowTrackerConfig =
  | {
      kind: 'linear'
    }
  | {
      kind: 'github'
      repoOwner: string
      repoName: string
      stateMode: GithubWorkflowStateMode
      githubProjectNumber?: number
      labelPrefix?: string
    }

export type WorkflowBoardStatus = 'fresh' | 'stale' | 'empty' | 'error'

export type WorkflowBoardErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_CONFIG'
  | 'MISSING_API_KEY'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'GRAPHQL'
  | 'UNKNOWN'

export interface WorkflowBoardError {
  code: WorkflowBoardErrorCode
  message: string
}

export interface WorkflowBoardTask {
  id: string
  identifier?: string
  title: string
  columnId: WorkflowColumnId
  stateName: string
  stateType: string
  url?: string
}

export interface WorkflowBoardSliceCard {
  id: string
  identifier: string
  title: string
  columnId: WorkflowColumnId
  stateName: string
  stateType: string
  url?: string
  milestoneId: string
  milestoneName: string
  taskCounts: {
    total: number
    done: number
  }
  tasks: WorkflowBoardTask[]
}

export interface WorkflowBoardColumn {
  id: WorkflowColumnId
  title: string
  cards: WorkflowBoardSliceCard[]
}

export interface WorkflowBoardPollMetadata {
  status: 'idle' | 'success' | 'error'
  backend: WorkflowBoardBackend
  lastAttemptAt: string
}

export interface WorkflowBoardSnapshot {
  backend: WorkflowBoardBackend
  fetchedAt: string
  status: WorkflowBoardStatus
  source: {
    projectId: string
    activeMilestoneId?: string
    trackerKind?: 'linear' | 'github'
    githubStateMode?: GithubWorkflowStateMode
    repoOwner?: string
    repoName?: string
  }
  activeMilestone:
    | {
        id: string
        name: string
      }
    | null
  columns: WorkflowBoardColumn[]
  emptyReason?: string
  lastError?: WorkflowBoardError
  poll: WorkflowBoardPollMetadata
}

/**
 * Workflow responses always include a snapshot, even on failed fetches.
 * Callers should check `success` and inspect `snapshot.lastError` for failure details.
 */
export interface WorkflowBoardSnapshotResponse {
  success: boolean
  snapshot: WorkflowBoardSnapshot
}

export type ArtifactType = 'roadmap' | 'requirements' | 'decisions' | 'context' | 'slice'

export type RoadmapRisk = 'high' | 'medium' | 'low'

export interface ParsedRoadmapSlice {
  id: string
  title: string
  risk: RoadmapRisk
  depends: string[]
  demo: string | null
  done: boolean
}

export interface ParsedRoadmapBoundarySection {
  heading: string
  content: string
}

export interface ParsedRoadmap {
  vision: string | null
  successCriteria: string[]
  slices: ParsedRoadmapSlice[]
  boundaryMap: ParsedRoadmapBoundarySection[]
}

export type RequirementStatus = 'active' | 'validated' | 'deferred' | 'outOfScope'

export interface ParsedRequirement {
  id: string
  title: string
  class: string
  status: string
  description: string
  owner: string
  validation: string
}

export interface ParsedRequirements {
  active: ParsedRequirement[]
  validated: ParsedRequirement[]
  deferred: ParsedRequirement[]
  outOfScope: ParsedRequirement[]
}

export interface ParsedDecision {
  id: string
  when: string
  scope: string
  decision: string
  choice: string
  rationale: string
  revisable: boolean | null
  revisableCondition: string | null
  revisableLabel: string
}

export interface ParsedDecisions {
  rows: ParsedDecision[]
}

export interface ParsedContextSection {
  heading: string
  content: string
  level: number
}

export interface ParsedContext {
  sections: ParsedContextSection[]
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
  setThinkingLevel: (level: ThinkingLevel) => Promise<SetThinkingLevelResponse>
  sessions: {
    list: () => Promise<SessionListResponse>
    create: () => Promise<CreateSessionResponse>
    getInfo: (sessionPath: string) => Promise<SessionInfo>
    switch: (sessionId: string) => Promise<SessionSwitchResponse>
    getHistory: (sessionId: string, sessionPath?: string) => Promise<SessionHistoryResponse>
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
  planning: {
    onArtifactUpdated: (listener: (artifact: PlanningArtifact) => void) => () => void
    onArtifactFetchState: (listener: (event: PlanningArtifactFetchStateEvent) => void) => () => void
    fetchArtifact: (title: string, artifactKey?: string) => Promise<PlanningArtifactFetchResponse>
    listArtifacts: () => Promise<PlanningArtifactListResponse>
  }
  workflow: {
    getBoard: () => Promise<WorkflowBoardSnapshotResponse>
    refreshBoard: () => Promise<WorkflowBoardSnapshotResponse>
  }
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
