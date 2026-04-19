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
  workspaceGetGitInfo: 'workspace:get-git-info',
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
  workflowSetBoardActive: 'workflow:set-board-active',
  workflowSetScope: 'workflow:set-scope',
  workflowMoveEntity: 'workflow:move-entity',
  workflowCreateTask: 'workflow:create-task',
  workflowGetTaskDetail: 'workflow:get-task-detail',
  workflowUpdateTask: 'workflow:update-task',
  workflowRespondEscalation: 'workflow:respond-escalation',
  workflowOpenIssue: 'workflow:open-issue',
  workflowGetContext: 'workflow:get-context',
  workflowDispatchShellAction: 'workflow:dispatch-shell-action',
  workflowShellAction: 'workflow:shell-action',
  symphonyGetStatus: 'symphony:get-status',
  symphonyStart: 'symphony:start',
  symphonyStop: 'symphony:stop',
  symphonyRestart: 'symphony:restart',
  symphonyStatus: 'symphony:status',
  symphonyGetDashboard: 'symphony:get-dashboard',
  symphonyRefreshDashboard: 'symphony:refresh-dashboard',
  symphonyRespondEscalation: 'symphony:respond-escalation',
  symphonyDashboardSnapshot: 'symphony:dashboard-snapshot',
  mcpListServers: 'mcp:list-servers',
  mcpGetServer: 'mcp:get-server',
  mcpSaveServer: 'mcp:save-server',
  mcpDeleteServer: 'mcp:delete-server',
  mcpRefreshStatus: 'mcp:refresh-status',
  mcpReconnectServer: 'mcp:reconnect-server',
  reliabilityGetStatus: 'reliability:get-status',
  reliabilityStatus: 'reliability:status',
  reliabilityGetStabilitySnapshot: 'reliability:get-stability-snapshot',
  reliabilityStabilitySnapshot: 'reliability:stability-snapshot',
  reliabilityRequestRecoveryAction: 'reliability:request-recovery-action',
  commandsGetAll: 'commands:get-all',
} as const

export type PermissionMode = 'explore' | 'ask' | 'auto'

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type SlashCommandCategory = 'builtin' | 'skill'

export interface SlashCommandEntry {
  name: string
  description?: string
  category: SlashCommandCategory
}

export interface SkillEntry {
  name: string
  description?: string
}

export interface SlashCommandsResponse {
  success: boolean
  commands: SlashCommandEntry[]
  error?: string
}

export const ALL_AUTH_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'bedrock',
  'azure',
  'github-copilot',
] as const

export type AuthProvider = (typeof ALL_AUTH_PROVIDERS)[number]

/**
 * Auth.json can contain provider entries under alias keys.
 * Canonical provider -> accepted alias keys.
 */
export const AUTH_PROVIDER_ALIASES: Partial<Record<AuthProvider, string[]>> = {
  openai: ['openai-codex'],
}

/**
 * Providers that authenticate via OAuth sessions rather than API keys.
 * These are detected by probing for token files on disk, not by reading auth.json.
 */
export const OAUTH_PROVIDERS: ReadonlySet<AuthProvider> = new Set<AuthProvider>([
  'github-copilot',
])

/**
 * Preferred model when Desktop proactively selects one during onboarding.
 * Startup no longer persists or replays a separate Desktop-only model key;
 * the CLI owns defaultProvider/defaultModel selection in settings.json.
 */
export const DEFAULT_MODEL = 'openai-codex/gpt-5.3-codex'

export type ProviderStatus = 'valid' | 'missing' | 'expired' | 'invalid'

export type ProviderAuthType = 'api_key' | 'oauth'

export interface ProviderInfo {
  provider: AuthProvider
  status: ProviderStatus
  authType: ProviderAuthType
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

export interface WorkspaceGitInfo {
  branch: string | null
  pullRequestUrl: string | null
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

export interface SubagentTaskItem {
  agent: string
  task: string
  cwd?: string
}

export interface SubagentArgs {
  agent?: string
  task?: string
  tasks?: SubagentTaskItem[]
  chain?: SubagentTaskItem[]
  mode: 'single' | 'parallel' | 'chain'
}

export interface UnknownToolArgs {
  raw: unknown
}

export type ToolArgs = EditArgs | BashArgs | ReadArgs | WriteArgs | SubagentArgs | UnknownToolArgs

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

export interface SubagentResultItem {
  agent: string
  task: string
  exitCode: number
  errorMessage?: string
  model?: string
  step?: number
}

export interface SubagentResult {
  mode: string
  results: SubagentResultItem[]
  raw?: unknown
}

export interface UnknownToolResult {
  raw: unknown
  parseError?: string
}

export type ToolResult = EditResult | BashResult | ReadResult | WriteResult | SubagentResult | UnknownToolResult

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
      partialResult?: ToolResult
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

export type WorkflowBoardScope = 'active' | 'project' | 'milestone'

export type WorkflowBoardScopeResolutionReason =
  | 'requested'
  | 'milestone_scope_not_supported'
  | 'operator_state_unavailable'
  | 'operator_state_stale'
  | 'operator_state_disconnected'

export interface WorkflowBoardScopeDiagnostics {
  requested: WorkflowBoardScope
  resolved: WorkflowBoardScope
  reason: WorkflowBoardScopeResolutionReason
  operatorFreshness?: WorkflowSymphonyExecutionFreshness
  activeMatchCount?: number
  activeMatchIdentifiers?: string[]
  note?: string
}

export type WorkflowContextMode = 'planning' | 'execution' | 'unknown'

export type WorkflowContextReason =
  | 'planning_activity_detected'
  | 'tracker_and_board_available'
  | 'tracker_configured_board_pending'
  | 'board_available_without_tracker'
  | 'unknown_context'

export interface WorkflowContextSnapshot {
  mode: WorkflowContextMode
  reason: WorkflowContextReason
  planningActive: boolean
  trackerConfigured: boolean
  boardAvailable: boolean
  updatedAt: string
}

export type RightPaneMode = 'planning' | 'kanban'

export type RightPaneOverride = RightPaneMode | null

export interface RightPaneResolution {
  mode: RightPaneMode
  source: 'manual' | 'automatic'
  reason: WorkflowContextReason | 'manual_override' | 'default_fallback'
}

export type WorkflowShellAction = 'open_mcp_settings' | 'return_to_kanban' | 'refresh_board'

export type WorkflowShellActionSource = 'kanban_header' | 'settings_panel' | 'keyboard_shortcut'

export interface WorkflowShellActionRequest {
  action: WorkflowShellAction
  source: WorkflowShellActionSource
}

export interface WorkflowShellActionEvent extends WorkflowShellActionRequest {
  dispatchedAt: string
}

export interface WorkflowShellActionDispatchResult {
  success: boolean
  dispatchedAt?: string
  error?: string
}

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

export type WorkflowSymphonyExecutionProvenance =
  | 'dashboard-derived'
  | 'operator-stale'
  | 'runtime-disconnected'
  | 'unavailable'

export type WorkflowSymphonyExecutionFreshness = 'fresh' | 'stale' | 'disconnected' | 'unknown'

export interface WorkflowBoardEscalationRequest {
  requestId: string
  questionPreview: string
  createdAt?: string
  timeoutMs?: number
}

export interface WorkflowSymphonyExecutionSummary {
  issueId?: string
  identifier?: string
  workerState?: string
  toolName?: string
  model?: string
  lastActivityAt?: string
  lastError?: string
  pendingEscalations: number
  pendingEscalationRequests?: WorkflowBoardEscalationRequest[]
  assignmentState: 'assigned' | 'unassigned'
  freshness: WorkflowSymphonyExecutionFreshness
  provenance: WorkflowSymphonyExecutionProvenance
  staleReason?: string
}

export interface WorkflowBoardSymphonySnapshot {
  connectionState: SymphonyOperatorConnectionState | 'unknown'
  freshness: WorkflowSymphonyExecutionFreshness
  provenance: WorkflowSymphonyExecutionProvenance
  staleReason?: string
  fetchedAt?: string
  workerCount: number
  escalationCount: number
  diagnostics: {
    correlationMisses: string[]
  }
}

export interface WorkflowBoardPrMetadata {
  number: number
  url: string
  title?: string
  status?: string
  branchName?: string
}

export interface WorkflowBoardTask {
  id: string
  identifier?: string
  title: string
  description?: string
  columnId: WorkflowColumnId
  stateId?: string
  stateName: string
  stateType: string
  teamId?: string
  projectId?: string
  parentSliceId?: string
  url?: string
  prMetadata?: WorkflowBoardPrMetadata
  symphony?: WorkflowSymphonyExecutionSummary
}

export interface WorkflowBoardSliceCard {
  id: string
  identifier: string
  title: string
  columnId: WorkflowColumnId
  stateId?: string
  stateName: string
  stateType: string
  teamId?: string
  projectId?: string
  url?: string
  milestoneId: string
  milestoneName: string
  taskCounts: {
    total: number
    done: number
  }
  tasks: WorkflowBoardTask[]
  prMetadata?: WorkflowBoardPrMetadata
  symphony?: WorkflowSymphonyExecutionSummary
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
  lastSuccessAt?: string
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
  scope?: WorkflowBoardScopeDiagnostics
  activeMilestone:
    | {
        id: string
        name: string
      }
    | null
  columns: WorkflowBoardColumn[]
  symphony?: WorkflowBoardSymphonySnapshot
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

export interface WorkflowBoardLifecycleResponse {
  success: boolean
  active: boolean
}

export interface WorkflowBoardScopeRequest {
  scopeKey: string
  requestedScope?: WorkflowBoardScope
}

export interface WorkflowBoardScopeResponse {
  success: boolean
  scopeKey: string
  requestedScope: WorkflowBoardScope
  resolvedScope: WorkflowBoardScope
  resolutionReason: WorkflowBoardScopeResolutionReason
}

export type WorkflowEntityKind = 'slice' | 'task'

export interface WorkflowMoveEntityRequest {
  entityKind: WorkflowEntityKind
  entityId: string
  targetColumnId: WorkflowColumnId
  currentColumnId?: WorkflowColumnId
  currentStateId?: string
  currentStateName?: string
  currentStateType?: string
  teamId?: string
  projectId?: string
}

export type WorkflowMoveEntityCode =
  | 'COMMITTED'
  | 'ROLLED_BACK'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNSUPPORTED'
  | 'FAILED'

export interface WorkflowMoveEntityResult {
  success: boolean
  entityKind: WorkflowEntityKind
  entityId: string
  targetColumnId: WorkflowColumnId
  status: 'success' | 'error'
  code: WorkflowMoveEntityCode
  phase: 'committed' | 'rolled_back'
  message: string
  refreshBoard: boolean
  updatedAt: string
}

export interface WorkflowCreateTaskRequest {
  parentSliceId: string
  title: string
  description?: string
  initialColumnId?: WorkflowColumnId
  teamId?: string
  projectId?: string
}

export type WorkflowCreateTaskCode =
  | 'CREATED'
  | 'VALIDATION_ERROR'
  | 'ROLLED_BACK'
  | 'NOT_FOUND'
  | 'UNSUPPORTED'
  | 'FAILED'

export interface WorkflowCreateTaskResult {
  success: boolean
  parentSliceId: string
  status: 'success' | 'error'
  code: WorkflowCreateTaskCode
  message: string
  refreshBoard: boolean
  updatedAt: string
  task?: {
    id: string
    identifier?: string
    title: string
    columnId: WorkflowColumnId
  }
}

export interface WorkflowTaskDetailRequest {
  taskId: string
}

export interface WorkflowTaskDetail {
  id: string
  identifier?: string
  parentSliceId?: string
  teamId?: string
  projectId?: string
  stateId?: string
  stateName: string
  stateType: string
  columnId: WorkflowColumnId
  title: string
  description: string
}

export type WorkflowTaskDetailCode = 'LOADED' | 'NOT_FOUND' | 'UNSUPPORTED' | 'FAILED'

export interface WorkflowTaskDetailResponse {
  success: boolean
  code: WorkflowTaskDetailCode
  message: string
  task?: WorkflowTaskDetail
}

export interface WorkflowUpdateTaskRequest {
  taskId: string
  title: string
  description?: string
  targetColumnId?: WorkflowColumnId
  teamId?: string
  projectId?: string
  currentStateId?: string
}

export type WorkflowUpdateTaskCode =
  | 'UPDATED'
  | 'VALIDATION_ERROR'
  | 'ROLLED_BACK'
  | 'NOT_FOUND'
  | 'UNSUPPORTED'
  | 'FAILED'

export interface WorkflowUpdateTaskResult {
  success: boolean
  taskId: string
  status: 'success' | 'error'
  code: WorkflowUpdateTaskCode
  message: string
  refreshBoard: boolean
  updatedAt: string
  task?: {
    id: string
    identifier?: string
    title: string
    columnId: WorkflowColumnId
  }
}

export interface WorkflowBoardEscalationResponseRequest {
  cardId: string
  requestId: string
  responseText: string
}

export type WorkflowBoardEscalationResponseCode =
  | 'SUBMITTED'
  | 'UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'FAILED'

export interface WorkflowBoardEscalationResponseResult {
  success: boolean
  cardId: string
  requestId: string
  status: 'success' | 'error' | 'disabled'
  code: WorkflowBoardEscalationResponseCode
  message: string
  submittedAt: string
  completedAt: string
  refreshBoard: boolean
}

export interface WorkflowBoardOpenIssueRequest {
  cardId: string
  url: string
  identifier?: string
}

export type WorkflowBoardOpenIssueCode = 'OPENED' | 'INVALID_URL' | 'UNAVAILABLE' | 'FAILED'

export interface WorkflowBoardOpenIssueResult {
  success: boolean
  cardId: string
  url: string
  status: 'success' | 'error' | 'disabled'
  code: WorkflowBoardOpenIssueCode
  message: string
  openedAt: string
}

export interface WorkflowContextResponse {
  success: boolean
  context: WorkflowContextSnapshot
}

export type SymphonyConfigSource = 'preferences' | 'env' | 'default'

export type SymphonyLaunchSource = 'bundled' | 'path' | 'env'

export type SymphonyRuntimePhase =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'disconnected'
  | 'restarting'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'config_error'

export type SymphonyRuntimeErrorCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'WORKFLOW_PATH_MISSING'
  | 'BINARY_NOT_FOUND'
  | 'SPAWN_FAILED'
  | 'PROCESS_EXITED'
  | 'READINESS_FAILED'
  | 'STOP_TIMEOUT'
  | 'UNKNOWN'

export interface SymphonyRuntimeError {
  code: SymphonyRuntimeErrorCode
  message: string
  phase: 'config' | 'spawn' | 'process' | 'readiness' | 'shutdown' | 'unknown'
  details?: string
}

export interface SymphonyLaunchDescriptor {
  command: string
  args: string[]
  cwd: string
  source: SymphonyLaunchSource
  resolvedUrl: string
  workflowPath: string
  urlSource: SymphonyConfigSource
  workflowPathSource: SymphonyConfigSource
}

export interface SymphonyRuntimeDiagnostics {
  stdout: string[]
  stderr: string[]
}

export interface SymphonyRuntimeStatus {
  phase: SymphonyRuntimePhase
  managedProcessRunning: boolean
  pid: number | null
  url: string | null
  launch?: Pick<SymphonyLaunchDescriptor, 'command' | 'args' | 'source'>
  diagnostics: SymphonyRuntimeDiagnostics
  updatedAt: string
  lastReadyAt?: string
  lastReadinessCheckAt?: string
  restartCount: number
  restartReason?: string
  lastError?: SymphonyRuntimeError
}

export interface SymphonyRuntimeCommandResult {
  success: boolean
  status: SymphonyRuntimeStatus
  error?: SymphonyRuntimeError
}

export interface SymphonyRuntimeStatusResponse {
  success: boolean
  status: SymphonyRuntimeStatus
}

export type SymphonyOperatorConnectionState = 'connected' | 'reconnecting' | 'disconnected' | 'inactive'

export type SymphonyOperatorFreshnessStatus = 'fresh' | 'stale'

export interface SymphonyOperatorWorkerRow {
  issueId: string
  identifier: string
  issueTitle: string
  state: string
  toolName: string
  model: string
  lastActivityAt?: string
  lastError?: string
}

export interface SymphonyOperatorEscalationItem {
  requestId: string
  issueId: string
  issueIdentifier: string
  issueTitle: string
  questionPreview: string
  createdAt: string
  timeoutMs: number
}

export interface SymphonyEscalationResponseResult {
  requestId: string
  ok: boolean
  status: number
  message: string
  submittedAt: string
  completedAt: string
}

export interface SymphonyOperatorSnapshot {
  fetchedAt: string
  queueCount: number
  completedCount: number
  workers: SymphonyOperatorWorkerRow[]
  escalations: SymphonyOperatorEscalationItem[]
  connection: {
    state: SymphonyOperatorConnectionState
    updatedAt: string
    lastError?: string
    lastEventSequence?: number
    lastBaselineRefreshAt?: string
  }
  freshness: {
    status: SymphonyOperatorFreshnessStatus
    staleReason?: string
  }
  response: {
    submittingRequestId?: string
    lastResult?: SymphonyEscalationResponseResult
  }
}

export interface SymphonyOperatorSnapshotResponse {
  success: boolean
  snapshot: SymphonyOperatorSnapshot
}

export interface SymphonyEscalationResponseCommandResult {
  success: boolean
  snapshot: SymphonyOperatorSnapshot
  result?: SymphonyEscalationResponseResult
}

export type McpServerTransport = 'stdio' | 'http'

export type McpServerAuthMode = 'none' | 'bearer'

export interface McpConfigProvenance {
  mode: 'global_only' | 'overlay_present'
  globalConfigPath: string
  overlayConfigPath?: string
  warning?: string
}

export interface McpValidationError {
  field: string
  code: 'REQUIRED' | 'INVALID_FORMAT' | 'INVALID_VALUE'
  message: string
}

export interface McpStdioServerSummary {
  transport: 'stdio'
  command: string
  args: string[]
  envKeys: string[]
  cwd?: string
}

export interface McpHttpServerSummary {
  transport: 'http'
  url: string
  auth: McpServerAuthMode
  bearerTokenEnv?: string
  hasInlineBearerToken: boolean
}

export type McpServerSummaryTransport = McpStdioServerSummary | McpHttpServerSummary

/**
 * How a server's tools are registered with the agent:
 * - `false` / undefined — proxy-only (default). Tools are discovered via the
 *   single `mcp` proxy tool; cheap on context, higher discovery friction.
 * - `true` — every tool from this server is registered as a first-class
 *   agent tool alongside read/bash/edit/etc.
 * - `string[]` — allowlist. Only the named tools are promoted; the rest stay
 *   behind the proxy.
 *
 * See pi-mcp-adapter README for details.
 */
export type McpDirectTools = boolean | readonly string[]

export interface McpServerSummary {
  name: string
  transport: McpServerTransport
  enabled: boolean
  summary: McpServerSummaryTransport
  directTools?: McpDirectTools
}

export interface McpStdioServerInput {
  name: string
  transport: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
  directTools?: McpDirectTools
}

export interface McpHttpServerInput {
  name: string
  transport: 'http'
  url: string
  auth?: McpServerAuthMode
  bearerToken?: string
  bearerTokenEnv?: string
  enabled?: boolean
  directTools?: McpDirectTools
}

export type McpServerInput = McpStdioServerInput | McpHttpServerInput

export interface McpConfigReadResponse {
  success: boolean
  provenance: McpConfigProvenance
  servers: McpServerSummary[]
  error?: {
    code:
      | 'CONFIG_UNREADABLE'
      | 'MALFORMED_CONFIG'
      | 'INVALID_CONFIG_SHAPE'
      | 'SERVER_NOT_FOUND'
      | 'WRITE_FAILED'
      | 'READBACK_FAILED'
      | 'VALIDATION_FAILED'
      | 'UNKNOWN'
    message: string
  }
}

export interface McpServerResponse {
  success: boolean
  provenance: McpConfigProvenance
  server?: McpServerSummary
  validationErrors?: McpValidationError[]
  error?: {
    code:
      | 'CONFIG_UNREADABLE'
      | 'MALFORMED_CONFIG'
      | 'INVALID_CONFIG_SHAPE'
      | 'SERVER_NOT_FOUND'
      | 'WRITE_FAILED'
      | 'READBACK_FAILED'
      | 'VALIDATION_FAILED'
      | 'UNKNOWN'
    message: string
  }
}

export interface McpServerMutationResponse {
  success: boolean
  provenance: McpConfigProvenance
  server?: McpServerSummary
  validationErrors?: McpValidationError[]
  error?: {
    code:
      | 'CONFIG_UNREADABLE'
      | 'MALFORMED_CONFIG'
      | 'INVALID_CONFIG_SHAPE'
      | 'SERVER_NOT_FOUND'
      | 'WRITE_FAILED'
      | 'READBACK_FAILED'
      | 'VALIDATION_FAILED'
      | 'UNKNOWN'
    message: string
  }
}

export interface McpServerDeleteResponse {
  success: boolean
  provenance: McpConfigProvenance
  deletedServerName?: string
  error?: {
    code:
      | 'CONFIG_UNREADABLE'
      | 'MALFORMED_CONFIG'
      | 'INVALID_CONFIG_SHAPE'
      | 'SERVER_NOT_FOUND'
      | 'WRITE_FAILED'
      | 'READBACK_FAILED'
      | 'UNKNOWN'
    message: string
  }
}

export interface McpServerStatus {
  serverName: string
  phase: 'connected' | 'configured' | 'error' | 'unsupported'
  checkedAt: string
  toolNames: string[]
  toolCount: number
  error?: {
    code:
      | 'MALFORMED_CONFIG'
      | 'SERVER_NOT_FOUND'
      | 'COMMAND_NOT_FOUND'
      | 'CONNECTION_FAILED'
      | 'TIMEOUT'
      | 'UNREACHABLE'
      | 'MISSING_BEARER_TOKEN'
      | 'PROTOCOL_ERROR'
      | 'UNKNOWN'
    message: string
  }
}

export interface McpServerStatusResponse {
  success: boolean
  status?: McpServerStatus
  error?: {
    code:
      | 'MALFORMED_CONFIG'
      | 'SERVER_NOT_FOUND'
      | 'COMMAND_NOT_FOUND'
      | 'CONNECTION_FAILED'
      | 'TIMEOUT'
      | 'UNREACHABLE'
      | 'MISSING_BEARER_TOKEN'
      | 'PROTOCOL_ERROR'
      | 'UNKNOWN'
    message: string
  }
}

export type ReliabilityClass = 'config' | 'auth' | 'network' | 'process' | 'stale' | 'unknown'

export type ReliabilitySeverity = 'info' | 'warning' | 'error' | 'critical'

export type ReliabilityRecoveryAction =
  | 'fix_config'
  | 'reauthenticate'
  | 'retry_request'
  | 'restart_process'
  | 'reconnect'
  | 'refresh_state'
  | 'inspect'

export type ReliabilityRecoveryOutcome = 'pending' | 'succeeded' | 'failed' | 'none'

export type ReliabilitySourceSurface = 'chat_runtime' | 'workflow_board' | 'symphony' | 'mcp'

export interface ReliabilityDiagnostics {
  code?: string
  detail?: string
  occurredAt?: string
  serverName?: string
}

export interface ReliabilitySignal {
  code: string
  class: ReliabilityClass
  severity: ReliabilitySeverity
  sourceSurface: ReliabilitySourceSurface
  recoveryAction: ReliabilityRecoveryAction
  outcome: ReliabilityRecoveryOutcome
  message: string
  timestamp: string
  staleSince?: string
  lastKnownGoodAt?: string
  diagnostics?: ReliabilityDiagnostics
}

export interface ReliabilitySurfaceState {
  sourceSurface: ReliabilitySourceSurface
  status: 'healthy' | 'degraded'
  signal: ReliabilitySignal | null
  updatedAt: string
  lastHealthyAt?: string
}

export interface ReliabilitySnapshot {
  generatedAt: string
  overallStatus: 'healthy' | 'degraded'
  surfaces: ReliabilitySurfaceState[]
  firstRunReadiness?: FirstRunReadinessSnapshot
}

export interface ReliabilityStatusResponse {
  success: boolean
  snapshot: ReliabilitySnapshot
}

export type StabilityMetricName =
  | 'eventLoopLagMs'
  | 'heapGrowthMb'
  | 'staleAgeMs'
  | 'reconnectSuccessRate'
  | 'recoveryLatencyMs'
  | 'a11yViolationCounts'

export type StabilityHealthStatus = 'healthy' | 'degraded' | 'breached'

export interface A11yViolationCounts {
  minor: number
  moderate: number
  serious: number
  critical: number
}

export interface StabilityMetricSnapshot {
  eventLoopLagMs: number
  heapGrowthMb: number
  staleAgeMs: number
  reconnectSuccessRate: number
  recoveryLatencyMs: number
  a11yViolationCounts: A11yViolationCounts
  collectedAt: string
}

export interface StabilityThresholdBand {
  warning: number
  breach: number
  comparator: 'max' | 'min'
}

export interface StabilityThresholdSet {
  version: string
  eventLoopLagMs: StabilityThresholdBand
  heapGrowthMb: StabilityThresholdBand
  staleAgeMs: StabilityThresholdBand
  reconnectSuccessRate: StabilityThresholdBand
  recoveryLatencyMs: StabilityThresholdBand
  a11yViolationCounts: {
    serious: StabilityThresholdBand
    critical: StabilityThresholdBand
  }
}

export interface ThresholdBreach {
  code: string
  metric: StabilityMetricName
  sourceSurface: ReliabilitySourceSurface
  failureClass: ReliabilityClass
  severity: ReliabilitySeverity
  recoveryAction: ReliabilityRecoveryAction
  comparator: 'max' | 'min'
  observedValue: number
  warningThreshold: number
  breachThreshold: number
  breached: boolean
  message: string
  suggestedRecovery: string
  timestamp: string
  lastKnownGoodAt?: string
}

export interface StabilitySnapshot {
  version: string
  status: StabilityHealthStatus
  metrics: StabilityMetricSnapshot
  thresholds: StabilityThresholdSet
  breaches: ThresholdBreach[]
  generatedAt: string
  lastKnownGoodAt?: string
}

export type StabilityMetricInput = Partial<
  Omit<StabilityMetricSnapshot, 'a11yViolationCounts' | 'collectedAt'>
> & {
  a11yViolationCounts?: Partial<A11yViolationCounts>
  collectedAt?: string
}

export interface StabilitySnapshotResponse {
  success: boolean
  snapshot: StabilitySnapshot
}

export interface ReliabilityRecoveryRequest {
  sourceSurface: ReliabilitySourceSurface
  action?: ReliabilityRecoveryAction
  /** Server identity for server-scoped MCP recovery actions (e.g. reconnect). */
  serverName?: string
}

export interface ReliabilityRecoveryResult {
  success: boolean
  sourceSurface: ReliabilitySourceSurface
  action: ReliabilityRecoveryAction
  outcome: 'succeeded' | 'failed'
  code: string
  message: string
  timestamp: string
}

export type FirstRunCheckpointId = 'auth' | 'model' | 'startup' | 'first_turn'

export type FirstRunCheckpointStatus = 'pass' | 'fail'

export interface FirstRunCheckpointFailure {
  class: ReliabilityClass
  severity: ReliabilitySeverity
  code: string
  message: string
  recoveryAction: ReliabilityRecoveryAction
  recoverable: boolean
  timestamp: string
  detail?: string
}

export interface FirstRunCheckpointState {
  checkpoint: FirstRunCheckpointId
  status: FirstRunCheckpointStatus
  blockedBy?: FirstRunCheckpointId
  failure?: FirstRunCheckpointFailure
}

export interface FirstRunProviderState {
  provider: AuthProvider
  status: ProviderStatus
  configured: boolean
  requiresKey: boolean
  maskedKey?: string
}

export type FirstRunProviderStateMap = Record<AuthProvider, FirstRunProviderState>

export interface FirstRunReadinessSnapshot {
  generatedAt: string
  providers: FirstRunProviderStateMap
  selectedProvider: AuthProvider | null
  selectedModel: string | null
  availableModelCount: number
  completedFirstTurn: boolean
  checkpoints: Record<FirstRunCheckpointId, FirstRunCheckpointState>
  blockedCheckpoint: FirstRunCheckpointId | null
  overallStatus: 'ready' | 'blocked'
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
  getSlashCommands: () => Promise<SlashCommandsResponse>
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
    getGitInfo: () => Promise<WorkspaceGitInfo>
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
    setBoardActive: (active: boolean) => Promise<WorkflowBoardLifecycleResponse>
    setScope: (request: WorkflowBoardScopeRequest | string) => Promise<WorkflowBoardScopeResponse>
    moveEntity: (request: WorkflowMoveEntityRequest) => Promise<WorkflowMoveEntityResult>
    createTask: (request: WorkflowCreateTaskRequest) => Promise<WorkflowCreateTaskResult>
    getTaskDetail: (request: WorkflowTaskDetailRequest) => Promise<WorkflowTaskDetailResponse>
    updateTask: (request: WorkflowUpdateTaskRequest) => Promise<WorkflowUpdateTaskResult>
    respondToEscalation: (
      request: WorkflowBoardEscalationResponseRequest,
    ) => Promise<WorkflowBoardEscalationResponseResult>
    openIssue: (request: WorkflowBoardOpenIssueRequest) => Promise<WorkflowBoardOpenIssueResult>
    getContext: () => Promise<WorkflowContextResponse>
    dispatchShellAction: (
      request: WorkflowShellActionRequest,
    ) => Promise<WorkflowShellActionDispatchResult>
    onShellAction: (listener: (event: WorkflowShellActionEvent) => void) => () => void
  }
  symphony: {
    getStatus: () => Promise<SymphonyRuntimeStatusResponse>
    start: () => Promise<SymphonyRuntimeCommandResult>
    stop: () => Promise<SymphonyRuntimeCommandResult>
    restart: () => Promise<SymphonyRuntimeCommandResult>
    onStatus: (listener: (status: SymphonyRuntimeStatus) => void) => () => void
    getDashboardSnapshot: () => Promise<SymphonyOperatorSnapshotResponse>
    refreshDashboardSnapshot: () => Promise<SymphonyOperatorSnapshotResponse>
    respondToEscalation: (
      requestId: string,
      responseText: string,
    ) => Promise<SymphonyEscalationResponseCommandResult>
    onDashboardSnapshot: (listener: (snapshot: SymphonyOperatorSnapshot) => void) => () => void
  }
  mcp: {
    listServers: () => Promise<McpConfigReadResponse>
    getServer: (name: string) => Promise<McpServerResponse>
    saveServer: (input: McpServerInput) => Promise<McpServerMutationResponse>
    deleteServer: (name: string) => Promise<McpServerDeleteResponse>
    refreshStatus: (name: string) => Promise<McpServerStatusResponse>
    reconnectServer: (name: string) => Promise<McpServerStatusResponse>
  }
  reliability: {
    getStatus: () => Promise<ReliabilityStatusResponse>
    getStabilitySnapshot: () => Promise<StabilitySnapshotResponse>
    requestRecoveryAction: (
      request: ReliabilityRecoveryRequest,
    ) => Promise<ReliabilityRecoveryResult>
    onStatus: (listener: (snapshot: ReliabilitySnapshot) => void) => () => void
    onStabilitySnapshot: (listener: (snapshot: StabilitySnapshot) => void) => () => void
  }
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
