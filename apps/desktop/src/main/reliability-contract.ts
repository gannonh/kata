import type {
  BridgeStatusEvent,
  McpConfigReadResponse,
  McpServerStatus,
  McpServerStatusResponse,
  ReliabilityClass,
  ReliabilityRecoveryAction,
  ReliabilityRecoveryOutcome,
  ReliabilitySeverity,
  ReliabilitySignal,
  ReliabilitySourceSurface,
  SymphonyOperatorSnapshot,
  SymphonyRuntimeErrorCode,
  SymphonyRuntimeStatus,
  WorkflowBoardErrorCode,
  WorkflowBoardSnapshot,
} from '../shared/types'

const SOURCE_CODE: Record<ReliabilitySourceSurface, string> = {
  chat_runtime: 'CHAT',
  workflow_board: 'WORKFLOW',
  symphony: 'SYMPHONY',
  mcp: 'MCP',
}

const CLASS_CODE: Record<ReliabilityClass, string> = {
  config: 'CONFIG',
  auth: 'AUTH',
  network: 'NETWORK',
  process: 'PROCESS',
  stale: 'STALE',
  unknown: 'UNKNOWN',
}

export const RELIABILITY_CLASS_DEFAULTS: Record<
  ReliabilityClass,
  { severity: ReliabilitySeverity; recoveryAction: ReliabilityRecoveryAction }
> = {
  config: {
    severity: 'warning',
    recoveryAction: 'fix_config',
  },
  auth: {
    severity: 'error',
    recoveryAction: 'reauthenticate',
  },
  network: {
    severity: 'error',
    recoveryAction: 'reconnect',
  },
  process: {
    severity: 'critical',
    recoveryAction: 'restart_process',
  },
  stale: {
    severity: 'warning',
    recoveryAction: 'refresh_state',
  },
  unknown: {
    severity: 'error',
    recoveryAction: 'inspect',
  },
}

const WORKFLOW_ERROR_CLASS: Record<WorkflowBoardErrorCode, ReliabilityClass> = {
  NOT_CONFIGURED: 'config',
  INVALID_CONFIG: 'config',
  MISSING_API_KEY: 'auth',
  UNAUTHORIZED: 'auth',
  NOT_FOUND: 'unknown',
  RATE_LIMITED: 'network',
  NETWORK: 'network',
  GRAPHQL: 'network',
  UNKNOWN: 'unknown',
}

const SYMPHONY_RUNTIME_ERROR_CLASS: Record<SymphonyRuntimeErrorCode, ReliabilityClass> = {
  CONFIG_MISSING: 'config',
  CONFIG_INVALID: 'config',
  WORKFLOW_PATH_MISSING: 'config',
  BINARY_NOT_FOUND: 'config',
  SPAWN_FAILED: 'process',
  PROCESS_EXITED: 'process',
  READINESS_FAILED: 'network',
  STOP_TIMEOUT: 'process',
  UNKNOWN: 'unknown',
}

const MCP_ERROR_CLASS: Record<string, ReliabilityClass> = {
  CONFIG_UNREADABLE: 'config',
  MALFORMED_CONFIG: 'config',
  INVALID_CONFIG_SHAPE: 'config',
  SERVER_NOT_FOUND: 'config',
  WRITE_FAILED: 'config',
  READBACK_FAILED: 'config',
  VALIDATION_FAILED: 'config',
  MISSING_BEARER_TOKEN: 'auth',
  COMMAND_NOT_FOUND: 'process',
  PROTOCOL_ERROR: 'process',
  CONNECTION_FAILED: 'network',
  UNREACHABLE: 'network',
  TIMEOUT: 'network',
  UNKNOWN: 'unknown',
}

const RELIABILITY_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1***'],
  [/(api[_-]?key\s*[=:]\s*)([^\s]+)/gi, '$1***'],
  [/(token\s*[=:]\s*)([^\s]+)/gi, '$1***'],
  [/(authorization\s*[=:]\s*bearer\s+)([^\s]+)/gi, '$1***'],
  [/(bearer\s+)([A-Za-z0-9._-]+)/gi, '$1***'],
]

export function redactReliabilityText(value: string | undefined | null): string {
  const input = value?.trim()
  if (!input) {
    return ''
  }

  return RELIABILITY_SECRET_PATTERNS.reduce((sanitized, [pattern, replacement]) => {
    return sanitized.replace(pattern, replacement)
  }, input)
}

function normalizeCodeFragment(value: string | undefined, fallback = 'GENERAL'): string {
  const normalized =
    value
      ?.trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() ?? ''

  if (!normalized) {
    return fallback
  }

  return normalized.slice(0, 32)
}

export function buildReliabilityCode(
  sourceSurface: ReliabilitySourceSurface,
  reliabilityClass: ReliabilityClass,
  sourceCode?: string,
): string {
  const source = SOURCE_CODE[sourceSurface]
  const category = CLASS_CODE[reliabilityClass]
  const suffix = normalizeCodeFragment(sourceCode, 'GENERAL')
  return `REL-${source}-${category}-${suffix}`
}

function toSignal(input: {
  sourceSurface: ReliabilitySourceSurface
  reliabilityClass: ReliabilityClass
  sourceCode?: string
  message: string
  timestamp?: string
  outcome?: ReliabilityRecoveryOutcome
  staleSince?: string
  lastKnownGoodAt?: string
  diagnostics?: {
    code?: string
    detail?: string
    occurredAt?: string
  }
  severity?: ReliabilitySeverity
  recoveryAction?: ReliabilityRecoveryAction
}): ReliabilitySignal {
  const defaults = RELIABILITY_CLASS_DEFAULTS[input.reliabilityClass]
  return {
    code: buildReliabilityCode(input.sourceSurface, input.reliabilityClass, input.sourceCode),
    class: input.reliabilityClass,
    severity: input.severity ?? defaults.severity,
    sourceSurface: input.sourceSurface,
    recoveryAction: input.recoveryAction ?? defaults.recoveryAction,
    outcome: input.outcome ?? 'pending',
    message: redactReliabilityText(input.message) || 'Reliability issue detected.',
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.staleSince ? { staleSince: input.staleSince } : {}),
    ...(input.lastKnownGoodAt ? { lastKnownGoodAt: input.lastKnownGoodAt } : {}),
    ...(input.diagnostics
      ? {
          diagnostics: {
            ...(input.diagnostics.code ? { code: normalizeCodeFragment(input.diagnostics.code) } : {}),
            ...(input.diagnostics.detail
              ? {
                  detail: redactReliabilityText(input.diagnostics.detail),
                }
              : {}),
            ...(input.diagnostics.occurredAt ? { occurredAt: input.diagnostics.occurredAt } : {}),
          },
        }
      : {}),
  }
}

function classifyMessageFallback(message: string | undefined): ReliabilityClass {
  const normalized = (message ?? '').toLowerCase()

  if (/api[ _-]?key|unauthori[sz]ed|forbidden|token|auth/.test(normalized)) {
    return 'auth'
  }

  if (/network|timed? out|econn|enotfound|fetch|socket/.test(normalized)) {
    return 'network'
  }

  if (/config|preferences|\.kata|mcp\.json|workflow\.md|missing/.test(normalized)) {
    return 'config'
  }

  if (/crash|exit|spawn|subprocess|killed|sig(term|kill|int)/.test(normalized)) {
    return 'process'
  }

  if (/stale/.test(normalized)) {
    return 'stale'
  }

  return 'unknown'
}

export function mapWorkflowBoardSnapshotToReliability(
  snapshot: WorkflowBoardSnapshot | null | undefined,
): ReliabilitySignal | null {
  if (!snapshot) {
    return null
  }

  if (snapshot.status === 'stale') {
    const errorCode = snapshot.lastError?.code
    const reliabilityClass = errorCode ? WORKFLOW_ERROR_CLASS[errorCode] ?? 'stale' : 'stale'

    return toSignal({
      sourceSurface: 'workflow_board',
      reliabilityClass,
      sourceCode: errorCode ?? 'STALE',
      message: snapshot.lastError?.message ?? 'Workflow board snapshot is stale.',
      timestamp: snapshot.fetchedAt,
      staleSince: snapshot.poll.lastSuccessAt,
      lastKnownGoodAt: snapshot.poll.lastSuccessAt,
      outcome: 'pending',
      ...(snapshot.lastError ? { diagnostics: { code: snapshot.lastError.code } } : {}),
    })
  }

  if (snapshot.status === 'error' || snapshot.lastError) {
    const errorCode = snapshot.lastError?.code ?? 'UNKNOWN'
    const reliabilityClass = WORKFLOW_ERROR_CLASS[errorCode] ?? classifyMessageFallback(snapshot.lastError?.message)

    return toSignal({
      sourceSurface: 'workflow_board',
      reliabilityClass,
      sourceCode: errorCode,
      message: snapshot.lastError?.message ?? 'Workflow board failed to refresh.',
      timestamp: snapshot.fetchedAt,
      lastKnownGoodAt: snapshot.poll.lastSuccessAt,
      outcome: snapshot.status === 'error' ? 'failed' : 'pending',
      diagnostics: {
        code: errorCode,
      },
    })
  }

  return null
}

export function mapSymphonyRuntimeStatusToReliability(
  status: SymphonyRuntimeStatus | null | undefined,
): ReliabilitySignal | null {
  if (!status) {
    return null
  }

  if (status.phase === 'ready') {
    return null
  }

  if (status.phase === 'starting' || status.phase === 'restarting') {
    return toSignal({
      sourceSurface: 'symphony',
      reliabilityClass: 'process',
      sourceCode: 'RESTARTING',
      message: status.lastError?.message ?? 'Symphony runtime is recovering.',
      timestamp: status.updatedAt,
      outcome: 'pending',
      severity: 'warning',
      recoveryAction: 'restart_process',
      diagnostics: {
        code: status.lastError?.code,
        detail: status.lastError?.details,
      },
    })
  }

  if (status.phase === 'idle' || status.phase === 'stopped') {
    return null
  }

  const runtimeCode = status.lastError?.code ?? (status.phase === 'disconnected' ? 'READINESS_FAILED' : 'UNKNOWN')
  const reliabilityClass = SYMPHONY_RUNTIME_ERROR_CLASS[runtimeCode] ?? classifyMessageFallback(status.lastError?.message)

  return toSignal({
    sourceSurface: 'symphony',
    reliabilityClass,
    sourceCode: runtimeCode,
    message: status.lastError?.message ?? `Symphony runtime is ${status.phase}.`,
    timestamp: status.updatedAt,
    outcome: status.phase === 'failed' || status.phase === 'config_error' ? 'failed' : 'pending',
    diagnostics: {
      code: runtimeCode,
      detail: status.lastError?.details,
    },
  })
}

export function mapSymphonyOperatorSnapshotToReliability(
  snapshot: SymphonyOperatorSnapshot | null | undefined,
): ReliabilitySignal | null {
  if (!snapshot) {
    return null
  }

  if (snapshot.response.lastResult && !snapshot.response.lastResult.ok) {
    const statusCode = snapshot.response.lastResult.status
    const reliabilityClass =
      statusCode === 401 || statusCode === 403
        ? 'auth'
        : statusCode >= 500 || statusCode === 0
          ? 'network'
          : 'unknown'

    return toSignal({
      sourceSurface: 'symphony',
      reliabilityClass,
      sourceCode: `RESPOND_${statusCode || 'FAILED'}`,
      message: snapshot.response.lastResult.message,
      timestamp: snapshot.response.lastResult.completedAt,
      outcome: 'failed',
      diagnostics: {
        occurredAt: snapshot.response.lastResult.submittedAt,
      },
    })
  }

  if (snapshot.connection.state === 'disconnected') {
    return toSignal({
      sourceSurface: 'symphony',
      reliabilityClass: 'network',
      sourceCode: 'DISCONNECTED',
      message: snapshot.connection.lastError ?? 'Symphony operator is disconnected.',
      timestamp: snapshot.connection.updatedAt,
      outcome: 'pending',
    })
  }

  if (snapshot.connection.state === 'reconnecting') {
    return toSignal({
      sourceSurface: 'symphony',
      reliabilityClass: 'network',
      sourceCode: 'RECONNECTING',
      message: snapshot.connection.lastError ?? 'Symphony operator is reconnecting.',
      timestamp: snapshot.connection.updatedAt,
      outcome: 'pending',
      severity: 'warning',
      recoveryAction: 'reconnect',
    })
  }

  if (snapshot.freshness.status === 'stale') {
    return toSignal({
      sourceSurface: 'symphony',
      reliabilityClass: 'stale',
      sourceCode: 'STALE',
      message: snapshot.freshness.staleReason ?? 'Symphony operator snapshot is stale.',
      timestamp: snapshot.connection.updatedAt,
      staleSince: snapshot.connection.lastBaselineRefreshAt,
      lastKnownGoodAt: snapshot.connection.lastBaselineRefreshAt,
      outcome: 'pending',
    })
  }

  return null
}

function classifyMcpCode(code: string | undefined, message: string | undefined): ReliabilityClass {
  if (code) {
    return MCP_ERROR_CLASS[code] ?? 'unknown'
  }
  return classifyMessageFallback(message)
}

export function mapMcpConfigReadResponseToReliability(
  response: McpConfigReadResponse | null | undefined,
): ReliabilitySignal | null {
  if (!response || response.success || !response.error) {
    return null
  }

  const reliabilityClass = classifyMcpCode(response.error.code, response.error.message)
  return toSignal({
    sourceSurface: 'mcp',
    reliabilityClass,
    sourceCode: response.error.code,
    message: response.error.message,
    diagnostics: {
      code: response.error.code,
    },
    outcome: 'failed',
  })
}

export function mapMcpServerStatusToReliability(
  status: McpServerStatus | null | undefined,
): ReliabilitySignal | null {
  if (!status || status.phase !== 'error' || !status.error) {
    return null
  }

  const reliabilityClass = classifyMcpCode(status.error.code, status.error.message)
  return toSignal({
    sourceSurface: 'mcp',
    reliabilityClass,
    sourceCode: status.error.code,
    message: status.error.message,
    timestamp: status.checkedAt,
    diagnostics: {
      code: status.error.code,
    },
    outcome: 'failed',
  })
}

export function mapMcpStatusResponseToReliability(
  response: McpServerStatusResponse | null | undefined,
): ReliabilitySignal | null {
  if (!response) {
    return null
  }

  if (response.status) {
    return mapMcpServerStatusToReliability(response.status)
  }

  if (response.error) {
    const reliabilityClass = classifyMcpCode(response.error.code, response.error.message)
    return toSignal({
      sourceSurface: 'mcp',
      reliabilityClass,
      sourceCode: response.error.code,
      message: response.error.message,
      diagnostics: {
        code: response.error.code,
      },
      outcome: 'failed',
    })
  }

  return null
}

export function mapChatBridgeStatusToReliability(
  status: BridgeStatusEvent | null | undefined,
): ReliabilitySignal | null {
  if (!status || status.state !== 'crashed') {
    return null
  }

  const sourceCode =
    status.exitCode !== null && status.exitCode !== undefined
      ? `EXIT_${status.exitCode}`
      : status.signal
        ? `SIGNAL_${status.signal}`
        : 'CRASHED'
  const reliabilityClass = sourceCode === 'CRASHED' ? classifyMessageFallback(status.message) : 'process'

  return toSignal({
    sourceSurface: 'chat_runtime',
    reliabilityClass,
    sourceCode,
    message: status.message ?? 'Chat runtime crashed.',
    timestamp: new Date(status.updatedAt).toISOString(),
    outcome: 'failed',
  })
}

export function mapChatSubprocessCrashToReliability(input: {
  message: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  stderrLines: string[]
  timestamp?: string
}): ReliabilitySignal {
  const sourceCode =
    input.exitCode !== null && input.exitCode !== undefined
      ? `EXIT_${input.exitCode}`
      : input.signal
        ? `SIGNAL_${input.signal}`
        : 'CRASHED'

  const message = input.stderrLines.at(-1) ?? input.message
  const reliabilityClass =
    input.exitCode !== null || input.signal !== null ? 'process' : classifyMessageFallback(message)

  return toSignal({
    sourceSurface: 'chat_runtime',
    reliabilityClass,
    sourceCode,
    message,
    timestamp: input.timestamp ?? new Date().toISOString(),
    diagnostics: {
      detail: input.stderrLines.join(' | '),
    },
    outcome: 'failed',
  })
}

export function pickPrimaryReliabilitySignal(
  signals: Array<ReliabilitySignal | null | undefined>,
): ReliabilitySignal | null {
  const candidates = signals.filter((signal): signal is ReliabilitySignal => Boolean(signal))
  if (candidates.length === 0) {
    return null
  }

  const severityRank: Record<ReliabilitySeverity, number> = {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3,
  }

  return candidates.reduce((selected, candidate) => {
    if (severityRank[candidate.severity] > severityRank[selected.severity]) {
      return candidate
    }

    if (severityRank[candidate.severity] < severityRank[selected.severity]) {
      return selected
    }

    return candidate.timestamp > selected.timestamp ? candidate : selected
  })
}
